using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System.Data;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class SalesController : ControllerBase
    {
        private readonly BmsPosDbContext _context;
        private readonly IUserActivityService _userActivityService;

        public SalesController(BmsPosDbContext context, IUserActivityService userActivityService)
        {
            _context = context;
            _userActivityService = userActivityService;
        }

        // GET: api/sales
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Sale>>> GetSales([FromQuery] int? days = null)
        {
            var query = _context.Sales
                .Include(s => s.Employee)
                .Include(s => s.SaleItems)
                .ThenInclude(si => si.Product)
                .Where(s => s.Status == "Completed");

            // Apply date filter if days parameter is provided
            if (days.HasValue)
            {
                var currentTime = DateTime.UtcNow;
                var cutoffDate = currentTime.AddDays(-days.Value);
                query = query.Where(s => s.SaleDate >= cutoffDate);
            }

            return await query
                .OrderByDescending(s => s.SaleDate)
                .ToListAsync();
        }

        // GET: api/sales/search?transactionId=TXN-20260318-ABCD1234
        // Accepts the full transaction ID or just the last 8 characters (as printed on receipts).
        [HttpGet("search")]
        public async Task<ActionResult<Sale>> SearchSale([FromQuery] string transactionId)
        {
            if (string.IsNullOrWhiteSpace(transactionId))
                return BadRequest("transactionId query parameter is required.");

            var term = transactionId.Trim();

            var sale = await _context.Sales
                .Include(s => s.Employee)
                .Include(s => s.SaleItems)
                    .ThenInclude(si => si.Product)
                .Where(s => s.Status == "Completed")
                .FirstOrDefaultAsync(s =>
                    s.TransactionId == term ||
                    s.TransactionId.EndsWith(term));

            if (sale == null)
                return NotFound();

            return sale;
        }

        // GET: api/sales/5
        [HttpGet("{id}")]
        public async Task<ActionResult<Sale>> GetSale(int id)
        {
            var sale = await _context.Sales
                .Include(s => s.Employee)
                .Include(s => s.SaleItems)
                .ThenInclude(si => si.Product)
                .FirstOrDefaultAsync(s => s.Id == id);

            if (sale == null)
            {
                return NotFound();
            }

            return sale;
        }

        // POST: api/sales
        [HttpPost]
        public async Task<ActionResult<Sale>> CreateSale(SaleCreateRequest request)
        {
            if (request.Items == null || request.Items.Count == 0)
                return BadRequest("Sale must contain at least one item.");
            if (request.DiscountAmount < 0)
                return BadRequest("Discount amount cannot be negative.");
            if (request.DiscountAmount > request.Subtotal)
                return BadRequest("Discount cannot exceed the subtotal.");
            if (request.Total < 0)
                return BadRequest("Total cannot be negative.");
            if (request.AmountPaid < request.Total)
                return BadRequest("Amount paid is less than the total.");
            if (!string.IsNullOrEmpty(request.DiscountReason) && request.DiscountReason.Length > 100)
                return BadRequest("Discount reason cannot exceed 100 characters.");
            foreach (var item in request.Items)
            {
                if (item.Quantity <= 0)
                    return BadRequest("Item quantity must be greater than zero.");
                if (item.UnitPrice < 0)
                    return BadRequest("Item unit price cannot be negative.");
            }

            // Idempotency check — return existing sale if this key was already processed
            var idempotencyKey = Request.Headers["X-Idempotency-Key"].FirstOrDefault();
            if (!string.IsNullOrEmpty(idempotencyKey))
            {
                var existing = await _context.Sales
                    .Include(s => s.Employee)
                    .Include(s => s.SaleItems).ThenInclude(si => si.Product)
                    .FirstOrDefaultAsync(s => s.IdempotencyKey == idempotencyKey);
                if (existing != null)
                    return Ok(existing);
            }

            // Validate employee
            var employee = await _context.Employees.FindAsync(request.EmployeeId);
            if (employee == null)
                return BadRequest("Invalid employee ID");

            var currentTime = DateTime.UtcNow;
            var transactionId = $"TXN-{currentTime:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpper()}";

            // Product fetch and stock validation must happen inside the serializable transaction.
            // Doing it outside means two concurrent requests can both pass the check before either
            // decrements stock, causing an oversell.
            await using var tx = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            try
            {
                var productIds = request.Items.Select(i => i.ProductId).ToList();
                var products = await _context.Products
                    .Where(p => productIds.Contains(p.Id))
                    .ToDictionaryAsync(p => p.Id);

                foreach (var item in request.Items)
                {
                    if (!products.TryGetValue(item.ProductId, out var product))
                    {
                        await tx.RollbackAsync();
                        return BadRequest($"Invalid product ID: {item.ProductId}");
                    }
                    if (product.StockQuantity < item.Quantity)
                    {
                        await tx.RollbackAsync();
                        return BadRequest($"Insufficient stock for {product.Name}. Available: {product.StockQuantity}, Requested: {item.Quantity}");
                    }
                }

                var sale = new Sale
                {
                    TransactionId = transactionId,
                    EmployeeId = request.EmployeeId,
                    SaleDate = currentTime,
                    Subtotal = request.Subtotal,
                    TaxRate = request.TaxRate,
                    TaxAmount = request.TaxAmount,
                    DiscountAmount = request.DiscountAmount,
                    DiscountReason = request.DiscountReason,
                    Total = request.Total,
                    AmountPaid = request.AmountPaid,
                    Change = request.Change,
                    PaymentMethod = request.PaymentMethod,
                    Status = "Completed",
                    Notes = request.Notes,
                    IdempotencyKey = string.IsNullOrEmpty(idempotencyKey) ? null : idempotencyKey
                };

                _context.Sales.Add(sale);
                await _context.SaveChangesAsync(); // Needed to get sale.Id for SaleItems

                foreach (var item in request.Items)
                {
                    var product = products[item.ProductId];

                    _context.SaleItems.Add(new SaleItem
                    {
                        SaleId = sale.Id,
                        ProductId = item.ProductId,
                        Quantity = item.Quantity,
                        UnitPrice = item.UnitPrice,
                        LineTotal = item.LineTotal,
                        ProductName = product.Name,
                        ProductBarcode = product.Barcode
                    });

                    product.StockQuantity -= item.Quantity;
                    product.LastUpdated = currentTime;
                }

                await _context.SaveChangesAsync();
                await tx.CommitAsync();

                // Log activity outside transaction — non-critical, failure here doesn't affect the sale
                var itemsSummary = string.Join(", ", request.Items.Select(i => $"{i.Quantity}x {i.ProductId}"));
                await _userActivityService.LogActivityAsync(
                    request.EmployeeId,
                    employee.Name ?? employee.EmployeeId,
                    $"Processed sale: {itemsSummary} - Total: {request.Total:C}",
                    $"Payment: {request.PaymentMethod}, Items: {request.Items.Count}, Discount: {request.DiscountAmount:C}",
                    "Sale",
                    sale.Id,
                    "SALE",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );

                var completeSale = await _context.Sales
                    .Include(s => s.Employee)
                    .Include(s => s.SaleItems)
                    .ThenInclude(si => si.Product)
                    .FirstOrDefaultAsync(s => s.Id == sale.Id);

                return CreatedAtAction(nameof(GetSale), new { id = sale.Id }, completeSale);
            }
            catch (Exception ex) when (ex is Npgsql.PostgresException pg && pg.SqlState == "23505")
            {
                // unique_violation — idempotency key already exists; return the committed sale
                await tx.RollbackAsync();
                if (!string.IsNullOrEmpty(idempotencyKey))
                {
                    var duplicate = await _context.Sales
                        .Include(s => s.Employee)
                        .Include(s => s.SaleItems).ThenInclude(si => si.Product)
                        .FirstOrDefaultAsync(s => s.IdempotencyKey == idempotencyKey);
                    if (duplicate != null) return Ok(duplicate);
                }
                throw;
            }
            catch (Exception ex) when (ex is Npgsql.PostgresException pg && pg.SqlState == "40001")
            {
                // serialization_failure — a concurrent transaction won the race.
                // Stock is validated inside the transaction, so the caller can simply retry.
                await tx.RollbackAsync();
                return Conflict("Sale could not be completed due to a concurrent update. Please try again.");
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }

        // GET: api/sales/today
        [HttpGet("today")]
        public async Task<ActionResult<SalesTodayResponse>> GetTodaySales()
        {
            var currentTime = DateTime.UtcNow;
            var today = DateTime.SpecifyKind(currentTime.Date, DateTimeKind.Utc);
            var tomorrow = today.AddDays(1);

            var todaySales = await _context.Sales
                .Where(s => s.SaleDate >= today && s.SaleDate < tomorrow && s.Status == "Completed")
                .Include(s => s.Employee)
                .Include(s => s.SaleItems)
                .ToListAsync();

            var response = new SalesTodayResponse
            {
                Date = today,
                TotalSales = todaySales.Count,
                TotalRevenue = todaySales.Sum(s => s.Total),
                TotalTax = todaySales.Sum(s => s.TaxAmount),
                TotalDiscounts = todaySales.Sum(s => s.DiscountAmount),
                Sales = todaySales.OrderByDescending(s => s.SaleDate).ToList()
            };

            return response;
        }

        // GET: api/sales/this-week
        [HttpGet("this-week")]
        public async Task<ActionResult<SalesSummaryResponse>> GetThisWeekSummary()
        {
            // Get start of current week (Monday)
            var currentTime = DateTime.UtcNow;
            var today = DateTime.SpecifyKind(currentTime.Date, DateTimeKind.Utc);
            var startOfWeek = today.AddDays(-(int)today.DayOfWeek + 1);
            
            var weekSales = await _context.Sales
                .Where(s => s.SaleDate >= startOfWeek && s.SaleDate < today.AddDays(1))
                .ToListAsync();

            var response = new SalesSummaryResponse
            {
                Period = $"Week of {startOfWeek:MMM dd}",
                TotalSales = weekSales.Count,
                TotalRevenue = weekSales.Sum(s => s.Total),
                TotalTax = weekSales.Sum(s => s.TaxAmount),
                TotalDiscounts = weekSales.Sum(s => s.DiscountAmount)
            };

            return response;
        }

        // GET: api/sales/this-month
        [HttpGet("this-month")]
        public async Task<ActionResult<SalesSummaryResponse>> GetThisMonthSummary()
        {
            var currentTime = DateTime.UtcNow;
            var today = DateTime.SpecifyKind(currentTime.Date, DateTimeKind.Utc);
            var startOfMonth = DateTime.SpecifyKind(new DateTime(today.Year, today.Month, 1), DateTimeKind.Utc);
            
            var monthSales = await _context.Sales
                .Where(s => s.SaleDate >= startOfMonth && s.SaleDate < today.AddDays(1))
                .ToListAsync();

            var response = new SalesSummaryResponse
            {
                Period = startOfMonth.ToString("MMMM yyyy"),
                TotalSales = monthSales.Count,
                TotalRevenue = monthSales.Sum(s => s.Total),
                TotalTax = monthSales.Sum(s => s.TaxAmount),
                TotalDiscounts = monthSales.Sum(s => s.DiscountAmount)
            };

            return response;
        }

        // GET: api/sales/top-products
        [HttpGet("top-products")]
        public async Task<ActionResult<List<TopProductResponse>>> GetTopProducts([FromQuery] int days = 7)
        {
            var currentTime = DateTime.UtcNow;
            var cutoffDate = currentTime.AddDays(-days);
            
            var topProducts = await _context.SaleItems
                .Include(si => si.Product)
                .Where(si => si.Sale.SaleDate >= cutoffDate)
                .GroupBy(si => new { si.ProductId, si.ProductName })
                .Select(g => new TopProductResponse
                {
                    ProductName = g.Key.ProductName,
                    TotalQuantitySold = g.Sum(si => si.Quantity),
                    TotalRevenue = g.Sum(si => si.LineTotal),
                    TransactionCount = g.Count()
                })
                .OrderByDescending(tp => tp.TotalQuantitySold)
                .Take(10)
                .ToListAsync();

            return topProducts;
        }

        // GET: api/sales/payment-breakdown
        [HttpGet("payment-breakdown")]
        public async Task<ActionResult<PaymentBreakdownResponse>> GetPaymentBreakdown([FromQuery] string period = "today")
        {
            var currentTime = DateTime.UtcNow;
            var today = DateTime.SpecifyKind(currentTime.Date, DateTimeKind.Utc);
            
            DateTime startDate;
            string periodLabel;
            
            switch (period.ToLower())
            {
                case "week":
                    startDate = today.AddDays(-(int)today.DayOfWeek + 1);
                    periodLabel = $"Week of {startDate:MMM dd}";
                    break;
                case "month":
                    startDate = DateTime.SpecifyKind(new DateTime(today.Year, today.Month, 1), DateTimeKind.Utc);
                    periodLabel = startDate.ToString("MMMM yyyy");
                    break;
                default: // today
                    startDate = today;
                    periodLabel = "Today";
                    break;
            }
            
            var endDate = today.AddDays(1);
            
            var paymentBreakdown = await _context.Sales
                .Where(s => s.SaleDate >= startDate && s.SaleDate < endDate && s.Status == "Completed")
                .GroupBy(s => s.PaymentMethod)
                .Select(g => new PaymentMethodSummary
                {
                    PaymentMethod = g.Key,
                    TotalSales = g.Count(),
                    TotalRevenue = g.Sum(s => s.Total)
                })
                .ToListAsync();

            return new PaymentBreakdownResponse
            {
                Period = periodLabel,
                PaymentMethods = paymentBreakdown
            };
        }

        // GET: api/sales/tax-summary
        [HttpGet("tax-summary")]
        public async Task<ActionResult<TaxSummaryResponse>> GetTaxSummary([FromQuery] string period = "month")
        {
            var currentTime = DateTime.UtcNow;
            var today = DateTime.SpecifyKind(currentTime.Date, DateTimeKind.Utc);
            
            DateTime startDate;
            string periodLabel;
            
            switch (period.ToLower())
            {
                case "week":
                    startDate = today.AddDays(-(int)today.DayOfWeek + 1);
                    periodLabel = $"Week of {startDate:MMM dd}";
                    break;
                case "year":
                    startDate = DateTime.SpecifyKind(new DateTime(today.Year, 1, 1), DateTimeKind.Utc);
                    periodLabel = today.Year.ToString();
                    break;
                default: // month
                    startDate = DateTime.SpecifyKind(new DateTime(today.Year, today.Month, 1), DateTimeKind.Utc);
                    periodLabel = startDate.ToString("MMMM yyyy");
                    break;
            }
            
            var endDate = today.AddDays(1);
            
            var sales = await _context.Sales
                .Where(s => s.SaleDate >= startDate && s.SaleDate < endDate && s.Status == "Completed")
                .ToListAsync();

            return new TaxSummaryResponse
            {
                Period = periodLabel,
                TotalSales = sales.Count,
                TotalRevenue = sales.Sum(s => s.Total),
                TotalTaxCollected = sales.Sum(s => s.TaxAmount),
                AverageTaxRate = sales.Count > 0 ? sales.Average(s => s.TaxRate) : 0
            };
        }

        // GET: api/sales/employee-performance
        [HttpGet("employee-performance")]
        public async Task<ActionResult<List<EmployeePerformanceResponse>>> GetEmployeePerformance([FromQuery] string period = "month")
        {
            var currentTime = DateTime.UtcNow;
            var today = DateTime.SpecifyKind(currentTime.Date, DateTimeKind.Utc);
            
            DateTime startDate;
            
            switch (period.ToLower())
            {
                case "week":
                    startDate = today.AddDays(-(int)today.DayOfWeek + 1);
                    break;
                case "today":
                    startDate = today;
                    break;
                default: // month
                    startDate = DateTime.SpecifyKind(new DateTime(today.Year, today.Month, 1), DateTimeKind.Utc);
                    break;
            }
            
            var endDate = today.AddDays(1);
            
            var employeePerformance = await _context.Sales
                .Include(s => s.Employee)
                .Where(s => s.SaleDate >= startDate && s.SaleDate < endDate && s.Status == "Completed")
                .GroupBy(s => new { s.EmployeeId, s.Employee.Name, EmployeeCode = s.Employee.EmployeeId })
                .Select(g => new EmployeePerformanceResponse
                {
                    EmployeeName = g.Key.Name ?? g.Key.EmployeeCode,
                    TotalSales = g.Count(),
                    TotalRevenue = g.Sum(s => s.Total),
                    AverageTransactionValue = g.Average(s => s.Total)
                })
                .OrderByDescending(e => e.TotalRevenue)
                .ToListAsync();

            return employeePerformance;
        }
    }

    // Request/Response DTOs
    public class SaleCreateRequest
    {
        public int EmployeeId { get; set; }
        public decimal Subtotal { get; set; }
        public decimal TaxRate { get; set; }
        public decimal TaxAmount { get; set; }
        public decimal DiscountAmount { get; set; } = 0;
        public string? DiscountReason { get; set; }
        public decimal Total { get; set; }
        public decimal AmountPaid { get; set; }
        public decimal Change { get; set; }
        public string PaymentMethod { get; set; } = "Cash";
        public string? Notes { get; set; }
        public List<SaleItemRequest> Items { get; set; } = new List<SaleItemRequest>();
    }

    public class SaleItemRequest
    {
        public int ProductId { get; set; }
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal LineTotal { get; set; }
    }

    public class SalesTodayResponse
    {
        public DateTime Date { get; set; }
        public int TotalSales { get; set; }
        public decimal TotalRevenue { get; set; }
        public decimal TotalTax { get; set; }
        public decimal TotalDiscounts { get; set; }
        public List<Sale> Sales { get; set; } = new List<Sale>();
    }

    public class SalesSummaryResponse
    {
        public string Period { get; set; } = string.Empty;
        public int TotalSales { get; set; }
        public decimal TotalRevenue { get; set; }
        public decimal TotalTax { get; set; }
        public decimal TotalDiscounts { get; set; }
    }

    public class TopProductResponse
    {
        public string ProductName { get; set; } = string.Empty;
        public int TotalQuantitySold { get; set; }
        public decimal TotalRevenue { get; set; }
        public int TransactionCount { get; set; }
    }

    public class PaymentBreakdownResponse
    {
        public string Period { get; set; } = string.Empty;
        public List<PaymentMethodSummary> PaymentMethods { get; set; } = new List<PaymentMethodSummary>();
    }

    public class PaymentMethodSummary
    {
        public string PaymentMethod { get; set; } = string.Empty;
        public int TotalSales { get; set; }
        public decimal TotalRevenue { get; set; }
    }

    public class TaxSummaryResponse
    {
        public string Period { get; set; } = string.Empty;
        public int TotalSales { get; set; }
        public decimal TotalRevenue { get; set; }
        public decimal TotalTaxCollected { get; set; }
        public decimal AverageTaxRate { get; set; }
    }

    public class EmployeePerformanceResponse
    {
        public string EmployeeName { get; set; } = string.Empty;
        public int TotalSales { get; set; }
        public decimal TotalRevenue { get; set; }
        public decimal AverageTransactionValue { get; set; }
    }
}