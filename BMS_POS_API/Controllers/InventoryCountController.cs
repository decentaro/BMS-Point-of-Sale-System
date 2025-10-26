using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class InventoryCountController : ControllerBase
    {
        private readonly BmsPosDbContext _context;
        private readonly IUserActivityService _userActivityService;

        public InventoryCountController(BmsPosDbContext context, IUserActivityService userActivityService)
        {
            _context = context;
            _userActivityService = userActivityService;
        }

        // GET: api/inventorycount
        [HttpGet]
        public async Task<ActionResult<IEnumerable<InventoryCount>>> GetInventoryCounts()
        {
            return await _context.InventoryCounts
                .Include(ic => ic.StartedByEmployee)
                .Include(ic => ic.CompletedByEmployee)
                .OrderByDescending(ic => ic.StartedDate)
                .ToListAsync();
        }

        // GET: api/inventorycount/5
        [HttpGet("{id}")]
        public async Task<ActionResult<InventoryCount>> GetInventoryCount(int id)
        {
            var inventoryCount = await _context.InventoryCounts
                .Include(ic => ic.StartedByEmployee)
                .Include(ic => ic.CompletedByEmployee)
                .Include(ic => ic.CountItems)
                    .ThenInclude(ci => ci.Product)
                .Include(ic => ic.CountItems)
                    .ThenInclude(ci => ci.ProductBatch)
                .Include(ic => ic.CountItems)
                    .ThenInclude(ci => ci.CountedByEmployee)
                .FirstOrDefaultAsync(ic => ic.Id == id);

            if (inventoryCount == null)
            {
                return NotFound();
            }

            return inventoryCount;
        }

        // POST: api/inventorycount
        [HttpPost]
        public async Task<ActionResult<InventoryCount>> StartInventoryCount(StartInventoryCountRequest request)
        {
            // Validate input
            if (string.IsNullOrWhiteSpace(request.CountName))
            {
                return BadRequest("Count name is required");
            }

            var validTypes = new[] { "FULL", "CYCLE", "SPOT", "ANNUAL" };
            if (!validTypes.Contains(request.CountType))
            {
                return BadRequest($"Invalid count type. Valid types: {string.Join(", ", validTypes)}");
            }

            // Get user info
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (string.IsNullOrEmpty(userIdHeader) || !int.TryParse(userIdHeader, out int userId))
            {
                return BadRequest("User authentication required");
            }

            // Check if employee exists and is manager
            var employee = await _context.Employees.FindAsync(userId);
            if (employee == null)
            {
                return BadRequest("Employee not found");
            }

            if (employee.Role != "Manager")
            {
                return Forbid("Only managers can start inventory counts");
            }

            // Check for active counts
            var activeCount = await _context.InventoryCounts
                .FirstOrDefaultAsync(ic => ic.Status == "IN_PROGRESS");
            
            if (activeCount != null)
            {
                return BadRequest($"Another inventory count is already in progress: {activeCount.CountName}");
            }

            // Create inventory count
            var inventoryCount = new InventoryCount
            {
                CountName = request.CountName,
                CountType = request.CountType,
                StartedDate = DateTime.UtcNow,
                Status = "IN_PROGRESS",
                StartedByEmployeeId = userId,
                Notes = request.Notes
            };

            _context.InventoryCounts.Add(inventoryCount);
            await _context.SaveChangesAsync();

            // Log activity
            await _userActivityService.LogActivityAsync(
                userId,
                userNameHeader ?? "Unknown",
                $"Started inventory count: {request.CountName}",
                $"Type: {request.CountType}, Notes: {request.Notes}",
                "InventoryCount",
                inventoryCount.Id,
                "CREATE",
                HttpContext.Connection?.RemoteIpAddress?.ToString()
            );

            return CreatedAtAction(nameof(GetInventoryCount), new { id = inventoryCount.Id }, inventoryCount);
        }

        // POST: api/inventorycount/5/items
        [HttpPost("{countId}/items")]
        public async Task<ActionResult<InventoryCountItem>> AddCountItem(int countId, AddCountItemRequest request)
        {
            // Get inventory count
            var inventoryCount = await _context.InventoryCounts.FindAsync(countId);
            if (inventoryCount == null)
            {
                return NotFound("Inventory count not found");
            }

            if (inventoryCount.Status != "IN_PROGRESS")
            {
                return BadRequest("Cannot add items to completed inventory count");
            }

            // Get product
            var product = await _context.Products.FindAsync(request.ProductId);
            if (product == null)
            {
                return NotFound("Product not found");
            }

            // Get user info
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (string.IsNullOrEmpty(userIdHeader) || !int.TryParse(userIdHeader, out int userId))
            {
                return BadRequest("User authentication required");
            }

            // Check for existing count item
            var existingItem = await _context.InventoryCountItems
                .FirstOrDefaultAsync(ci => ci.InventoryCountId == countId && 
                                         ci.ProductId == request.ProductId &&
                                         ci.ProductBatchId == request.ProductBatchId);

            if (existingItem != null)
            {
                return BadRequest("Product has already been counted in this inventory count");
            }

            // Calculate variance
            var systemQuantity = product.StockQuantity;
            var variance = request.CountedQuantity - systemQuantity;
            var varianceValue = variance * product.Cost;

            // Create count item
            var countItem = new InventoryCountItem
            {
                InventoryCountId = countId,
                ProductId = request.ProductId,
                ProductBatchId = request.ProductBatchId,
                SystemQuantity = systemQuantity,
                CountedQuantity = request.CountedQuantity,
                Variance = variance,
                CostPerUnit = product.Cost,
                VarianceValue = varianceValue,
                DiscrepancyReason = request.DiscrepancyReason,
                Notes = request.Notes,
                CountedByEmployeeId = userId,
                CountedDate = DateTime.UtcNow
            };

            _context.InventoryCountItems.Add(countItem);

            // Update inventory count totals
            inventoryCount.TotalItemsCounted++;
            if (variance != 0)
            {
                inventoryCount.TotalDiscrepancies++;
                if (variance < 0)
                    inventoryCount.TotalShrinkageValue += Math.Abs(varianceValue);
                else
                    inventoryCount.TotalOverageValue += varianceValue;
            }
            inventoryCount.NetVarianceValue += varianceValue;

            await _context.SaveChangesAsync();

            // Log significant discrepancies
            if (Math.Abs(variance) > 10 || Math.Abs(varianceValue) > 100)
            {
                await _userActivityService.LogActivityAsync(
                    userId,
                    userNameHeader ?? "Unknown",
                    $"⚠️ SIGNIFICANT DISCREPANCY: {product.Name}",
                    $"Expected: {systemQuantity}, Counted: {request.CountedQuantity}, Variance: {variance} (${varianceValue:F2}), Reason: {request.DiscrepancyReason}",
                    "InventoryCountItem",
                    countItem.Id,
                    "DISCREPANCY",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );
            }

            return CreatedAtAction(nameof(GetInventoryCount), new { id = countId }, countItem);
        }

        // PUT: api/inventorycount/5/complete
        [HttpPut("{id}/complete")]
        public async Task<IActionResult> CompleteInventoryCount(int id, [FromBody] CompleteCountRequest request)
        {
            var inventoryCount = await _context.InventoryCounts
                .Include(ic => ic.CountItems)
                    .ThenInclude(ci => ci.Product)
                .FirstOrDefaultAsync(ic => ic.Id == id);

            if (inventoryCount == null)
            {
                return NotFound();
            }

            if (inventoryCount.Status != "IN_PROGRESS")
            {
                return BadRequest("Inventory count is not in progress");
            }

            // Get user info
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (string.IsNullOrEmpty(userIdHeader) || !int.TryParse(userIdHeader, out int userId))
            {
                return BadRequest("User authentication required");
            }

            // Check if user is manager
            var employee = await _context.Employees.FindAsync(userId);
            if (employee == null || employee.Role != "Manager")
            {
                return Forbid("Only managers can complete inventory counts");
            }

            // Apply adjustments to product stock if requested
            if (request.ApplyAdjustments)
            {
                foreach (var countItem in inventoryCount.CountItems)
                {
                    if (countItem.Variance != 0)
                    {
                        countItem.Product.StockQuantity = countItem.CountedQuantity;
                        countItem.Product.LastUpdated = DateTime.UtcNow;

                        // Create automatic stock adjustment record
                        var adjustment = new StockAdjustment
                        {
                            ProductId = countItem.ProductId,
                            AdjustmentType = "CORRECTION",
                            QuantityChange = countItem.Variance,
                            QuantityBefore = countItem.SystemQuantity,
                            QuantityAfter = countItem.CountedQuantity,
                            Reason = $"Inventory count adjustment - {inventoryCount.CountName}",
                            Notes = countItem.DiscrepancyReason,
                            AdjustedByEmployeeId = userId,
                            CostImpact = countItem.VarianceValue,
                            AdjustmentDate = DateTime.UtcNow,
                            ReferenceNumber = $"IC-{inventoryCount.Id}",
                            RequiresApproval = false,
                            IsApproved = true,
                            ApprovedByEmployeeId = userId,
                            ApprovedDate = DateTime.UtcNow
                        };

                        _context.StockAdjustments.Add(adjustment);
                    }
                }
            }

            // Complete the count
            inventoryCount.Status = "COMPLETED";
            inventoryCount.CompletedDate = DateTime.UtcNow;
            inventoryCount.CompletedByEmployeeId = userId;

            await _context.SaveChangesAsync();

            // Log completion activity
            var adjustmentText = request.ApplyAdjustments ? " and applied adjustments" : "";
            await _userActivityService.LogActivityAsync(
                userId,
                userNameHeader ?? "Unknown",
                $"Completed inventory count: {inventoryCount.CountName}{adjustmentText}",
                $"Items: {inventoryCount.TotalItemsCounted}, Discrepancies: {inventoryCount.TotalDiscrepancies}, Net Variance: {inventoryCount.NetVarianceValue:C}",
                "InventoryCount",
                inventoryCount.Id,
                "COMPLETE",
                HttpContext.Connection?.RemoteIpAddress?.ToString()
            );

            return Ok(inventoryCount);
        }

        // GET: api/inventorycount/5/items
        [HttpGet("{countId}/items")]
        public async Task<ActionResult<IEnumerable<InventoryCountItem>>> GetCountItems(int countId)
        {
            var inventoryCount = await _context.InventoryCounts.FindAsync(countId);
            if (inventoryCount == null)
            {
                return NotFound("Inventory count not found");
            }

            return await _context.InventoryCountItems
                .Include(ci => ci.Product)
                .Include(ci => ci.ProductBatch)
                .Include(ci => ci.CountedByEmployee)
                .Include(ci => ci.VerifiedByEmployee)
                .Where(ci => ci.InventoryCountId == countId)
                .OrderBy(ci => ci.Product.Name)
                .ToListAsync();
        }

        // DELETE: api/inventorycount/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> CancelInventoryCount(int id)
        {
            var inventoryCount = await _context.InventoryCounts.FindAsync(id);
            if (inventoryCount == null)
            {
                return NotFound();
            }

            if (inventoryCount.Status == "COMPLETED")
            {
                return BadRequest("Cannot cancel completed inventory count");
            }

            // Get user info
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (string.IsNullOrEmpty(userIdHeader) || !int.TryParse(userIdHeader, out int userId))
            {
                return BadRequest("User authentication required");
            }

            // Check if user is manager
            var employee = await _context.Employees.FindAsync(userId);
            if (employee == null || employee.Role != "Manager")
            {
                return Forbid("Only managers can cancel inventory counts");
            }

            // Mark as cancelled
            inventoryCount.Status = "CANCELLED";
            inventoryCount.CompletedDate = DateTime.UtcNow;
            inventoryCount.CompletedByEmployeeId = userId;

            await _context.SaveChangesAsync();

            // Log cancellation
            await _userActivityService.LogActivityAsync(
                userId,
                userNameHeader ?? "Unknown",
                $"Cancelled inventory count: {inventoryCount.CountName}",
                $"Items counted: {inventoryCount.TotalItemsCounted}",
                "InventoryCount",
                inventoryCount.Id,
                "CANCEL",
                HttpContext.Connection?.RemoteIpAddress?.ToString()
            );

            return NoContent();
        }

        // GET: api/inventorycount/summary
        [HttpGet("summary")]
        public async Task<ActionResult<InventoryCountSummary>> GetInventoryCountSummary([FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate)
        {
            var query = _context.InventoryCounts.AsQueryable();

            if (startDate.HasValue)
                query = query.Where(ic => ic.StartedDate >= startDate.Value);

            if (endDate.HasValue)
                query = query.Where(ic => ic.StartedDate <= endDate.Value);

            var counts = await query.ToListAsync();

            var summary = new InventoryCountSummary
            {
                TotalCounts = counts.Count,
                CompletedCounts = counts.Count(ic => ic.Status == "COMPLETED"),
                InProgressCounts = counts.Count(ic => ic.Status == "IN_PROGRESS"),
                CancelledCounts = counts.Count(ic => ic.Status == "CANCELLED"),
                TotalItemsCounted = counts.Sum(ic => ic.TotalItemsCounted),
                TotalDiscrepancies = counts.Sum(ic => ic.TotalDiscrepancies),
                TotalShrinkageValue = counts.Sum(ic => ic.TotalShrinkageValue),
                TotalOverageValue = counts.Sum(ic => ic.TotalOverageValue),
                NetVarianceValue = counts.Sum(ic => ic.NetVarianceValue)
            };

            return summary;
        }
    }

    // DTOs for requests
    public class StartInventoryCountRequest
    {
        public string CountName { get; set; } = string.Empty;
        public string CountType { get; set; } = string.Empty;
        public string? Notes { get; set; }
    }

    public class AddCountItemRequest
    {
        public int ProductId { get; set; }
        public int? ProductBatchId { get; set; }
        public int CountedQuantity { get; set; }
        public string? DiscrepancyReason { get; set; }
        public string? Notes { get; set; }
    }

    public class CompleteCountRequest
    {
        public bool ApplyAdjustments { get; set; } = true;
        public string? CompletionNotes { get; set; }
    }

    // DTOs for responses
    public class InventoryCountSummary
    {
        public int TotalCounts { get; set; }
        public int CompletedCounts { get; set; }
        public int InProgressCounts { get; set; }
        public int CancelledCounts { get; set; }
        public int TotalItemsCounted { get; set; }
        public int TotalDiscrepancies { get; set; }
        public decimal TotalShrinkageValue { get; set; }
        public decimal TotalOverageValue { get; set; }
        public decimal NetVarianceValue { get; set; }
    }
}