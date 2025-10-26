using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/system-settings")]
    public class SystemSettingsController : ControllerBase
    {
        private readonly BmsPosDbContext _context;
        private readonly IUserActivityService _userActivityService;

        public SystemSettingsController(BmsPosDbContext context, IUserActivityService userActivityService)
        {
            _context = context;
            _userActivityService = userActivityService;
        }

        // GET: api/system-settings
        [HttpGet]
        public async Task<ActionResult<SystemSettings>> GetSystemSettings()
        {
            // Get the single system settings record (should only be one per system)
            var settings = await _context.SystemSettings.FirstOrDefaultAsync();
            
            if (settings == null)
            {
                // Return default settings if none exist
                return new SystemSettings();
            }

            return settings;
        }

        // POST: api/system-settings
        [HttpPost]
        public async Task<ActionResult<SystemSettings>> CreateOrUpdateSystemSettings(SystemSettings request)
        {
            
            // Check if settings already exist
            var existingSettings = await _context.SystemSettings.FirstOrDefaultAsync();
            
            if (existingSettings != null)
            {
                // Store original values for logging
                var originalSettings = new
                {
                    DateFormat = existingSettings.DateFormat,
                    ReceiptHeaderText = existingSettings.ReceiptHeaderText,
                    ReceiptFooterText = existingSettings.ReceiptFooterText,
                    PrintReceiptAutomatically = existingSettings.PrintReceiptAutomatically,
                    Theme = existingSettings.Theme,
                    AutoLogoutMinutes = existingSettings.AutoLogoutMinutes
                };

                // Update existing settings (preserve ID and CreatedDate)
                request.Id = existingSettings.Id;
                request.CreatedDate = existingSettings.CreatedDate;
                request.LastUpdated = DateTime.UtcNow;
                
                _context.Entry(existingSettings).CurrentValues.SetValues(request);
                await _context.SaveChangesAsync();

                // Log system settings update activity
                var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
                var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
                
                if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
                {
                    // Create a summary of changes
                    var changes = new List<string>();
                    if (originalSettings.DateFormat != request.DateFormat) changes.Add($"Date Format: '{originalSettings.DateFormat}' → '{request.DateFormat}'");
                    if (originalSettings.ReceiptHeaderText != request.ReceiptHeaderText) changes.Add($"Receipt Header: '{originalSettings.ReceiptHeaderText}' → '{request.ReceiptHeaderText}'");
                    if (originalSettings.ReceiptFooterText != request.ReceiptFooterText) changes.Add($"Receipt Footer: '{originalSettings.ReceiptFooterText}' → '{request.ReceiptFooterText}'");
                    if (originalSettings.PrintReceiptAutomatically != request.PrintReceiptAutomatically) changes.Add($"Auto Print Receipt: {originalSettings.PrintReceiptAutomatically} → {request.PrintReceiptAutomatically}");
                    if (originalSettings.Theme != request.Theme) changes.Add($"Theme: '{originalSettings.Theme}' → '{request.Theme}'");
                    if (originalSettings.AutoLogoutMinutes != request.AutoLogoutMinutes) changes.Add($"Auto Logout: {originalSettings.AutoLogoutMinutes} → {request.AutoLogoutMinutes} minutes");
                    
                    var changesSummary = changes.Any() ? string.Join(", ", changes) : "System settings updated";
                    
                    await _userActivityService.LogActivityAsync(
                        userId,
                        userNameHeader ?? "Unknown",
                        $"Updated system settings",
                        changesSummary,
                        "SystemSettings",
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
                request.CreatedDate = DateTime.UtcNow;
                request.LastUpdated = DateTime.UtcNow;
                
                _context.SystemSettings.Add(request);
                await _context.SaveChangesAsync();

                // Log system settings creation activity
                var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
                var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
                
                if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
                {
                    await _userActivityService.LogActivityAsync(
                        userId,
                        userNameHeader ?? "Unknown",
                        $"Created initial system settings",
                        $"Theme: {request.Theme}, Date Format: {request.DateFormat}",
                        "SystemSettings",
                        request.Id,
                        "CREATE",
                        HttpContext.Connection?.RemoteIpAddress?.ToString()
                    );
                }

                return CreatedAtAction(nameof(GetSystemSettings), request);
            }
        }

        // POST: api/system-settings/upload-logo
        [HttpPost("upload-logo")]
        public async Task<ActionResult> UploadLogo(IFormFile logo)
        {
            if (logo == null || logo.Length == 0)
            {
                return BadRequest("No file uploaded");
            }

            // Validate file type
            var allowedTypes = new[] { "image/bmp" };
            if (!allowedTypes.Contains(logo.ContentType))
            {
                return BadRequest("Invalid file type. Only BMP files are allowed for thermal printer compatibility.");
            }

            // Validate file size (2MB max)
            if (logo.Length > 2 * 1024 * 1024)
            {
                return BadRequest("File too large. Maximum size is 2MB.");
            }

            try
            {
                // Create uploads directory if it doesn't exist
                var uploadsDir = Path.Combine(Directory.GetCurrentDirectory(), "uploads");
                if (!Directory.Exists(uploadsDir))
                {
                    Directory.CreateDirectory(uploadsDir);
                }

                // Generate unique filename
                var fileExtension = Path.GetExtension(logo.FileName);
                var fileName = $"logo_{DateTime.UtcNow:yyyyMMdd_HHmmss}{fileExtension}";
                var filePath = Path.Combine(uploadsDir, fileName);

                // Save file
                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await logo.CopyToAsync(stream);
                }

                // Return relative path for database storage
                var relativePath = $"/uploads/{fileName}";
                return Ok(new { filePath = relativePath });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error saving file: {ex.Message}");
            }
        }

        // GET: api/system-settings/business-time
        [HttpGet("business-time")]
        public ActionResult<object> GetCurrentBusinessTime()
        {
            try
            {
                var businessTime = DateTime.UtcNow;
                return Ok(new { businessTime = businessTime.ToString("yyyy-MM-ddTHH:mm:ss.fff") });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error getting business time: {ex.Message}");
            }
        }

    }
}