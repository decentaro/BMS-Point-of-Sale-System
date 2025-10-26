using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProductsController : ControllerBase
    {
        private readonly BmsPosDbContext _context;
        private readonly IUserActivityService _userActivityService;

        public ProductsController(BmsPosDbContext context, IUserActivityService userActivityService)
        {
            _context = context;
            _userActivityService = userActivityService;
        }

        // GET: api/products
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Product>>> GetProducts()
        {
            return await _context.Products.Where(p => p.IsActive).OrderBy(p => p.Name).ToListAsync();
        }

        // GET: api/products/5
        [HttpGet("{id}")]
        public async Task<ActionResult<Product>> GetProduct(int id)
        {
            var product = await _context.Products.FindAsync(id);

            if (product == null)
            {
                return NotFound();
            }

            return product;
        }

        // GET: api/products/barcode/{barcode}
        [HttpGet("barcode/{barcode}")]
        public async Task<ActionResult<Product>> GetProductByBarcode(string barcode)
        {
            var product = await _context.Products.FirstOrDefaultAsync(p => p.Barcode == barcode && p.IsActive);

            if (product == null)
            {
                return NotFound();
            }

            return product;
        }

        // GET: api/products/low-stock
        [HttpGet("low-stock")]
        public async Task<ActionResult<IEnumerable<Product>>> GetLowStockProducts()
        {
            return await _context.Products
                .Where(p => p.IsActive && p.StockQuantity <= p.MinStockLevel)
                .OrderBy(p => p.StockQuantity)
                .ToListAsync();
        }

        // GET: api/products/expiring
        [HttpGet("expiring")]
        public async Task<ActionResult<IEnumerable<ProductBatch>>> GetExpiringProducts([FromQuery] int days = 30)
        {
            var currentTime = DateTime.UtcNow;
            var cutoffDate = currentTime.AddDays(days);
            
            return await _context.ProductBatches
                .Include(pb => pb.Product)
                .Where(pb => pb.ExpirationDate != null && 
                           pb.ExpirationDate <= cutoffDate && 
                           pb.Quantity > 0 &&
                           !pb.IsExpired &&
                           pb.Product.IsActive)
                .OrderBy(pb => pb.ExpirationDate)
                .ToListAsync();
        }

        // GET: api/products/5/batches
        [HttpGet("{productId}/batches")]
        public async Task<ActionResult<IEnumerable<ProductBatch>>> GetProductBatches(int productId)
        {
            var product = await _context.Products.FindAsync(productId);
            if (product == null)
            {
                return NotFound();
            }

            return await _context.ProductBatches
                .Where(pb => pb.ProductId == productId && pb.Quantity > 0)
                .OrderBy(pb => pb.ExpirationDate ?? DateTime.MaxValue)
                .ToListAsync();
        }

        // POST: api/products/5/batches
        [HttpPost("{productId}/batches")]
        public async Task<ActionResult<ProductBatch>> CreateProductBatch(int productId, CreateProductBatchRequest request)
        {
            var product = await _context.Products.FindAsync(productId);
            if (product == null)
            {
                return NotFound("Product not found");
            }

            // Validate input
            if (string.IsNullOrWhiteSpace(request.BatchNumber))
            {
                return BadRequest("Batch number is required");
            }

            if (request.Quantity <= 0)
            {
                return BadRequest("Quantity must be greater than zero");
            }

            if (request.CostPerUnit < 0)
            {
                return BadRequest("Cost per unit cannot be negative");
            }

            // Check for duplicate batch number
            if (await _context.ProductBatches.AnyAsync(pb => pb.ProductId == productId && pb.BatchNumber == request.BatchNumber))
            {
                return BadRequest("Batch number already exists for this product");
            }

            var batch = new ProductBatch
            {
                ProductId = productId,
                BatchNumber = request.BatchNumber,
                Quantity = request.Quantity,
                CostPerUnit = request.CostPerUnit,
                ReceivedDate = request.ReceivedDate ?? DateTime.UtcNow,
                ExpirationDate = request.ExpirationDate,
                ManufacturingDate = request.ManufacturingDate,
                Supplier = request.Supplier,
                LotNumber = request.LotNumber,
                CreatedDate = DateTime.UtcNow,
                LastUpdated = DateTime.UtcNow
            };

            _context.ProductBatches.Add(batch);
            
            // Update product total stock
            product.StockQuantity += request.Quantity;
            product.LastUpdated = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            // Log batch creation
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
            {
                var expiryText = request.ExpirationDate.HasValue ? $", Expires: {request.ExpirationDate:yyyy-MM-dd}" : "";
                await _userActivityService.LogActivityAsync(
                    userId,
                    userNameHeader ?? "Unknown",
                    $"Added batch: {product.Name} - {request.BatchNumber}",
                    $"Quantity: {request.Quantity}, Cost: {request.CostPerUnit:C}{expiryText}",
                    "ProductBatch",
                    batch.Id,
                    "CREATE",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );
            }

            return CreatedAtAction(nameof(GetProduct), new { id = productId }, batch);
        }

        // POST: api/products
        [HttpPost]
        public async Task<ActionResult<Product>> CreateProduct(Product product)
        {
            // Validate Barcode
            if (string.IsNullOrWhiteSpace(product.Barcode))
            {
                return BadRequest("Barcode cannot be empty");
            }

            // Validate Name
            if (string.IsNullOrWhiteSpace(product.Name))
            {
                return BadRequest("Product name cannot be empty");
            }

            // Validate Price
            if (product.Price <= 0)
            {
                return BadRequest("Price must be greater than zero");
            }

            // Validate Cost
            if (product.Cost < 0)
            {
                return BadRequest("Cost cannot be negative");
            }

            // Validate StockQuantity
            if (product.StockQuantity < 0)
            {
                return BadRequest("Stock quantity cannot be negative");
            }

            // Check if barcode already exists
            if (await _context.Products.AnyAsync(p => p.Barcode == product.Barcode))
            {
                return BadRequest("Barcode already exists");
            }

            var currentTime = DateTime.UtcNow;
            product.CreatedDate = currentTime;
            product.LastUpdated = currentTime;
            _context.Products.Add(product);
            await _context.SaveChangesAsync();

            // Log product creation activity
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
            {
                await _userActivityService.LogActivityAsync(
                    userId,
                    userNameHeader ?? "Unknown",
                    $"Created product: {product.Name}",
                    $"Barcode: {product.Barcode}, Price: {product.Price:C}, Stock: {product.StockQuantity}",
                    "Product",
                    product.Id,
                    "CREATE",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );
            }

            return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, product);
        }

        // PUT: api/products/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateProduct(int id, Product product)
        {
            if (id != product.Id)
            {
                return BadRequest();
            }

            // Get original product for logging
            var originalProduct = await _context.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
            if (originalProduct == null)
            {
                return NotFound();
            }

            // Check if another product has the same barcode
            if (await _context.Products.AnyAsync(p => p.Barcode == product.Barcode && p.Id != id))
            {
                return BadRequest("Barcode already exists");
            }

            product.LastUpdated = DateTime.UtcNow;
            _context.Entry(product).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();

                // Log product update activity
                var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
                var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
                
                if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
                {
                    // Create a summary of changes with enhanced price tracking
                    var changes = new List<string>();
                    if (originalProduct.Name != product.Name) changes.Add($"Name: '{originalProduct.Name}' → '{product.Name}'");
                    if (originalProduct.Barcode != product.Barcode) changes.Add($"Barcode: '{originalProduct.Barcode}' → '{product.Barcode}'");
                    
                    // Enhanced price change logging
                    if (originalProduct.Price != product.Price) 
                    {
                        var priceChange = product.Price - originalProduct.Price;
                        var percentChange = originalProduct.Price > 0 ? (priceChange / originalProduct.Price) * 100 : 0;
                        changes.Add($"PRICE CHANGE: {originalProduct.Price:C} → {product.Price:C} (${priceChange:+0.00;-0.00;0} / {percentChange:+0.0;-0.0;0}%)");
                        
                        // Log significant price changes separately for security
                        if (Math.Abs(percentChange) > 20) // 20% change threshold
                        {
                            await _userActivityService.LogActivityAsync(
                                userId,
                                userNameHeader ?? "Unknown",
                                $"⚠️ MAJOR PRICE CHANGE: {product.Name}",
                                $"Critical price adjustment: {originalProduct.Price:C} → {product.Price:C} ({percentChange:+0.0;-0.0;0}%) - Product: {product.Barcode} - Requires review",
                                "Product",
                                product.Id,
                                "PRICE_CHANGE_MAJOR",
                                HttpContext.Connection?.RemoteIpAddress?.ToString()
                            );
                        }
                    }
                    
                    if (originalProduct.Cost != product.Cost) changes.Add($"Cost: {originalProduct.Cost:C} → {product.Cost:C}");
                    if (originalProduct.StockQuantity != product.StockQuantity) changes.Add($"Stock: {originalProduct.StockQuantity} → {product.StockQuantity}");
                    
                    var changesSummary = changes.Any() ? string.Join(", ", changes) : "Product details updated";
                    
                    await _userActivityService.LogActivityAsync(
                        userId,
                        userNameHeader ?? "Unknown",
                        $"Updated product: {product.Name}",
                        changesSummary,
                        "Product",
                        product.Id,
                        "UPDATE",
                        HttpContext.Connection?.RemoteIpAddress?.ToString()
                    );
                }
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!ProductExists(id))
                {
                    return NotFound();
                }
                else
                {
                    throw;
                }
            }

            return NoContent();
        }

        // PUT: api/products/5/stock
        [HttpPut("{id}/stock")]
        public async Task<IActionResult> UpdateStock(int id, [FromBody] StockUpdateRequest request)
        {
            var product = await _context.Products.FindAsync(id);
            if (product == null)
            {
                return NotFound();
            }

            // Validate stock update
            if (request.NewQuantity < 0)
            {
                return BadRequest("Stock quantity cannot be negative");
            }

            var oldQuantity = product.StockQuantity;
            product.StockQuantity = request.NewQuantity;
            product.LastUpdated = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            // Log stock update activity
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
            {
                var stockChange = request.NewQuantity - oldQuantity;
                var changeType = stockChange > 0 ? "increased" : stockChange < 0 ? "decreased" : "adjusted";
                var reasonText = !string.IsNullOrEmpty(request.Reason) ? $" - Reason: {request.Reason}" : "";
                
                await _userActivityService.LogActivityAsync(
                    userId,
                    userNameHeader ?? "Unknown",
                    $"Stock {changeType} for {product.Name}: {oldQuantity} → {request.NewQuantity}",
                    $"Change: {stockChange:+0;-#}{reasonText}",
                    "Product",
                    product.Id,
                    "UPDATE",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );
            }

            return Ok(new { 
                productId = id, 
                oldQuantity = oldQuantity, 
                newQuantity = request.NewQuantity,
                updatedAt = product.LastUpdated
            });
        }

        // DELETE: api/products/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteProduct(int id)
        {
            var product = await _context.Products.FindAsync(id);
            if (product == null)
            {
                return NotFound();
            }

            // Store product info for logging before deletion
            var productName = product.Name;
            var productBarcode = product.Barcode;
            var productPrice = product.Price;
            var productStock = product.StockQuantity;

            // Hard delete - actually remove from database
            _context.Products.Remove(product);
            await _context.SaveChangesAsync();

            // Log product deletion activity
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
            {
                await _userActivityService.LogActivityAsync(
                    userId,
                    userNameHeader ?? "Unknown",
                    $"Deleted product: {productName}",
                    $"Barcode: {productBarcode}, Price: {productPrice:C}, Stock: {productStock}",
                    "Product",
                    id,
                    "DELETE",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );
            }

            return NoContent();
        }

        private bool ProductExists(int id)
        {
            return _context.Products.Any(p => p.Id == id);
        }
    }

    // DTO for stock update requests
    public class StockUpdateRequest
    {
        public int NewQuantity { get; set; }
        public string? Reason { get; set; }
    }

    // DTO for creating product batches
    public class CreateProductBatchRequest
    {
        public string BatchNumber { get; set; } = string.Empty;
        public int Quantity { get; set; }
        public decimal CostPerUnit { get; set; }
        public DateTime? ReceivedDate { get; set; }
        public DateTime? ExpirationDate { get; set; }
        public DateTime? ManufacturingDate { get; set; }
        public string? Supplier { get; set; }
        public string? LotNumber { get; set; }
    }
}