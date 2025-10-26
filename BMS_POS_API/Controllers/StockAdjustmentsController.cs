using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class StockAdjustmentsController : ControllerBase
    {
        private readonly BmsPosDbContext _context;
        private readonly IUserActivityService _userActivityService;

        public StockAdjustmentsController(BmsPosDbContext context, IUserActivityService userActivityService)
        {
            _context = context;
            _userActivityService = userActivityService;
        }

        // GET: api/stockadjustments
        [HttpGet]
        public async Task<ActionResult<IEnumerable<StockAdjustment>>> GetStockAdjustments([FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate, [FromQuery] int? productId)
        {
            var query = _context.StockAdjustments
                .Include(sa => sa.Product)
                .Include(sa => sa.AdjustedByEmployee)
                .Include(sa => sa.ApprovedByEmployee)
                .AsQueryable();

            if (startDate.HasValue)
                query = query.Where(sa => sa.AdjustmentDate >= startDate.Value);

            if (endDate.HasValue)
                query = query.Where(sa => sa.AdjustmentDate <= endDate.Value);

            if (productId.HasValue)
                query = query.Where(sa => sa.ProductId == productId.Value);

            return await query.OrderByDescending(sa => sa.AdjustmentDate).ToListAsync();
        }

        // GET: api/stockadjustments/5
        [HttpGet("{id}")]
        public async Task<ActionResult<StockAdjustment>> GetStockAdjustment(int id)
        {
            var stockAdjustment = await _context.StockAdjustments
                .Include(sa => sa.Product)
                .Include(sa => sa.AdjustedByEmployee)
                .Include(sa => sa.ApprovedByEmployee)
                .FirstOrDefaultAsync(sa => sa.Id == id);

            if (stockAdjustment == null)
            {
                return NotFound();
            }

            return stockAdjustment;
        }

        // GET: api/stockadjustments/pending-approval
        [HttpGet("pending-approval")]
        public async Task<ActionResult<IEnumerable<StockAdjustment>>> GetPendingAdjustments()
        {
            return await _context.StockAdjustments
                .Include(sa => sa.Product)
                .Include(sa => sa.AdjustedByEmployee)
                .Where(sa => sa.RequiresApproval && !sa.IsApproved)
                .OrderByDescending(sa => sa.AdjustmentDate)
                .ToListAsync();
        }

        // POST: api/stockadjustments
        [HttpPost]
        public async Task<ActionResult<StockAdjustment>> CreateStockAdjustment(CreateStockAdjustmentRequest request)
        {
            // Validate input
            if (request.QuantityChange == 0)
            {
                return BadRequest("Quantity change cannot be zero");
            }

            if (string.IsNullOrWhiteSpace(request.Reason))
            {
                return BadRequest("Reason is required");
            }

            var validTypes = new[] { "DAMAGE", "THEFT", "EXPIRED", "FOUND", "CORRECTION", "RETURN" };
            if (!validTypes.Contains(request.AdjustmentType))
            {
                return BadRequest($"Invalid adjustment type. Valid types: {string.Join(", ", validTypes)}");
            }

            // Get product and validate
            var product = await _context.Products.FindAsync(request.ProductId);
            if (product == null)
            {
                return NotFound("Product not found");
            }

            // Check if adjustment would make stock negative
            var newQuantity = product.StockQuantity + request.QuantityChange;
            if (newQuantity < 0)
            {
                return BadRequest($"Adjustment would result in negative stock ({newQuantity}). Current stock: {product.StockQuantity}");
            }

            // Get user info from headers
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (string.IsNullOrEmpty(userIdHeader) || !int.TryParse(userIdHeader, out int userId))
            {
                return BadRequest("User authentication required");
            }

            // Check if employee exists
            var employee = await _context.Employees.FindAsync(userId);
            if (employee == null)
            {
                return BadRequest("Employee not found");
            }

            // Determine if approval required (large adjustments or certain types)
            var requiresApproval = Math.Abs(request.QuantityChange) > 50 || 
                                 Math.Abs(request.QuantityChange * product.Cost) > 500 ||
                                 request.AdjustmentType == "THEFT";

            // Create stock adjustment
            var stockAdjustment = new StockAdjustment
            {
                ProductId = request.ProductId,
                AdjustmentType = request.AdjustmentType,
                QuantityChange = request.QuantityChange,
                QuantityBefore = product.StockQuantity,
                QuantityAfter = newQuantity,
                Reason = request.Reason,
                Notes = request.Notes,
                AdjustedByEmployeeId = userId,
                CostImpact = request.QuantityChange * product.Cost,
                AdjustmentDate = DateTime.UtcNow,
                ReferenceNumber = request.ReferenceNumber,
                RequiresApproval = requiresApproval,
                IsApproved = !requiresApproval // Auto-approve if not required
            };

            _context.StockAdjustments.Add(stockAdjustment);

            // Update product stock only if approved or doesn't require approval
            if (!requiresApproval)
            {
                product.StockQuantity = newQuantity;
                product.LastUpdated = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();

            // Log activity
            var approvalText = requiresApproval ? " (PENDING APPROVAL)" : "";
            await _userActivityService.LogActivityAsync(
                userId,
                userNameHeader ?? "Unknown",
                $"Stock adjustment: {product.Name} {(request.QuantityChange > 0 ? "+" : "")}{request.QuantityChange}{approvalText}",
                $"Type: {request.AdjustmentType}, Reason: {request.Reason}, Cost Impact: {stockAdjustment.CostImpact:C}",
                "StockAdjustment",
                stockAdjustment.Id,
                "CREATE",
                HttpContext.Connection?.RemoteIpAddress?.ToString()
            );

            return CreatedAtAction(nameof(GetStockAdjustment), new { id = stockAdjustment.Id }, stockAdjustment);
        }

        // PUT: api/stockadjustments/5/approve
        [HttpPut("{id}/approve")]
        public async Task<IActionResult> ApproveAdjustment(int id, [FromBody] ApprovalRequest request)
        {
            var adjustment = await _context.StockAdjustments
                .Include(sa => sa.Product)
                .FirstOrDefaultAsync(sa => sa.Id == id);

            if (adjustment == null)
            {
                return NotFound();
            }

            if (adjustment.IsApproved)
            {
                return BadRequest("Adjustment is already approved");
            }

            if (!adjustment.RequiresApproval)
            {
                return BadRequest("Adjustment does not require approval");
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
                return Forbid("Only managers can approve stock adjustments");
            }

            // Approve and apply the adjustment
            adjustment.IsApproved = true;
            adjustment.ApprovedByEmployeeId = userId;
            adjustment.ApprovedDate = DateTime.UtcNow;

            // Apply stock change
            adjustment.Product.StockQuantity = adjustment.QuantityAfter;
            adjustment.Product.LastUpdated = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            // Log approval activity
            await _userActivityService.LogActivityAsync(
                userId,
                userNameHeader ?? "Unknown",
                $"Approved stock adjustment: {adjustment.Product.Name} {(adjustment.QuantityChange > 0 ? "+" : "")}{adjustment.QuantityChange}",
                $"Original reason: {adjustment.Reason}, Cost Impact: {adjustment.CostImpact:C}",
                "StockAdjustment",
                adjustment.Id,
                "APPROVE",
                HttpContext.Connection?.RemoteIpAddress?.ToString()
            );

            return Ok(adjustment);
        }

        // GET: api/stockadjustments/product/5
        [HttpGet("product/{productId}")]
        public async Task<ActionResult<IEnumerable<StockAdjustment>>> GetProductAdjustments(int productId)
        {
            var product = await _context.Products.FindAsync(productId);
            if (product == null)
            {
                return NotFound("Product not found");
            }

            return await _context.StockAdjustments
                .Include(sa => sa.AdjustedByEmployee)
                .Include(sa => sa.ApprovedByEmployee)
                .Where(sa => sa.ProductId == productId)
                .OrderByDescending(sa => sa.AdjustmentDate)
                .ToListAsync();
        }
    }

    // DTOs for requests
    public class CreateStockAdjustmentRequest
    {
        public int ProductId { get; set; }
        public string AdjustmentType { get; set; } = string.Empty;
        public int QuantityChange { get; set; }
        public string Reason { get; set; } = string.Empty;
        public string? Notes { get; set; }
        public string? ReferenceNumber { get; set; }
    }

    public class ApprovalRequest
    {
        public string? ApprovalNotes { get; set; }
    }
}