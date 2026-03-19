using BCrypt.Net;
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
    public class ReturnsController : ControllerBase
    {
        private readonly BmsPosDbContext _context;
        private readonly IUserActivityService _userActivityService;

        public ReturnsController(BmsPosDbContext context, IUserActivityService userActivityService)
        {
            _context = context;
            _userActivityService = userActivityService;
        }

        // GET: api/returns
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Return>>> GetReturns(
            [FromQuery] int limit = 100,
            [FromQuery] int offset = 0)
        {
            if (limit > 500) limit = 500;
            if (limit < 1) limit = 1;
            if (offset < 0) offset = 0;

            return await _context.Returns
                .Include(r => r.OriginalSale)
                .Include(r => r.ProcessedByEmployee)
                .Include(r => r.ApprovedByEmployee)
                .Include(r => r.ReturnItems)
                    .ThenInclude(ri => ri.Product)
                .OrderByDescending(r => r.ReturnDate)
                .Skip(offset)
                .Take(limit)
                .ToListAsync();
        }

        // GET: api/returns/summary?period=today|week|month|all
        [HttpGet("summary")]
        public async Task<ActionResult<object>> GetReturnsSummary([FromQuery] string period = "month")
        {
            var now = DateTime.UtcNow;
            DateTime cutoff = period switch
            {
                "today" => now.Date,
                "week"  => now.AddDays(-7),
                "month" => now.AddDays(-30),
                _       => DateTime.MinValue
            };

            var periodLabel = period switch
            {
                "today" => "Today",
                "week"  => "Last 7 Days",
                "month" => "Last 30 Days",
                _       => "All Time"
            };

            var returnsQuery = _context.Returns
                .Include(r => r.ReturnItems)
                .Where(r => r.Status == "Completed");

            if (cutoff > DateTime.MinValue)
                returnsQuery = returnsQuery.Where(r => r.ReturnDate >= cutoff);

            var returns = await returnsQuery.ToListAsync();
            var allItems = returns.SelectMany(r => r.ReturnItems).ToList();

            var totalReturns      = returns.Count;
            var totalRefundAmount = returns.Sum(r => r.TotalRefundAmount);
            var totalItemsReturned = allItems.Sum(i => i.ReturnQuantity);

            var returnsByReason = allItems
                .GroupBy(i => i.Reason)
                .Select(g => new {
                    reason      = g.Key,
                    count       = g.Sum(i => i.ReturnQuantity),
                    totalRefund = g.Sum(i => i.LineTotal)
                })
                .OrderByDescending(x => x.count)
                .ToList();

            var topReturnedProducts = allItems
                .GroupBy(i => i.ProductName)
                .Select(g => new {
                    productName    = g.Key,
                    returnQuantity = g.Sum(i => i.ReturnQuantity),
                    totalRefund    = g.Sum(i => i.LineTotal)
                })
                .OrderByDescending(x => x.returnQuantity)
                .Take(10)
                .ToList();

            return Ok(new
            {
                period             = periodLabel,
                totalReturns,
                totalRefundAmount,
                totalItemsReturned,
                returnsByReason,
                topReturnedProducts
            });
        }

        // GET: api/returns/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<Return>> GetReturn(int id)
        {
            var returnRecord = await _context.Returns
                .Include(r => r.OriginalSale)
                .Include(r => r.ProcessedByEmployee)
                .Include(r => r.ApprovedByEmployee)
                .Include(r => r.ReturnItems)
                    .ThenInclude(ri => ri.Product)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (returnRecord == null)
            {
                return NotFound();
            }

            return returnRecord;
        }

        // POST: api/returns
        [HttpPost]
        public async Task<ActionResult<Return>> ProcessReturn(ProcessReturnRequest request)
        {
            try
            {
                // Idempotency check — return existing return if this key was already processed
                var idempotencyKey = Request.Headers["X-Idempotency-Key"].FirstOrDefault();
                if (!string.IsNullOrEmpty(idempotencyKey))
                {
                    var existing = await _context.Returns
                        .Include(r => r.OriginalSale)
                        .Include(r => r.ProcessedByEmployee)
                        .Include(r => r.ReturnItems).ThenInclude(ri => ri.Product)
                        .FirstOrDefaultAsync(r => r.IdempotencyKey == idempotencyKey);
                    if (existing != null)
                        return Ok(new { returnId = existing.ReturnId, totalRefundAmount = existing.TotalRefundAmount });
                }

                // Validate the original sale exists
                var originalSale = await _context.Sales
                    .Include(s => s.SaleItems)
                        .ThenInclude(si => si.Product)
                    .FirstOrDefaultAsync(s => s.Id == request.OriginalSaleId);

                if (originalSale == null)
                {
                    return BadRequest("Original sale not found.");
                }

                // Get system settings
                var systemSettings = await _context.SystemSettings.FirstOrDefaultAsync();
                if (systemSettings == null || !systemSettings.EnableReturns)
                {
                    return BadRequest("Returns system is disabled.");
                }

                // Check return time limit
                if (systemSettings.ReturnTimeLimitDays > 0)
                {
                    var checkTime = DateTime.UtcNow;
                    var daysSinceSale = (checkTime - originalSale.SaleDate).Days;
                    if (daysSinceSale > systemSettings.ReturnTimeLimitDays)
                    {
                        return BadRequest($"Return period expired. Returns allowed within {systemSettings.ReturnTimeLimitDays} days.");
                    }
                }

                // Check if manager approval is needed
                var returnTotal = request.ReturnItems.Sum(ri => ri.LineTotal);
                var needsManagerApproval = systemSettings.RequireManagerApprovalForReturns || 
                    (systemSettings.ReturnManagerApprovalAmount > 0 && returnTotal > systemSettings.ReturnManagerApprovalAmount);

                // Validate manager PIN if approval is required
                Employee? approvingManager = null;
                if (needsManagerApproval)
                {
                    if (string.IsNullOrEmpty(request.ManagerPin))
                    {
                        return BadRequest("Manager PIN is required for this return amount.");
                    }

                    // Load managers and verify PIN with hashing support (never compare PIN in SQL)
                    var managers = await _context.Employees
                        .Where(e => (e.Role == "Manager" || e.IsManager == true) && e.IsActive)
                        .ToListAsync();

                    foreach (var m in managers)
                    {
                        bool isLegacy = m.Pin?.StartsWith("$2") != true;
                        bool pinMatch = isLegacy ? m.Pin == request.ManagerPin
                                                 : BCrypt.Net.BCrypt.Verify(request.ManagerPin, m.Pin);
                        if (pinMatch) { approvingManager = m; break; }
                    }

                    if (approvingManager == null)
                    {
                        return BadRequest("Invalid manager PIN. Please verify the PIN and try again.");
                    }
                }

                // Begin a serializable transaction so that the check-then-insert is atomic.
                // This prevents two concurrent requests from both passing the quantity check
                // before either has written its ReturnItems, which would allow double-returns.
                await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

                // Check for existing returns on these items BEFORE creating return record
                var existingReturnItems = await _context.ReturnItems
                    .Where(ri => request.ReturnItems.Select(r => r.OriginalSaleItemId).Contains(ri.OriginalSaleItemId))
                    .GroupBy(ri => ri.OriginalSaleItemId)
                    .Select(g => new { SaleItemId = g.Key, TotalReturned = g.Sum(ri => ri.ReturnQuantity) })
                    .ToListAsync();

                // Validate each return item BEFORE creating any database records
                foreach (var item in request.ReturnItems)
                {
                    var originalSaleItem = originalSale.SaleItems.FirstOrDefault(si => si.Id == item.OriginalSaleItemId);
                    if (originalSaleItem == null)
                    {
                        await transaction.RollbackAsync();
                        return BadRequest($"Original sale item {item.OriginalSaleItemId} not found.");
                    }

                    // Check how much has already been returned
                    var alreadyReturned = existingReturnItems.FirstOrDefault(er => er.SaleItemId == item.OriginalSaleItemId)?.TotalReturned ?? 0;
                    var availableToReturn = originalSaleItem.Quantity - alreadyReturned;

                    // Validate return quantity
                    if (item.ReturnQuantity <= 0)
                    {
                        await transaction.RollbackAsync();
                        return BadRequest($"Invalid return quantity for item {originalSaleItem.ProductName}.");
                    }

                    if (item.ReturnQuantity > availableToReturn)
                    {
                        await transaction.RollbackAsync();
                        return BadRequest($"Cannot return {item.ReturnQuantity} of {originalSaleItem.ProductName}. Only {availableToReturn} available to return (originally bought {originalSaleItem.Quantity}, already returned {alreadyReturned}).");
                    }
                }

                // ALL VALIDATIONS PASSED - Now create the return record
                // Generate unique return ID (format: RET-YYYYMMDD-XXXXXXXX)
                var currentTime = DateTime.UtcNow;
                var timestamp = currentTime.ToString("yyyyMMdd");
                var randomHex = Random.Shared.Next(0, int.MaxValue).ToString("X8");
                var returnId = $"RET-{timestamp}-{randomHex}";

                // Create return record
                var returnRecord = new Return
                {
                    ReturnId = returnId,
                    OriginalSaleId = request.OriginalSaleId,
                    ReturnDate = DateTime.UtcNow,
                    Status = "Completed",
                    TotalRefundAmount = request.ReturnItems.Sum(ri => ri.LineTotal),
                    ProcessedByEmployeeId = request.ProcessedByEmployeeId,
                    ApprovedByEmployeeId = approvingManager?.Id,
                    ManagerApprovalRequired = needsManagerApproval,
                    Notes = request.Notes,
                    IdempotencyKey = string.IsNullOrEmpty(idempotencyKey) ? null : idempotencyKey
                };

                _context.Returns.Add(returnRecord);
                await _context.SaveChangesAsync(); // Save to get the ID

                // Process each return item
                foreach (var item in request.ReturnItems)
                {
                    var originalSaleItem = originalSale.SaleItems.FirstOrDefault(si => si.Id == item.OriginalSaleItemId);
                    if (originalSaleItem == null) continue; // Skip if sale item not found (shouldn't happen at this point)
                    
                    var returnItem = new ReturnItem
                    {
                        ReturnId = returnRecord.Id,
                        OriginalSaleItemId = item.OriginalSaleItemId,
                        ProductId = originalSaleItem.ProductId,
                        ProductName = originalSaleItem.ProductName,
                        ReturnQuantity = item.ReturnQuantity,
                        UnitPrice = originalSaleItem.UnitPrice,
                        LineTotal = item.LineTotal,
                        Condition = item.Condition,
                        Reason = item.Reason,
                        RestockedToInventory = false // Will be handled separately if needed
                    };

                    _context.ReturnItems.Add(returnItem);

                    // Update inventory if restocking is enabled and item is in good condition
                    if (systemSettings.RestockReturnedItems && item.Condition == "good")
                    {
                        var product = await _context.Products.FindAsync(originalSaleItem.ProductId);
                        if (product != null)
                        {
                            product.StockQuantity += item.ReturnQuantity;
                            returnItem.RestockedToInventory = true;
                        }
                    }
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                // Log return processing activity
                var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
                var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
                
                if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
                {
                    var itemsDescription = string.Join(", ", request.ReturnItems.Select(ri => 
                    {
                        var saleItem = originalSale.SaleItems.FirstOrDefault(si => si.Id == ri.OriginalSaleItemId);
                        return saleItem != null ? $"{ri.ReturnQuantity}x {saleItem.ProductName}" : $"Item {ri.OriginalSaleItemId}";
                    }));
                    
                    var approvalText = needsManagerApproval ? $", Manager Approval: {approvingManager?.Name ?? "Unknown"}" : "";
                    
                    await _userActivityService.LogActivityAsync(
                        userId,
                        userNameHeader ?? "Unknown",
                        $"Processed return {returnId}: {itemsDescription}",
                        $"Original Sale: {originalSale.TransactionId}, Total Refund: {returnRecord.TotalRefundAmount:C}, Items: {request.ReturnItems.Count}{approvalText}",
                        "Return",
                        returnRecord.Id,
                        "CREATE",
                        HttpContext.Connection?.RemoteIpAddress?.ToString()
                    );
                }

                // Return the complete return record
                var completedReturn = await _context.Returns
                    .Include(r => r.OriginalSale)
                    .Include(r => r.ProcessedByEmployee)
                    .Include(r => r.ApprovedByEmployee)
                    .Include(r => r.ReturnItems)
                        .ThenInclude(ri => ri.Product)
                    .FirstOrDefaultAsync(r => r.Id == returnRecord.Id);

                return CreatedAtAction(nameof(GetReturn), new { id = returnRecord.Id }, completedReturn);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }
    }

    // Request DTOs
    public class ProcessReturnRequest
    {
        public int OriginalSaleId { get; set; }
        public int ProcessedByEmployeeId { get; set; }
        public string? ManagerPin { get; set; }
        public string? Notes { get; set; }
        public List<ProcessReturnItemRequest> ReturnItems { get; set; } = new List<ProcessReturnItemRequest>();
    }

    public class ProcessReturnItemRequest
    {
        public int OriginalSaleItemId { get; set; }
        public int ReturnQuantity { get; set; }
        public decimal LineTotal { get; set; }
        public string Condition { get; set; } = "good";
        public string Reason { get; set; } = string.Empty;
    }
}