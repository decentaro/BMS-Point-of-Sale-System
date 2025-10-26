using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
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
        public async Task<ActionResult<IEnumerable<Return>>> GetReturns()
        {
            return await _context.Returns
                .Include(r => r.OriginalSale)
                .Include(r => r.ProcessedByEmployee)
                .Include(r => r.ApprovedByEmployee)
                .Include(r => r.ReturnItems)
                    .ThenInclude(ri => ri.Product)
                .OrderByDescending(r => r.ReturnDate)
                .ToListAsync();
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

                    approvingManager = await _context.Employees
                        .FirstOrDefaultAsync(e => e.Pin == request.ManagerPin && 
                            (e.Role == "Manager" || e.IsManager == true));

                    if (approvingManager == null)
                    {
                        return BadRequest("Invalid manager PIN. Please verify the PIN and try again.");
                    }
                }

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
                        return BadRequest($"Original sale item {item.OriginalSaleItemId} not found.");
                    }

                    // Check how much has already been returned
                    var alreadyReturned = existingReturnItems.FirstOrDefault(er => er.SaleItemId == item.OriginalSaleItemId)?.TotalReturned ?? 0;
                    var availableToReturn = originalSaleItem.Quantity - alreadyReturned;

                    // Validate return quantity
                    if (item.ReturnQuantity <= 0)
                    {
                        return BadRequest($"Invalid return quantity for item {originalSaleItem.ProductName}.");
                    }

                    if (item.ReturnQuantity > availableToReturn)
                    {
                        return BadRequest($"Cannot return {item.ReturnQuantity} of {originalSaleItem.ProductName}. Only {availableToReturn} available to return (originally bought {originalSaleItem.Quantity}, already returned {alreadyReturned}).");
                    }
                }

                // ALL VALIDATIONS PASSED - Now create the return record
                // Generate unique return ID (format: RET-YYYYMMDD-XXXXXXXX)
                var currentTime = DateTime.UtcNow;
                var timestamp = currentTime.ToString("yyyyMMdd");
                var randomHex = new Random().Next(0, int.MaxValue).ToString("X8");
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
                    Notes = request.Notes
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