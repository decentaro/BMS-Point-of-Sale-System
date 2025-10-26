using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/tax-settings")]
    public class TaxSettingsController : ControllerBase
    {
        private readonly BmsPosDbContext _context;
        private readonly IUserActivityService _userActivityService;

        public TaxSettingsController(BmsPosDbContext context, IUserActivityService userActivityService)
        {
            _context = context;
            _userActivityService = userActivityService;
        }

        // GET: api/tax-settings
        [HttpGet]
        public async Task<ActionResult<TaxSettings>> GetTaxSettings()
        {
            // Get the single tax settings record (should only be one per business)
            var settings = await _context.TaxSettings.FirstOrDefaultAsync();
            
            if (settings == null)
            {
                return NotFound("No tax settings configured");
            }

            return settings;
        }

        // POST: api/tax-settings
        [HttpPost]
        public async Task<ActionResult<TaxSettings>> CreateOrUpdateTaxSettings(TaxSettingsRequest request)
        {
            // Check if settings already exist
            var existingSettings = await _context.TaxSettings.FirstOrDefaultAsync();
            
            if (existingSettings != null)
            {
                // Store original values for logging
                var originalSettings = new
                {
                    BusinessName = existingSettings.BusinessName,
                    TaxNumber = existingSettings.TaxNumber,
                    BusinessAddress = existingSettings.BusinessAddress,
                    EnableTax = existingSettings.EnableTax,
                    TaxName = existingSettings.TaxName,
                    TaxRate = existingSettings.TaxRate,
                    EnableSecondaryTax = existingSettings.EnableSecondaryTax,
                    SecondaryTaxName = existingSettings.SecondaryTaxName,
                    SecondaryTaxRate = existingSettings.SecondaryTaxRate,
                    EnableTaxExemptions = existingSettings.EnableTaxExemptions,
                    Notes = existingSettings.Notes
                };

                // Update existing settings
                existingSettings.BusinessName = request.BusinessName;
                existingSettings.TaxNumber = request.TaxNumber;
                existingSettings.BusinessAddress = request.BusinessAddress;
                existingSettings.EnableTax = request.EnableTax;
                existingSettings.TaxName = request.TaxName;
                existingSettings.TaxRate = request.TaxRate;
                existingSettings.EnableSecondaryTax = request.EnableSecondaryTax;
                existingSettings.SecondaryTaxName = request.SecondaryTaxName;
                existingSettings.SecondaryTaxRate = request.SecondaryTaxRate;
                existingSettings.EnableTaxExemptions = request.EnableTaxExemptions;
                existingSettings.Notes = request.Notes;
                existingSettings.LastUpdated = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                // Log tax settings update activity
                var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
                var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
                
                if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
                {
                    // Create a summary of changes
                    var changes = new List<string>();
                    if (originalSettings.BusinessName != request.BusinessName) changes.Add($"Business Name: '{originalSettings.BusinessName}' → '{request.BusinessName}'");
                    if (originalSettings.TaxNumber != request.TaxNumber) changes.Add($"Tax Number: '{originalSettings.TaxNumber}' → '{request.TaxNumber}'");
                    if (originalSettings.EnableTax != request.EnableTax) changes.Add($"Tax Enabled: {originalSettings.EnableTax} → {request.EnableTax}");
                    if (originalSettings.TaxRate != request.TaxRate) changes.Add($"Tax Rate: {originalSettings.TaxRate}% → {request.TaxRate}%");
                    if (originalSettings.EnableSecondaryTax != request.EnableSecondaryTax) changes.Add($"Secondary Tax Enabled: {originalSettings.EnableSecondaryTax} → {request.EnableSecondaryTax}");
                    if (originalSettings.SecondaryTaxRate != request.SecondaryTaxRate) changes.Add($"Secondary Tax Rate: {originalSettings.SecondaryTaxRate}% → {request.SecondaryTaxRate}%");
                    if (originalSettings.EnableTaxExemptions != request.EnableTaxExemptions) changes.Add($"Tax Exemptions: {originalSettings.EnableTaxExemptions} → {request.EnableTaxExemptions}");
                    
                    var changesSummary = changes.Any() ? string.Join(", ", changes) : "Tax settings updated";
                    
                    await _userActivityService.LogActivityAsync(
                        userId,
                        userNameHeader ?? "Unknown",
                        $"Updated tax settings",
                        changesSummary,
                        "TaxSettings",
                        existingSettings.Id,
                        "UPDATE",
                        HttpContext.Connection?.RemoteIpAddress?.ToString()
                    );
                }

                return Ok(existingSettings);
            }
            else
            {
                // Create new settings
                var newSettings = new TaxSettings
                {
                    BusinessName = request.BusinessName,
                    TaxNumber = request.TaxNumber,
                    BusinessAddress = request.BusinessAddress,
                    EnableTax = request.EnableTax,
                    TaxName = request.TaxName,
                    TaxRate = request.TaxRate,
                    EnableSecondaryTax = request.EnableSecondaryTax,
                    SecondaryTaxName = request.SecondaryTaxName,
                    SecondaryTaxRate = request.SecondaryTaxRate,
                    EnableTaxExemptions = request.EnableTaxExemptions,
                    Notes = request.Notes,
                    CreatedDate = DateTime.UtcNow,
                    LastUpdated = DateTime.UtcNow
                };

                _context.TaxSettings.Add(newSettings);
                await _context.SaveChangesAsync();

                // Log tax settings creation activity
                var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
                var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
                
                if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
                {
                    await _userActivityService.LogActivityAsync(
                        userId,
                        userNameHeader ?? "Unknown",
                        $"Created initial tax settings",
                        $"Business: {request.BusinessName}, Tax Rate: {request.TaxRate}%, Tax Enabled: {request.EnableTax}",
                        "TaxSettings",
                        newSettings.Id,
                        "CREATE",
                        HttpContext.Connection?.RemoteIpAddress?.ToString()
                    );
                }

                return CreatedAtAction(nameof(GetTaxSettings), newSettings);
            }
        }

        // GET: api/tax-settings/calculate
        [HttpPost("calculate")]
        public async Task<ActionResult<TaxCalculationResponse>> CalculateTax(TaxCalculationRequest request)
        {
            var settings = await _context.TaxSettings.FirstOrDefaultAsync();
            
            if (settings == null)
            {
                return BadRequest("No tax settings configured. Please configure tax settings first.");
            }

            var response = new TaxCalculationResponse
            {
                Subtotal = request.Subtotal,
                TaxType = request.IsExempt == true ? "Exempt" : "Standard",
                TaxRate = 0,
                TaxAmount = 0,
                SecondaryTaxRate = 0,
                SecondaryTaxAmount = 0,
                Total = request.Subtotal
            };

            if (!settings.EnableTax || request.IsExempt == true)
            {
                response.TaxLabel = "Tax Exempt";
                response.Total = request.Subtotal - (request.DiscountAmount ?? 0);
                return response;
            }

            // Calculate primary tax
            response.TaxRate = settings.TaxRate;
            response.TaxAmount = (request.Subtotal * settings.TaxRate) / 100;
            response.TaxLabel = $"{settings.TaxName} ({settings.TaxRate}%)";

            // Calculate secondary tax if enabled
            if (settings.EnableSecondaryTax)
            {
                response.SecondaryTaxRate = settings.SecondaryTaxRate;
                response.SecondaryTaxAmount = (request.Subtotal * settings.SecondaryTaxRate) / 100;
                response.SecondaryTaxLabel = $"{settings.SecondaryTaxName} ({settings.SecondaryTaxRate}%)";
            }

            response.Total = request.Subtotal + response.TaxAmount + response.SecondaryTaxAmount - (request.DiscountAmount ?? 0);

            return response;
        }
    }

    // Request/Response DTOs
    public class TaxSettingsRequest
    {
        public string BusinessName { get; set; } = string.Empty;
        public string TaxNumber { get; set; } = string.Empty;
        public string BusinessAddress { get; set; } = string.Empty;
        public bool EnableTax { get; set; } = true;
        public string TaxName { get; set; } = "Sales Tax";
        public decimal TaxRate { get; set; } = 10;
        public bool EnableSecondaryTax { get; set; } = false;
        public string SecondaryTaxName { get; set; } = "Service Tax";
        public decimal SecondaryTaxRate { get; set; } = 5;
        public bool EnableTaxExemptions { get; set; } = false;
        public string? Notes { get; set; }
    }

    public class TaxCalculationRequest
    {
        public decimal Subtotal { get; set; }
        public bool? IsExempt { get; set; } // For tax-exempt sales
        public decimal? DiscountAmount { get; set; }
    }

    public class TaxCalculationResponse
    {
        public decimal Subtotal { get; set; }
        public string TaxType { get; set; } = string.Empty;
        public decimal TaxRate { get; set; }
        public decimal TaxAmount { get; set; }
        public string TaxLabel { get; set; } = string.Empty;
        public decimal SecondaryTaxRate { get; set; }
        public decimal SecondaryTaxAmount { get; set; }
        public string? SecondaryTaxLabel { get; set; }
        public decimal Total { get; set; }
    }
}