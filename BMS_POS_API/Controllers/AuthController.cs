using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly BmsPosDbContext _context;
        private readonly IUserActivityService _userActivityService;
        private readonly IPinSecurityService _pinSecurityService;
        private readonly IServiceProvider _serviceProvider;
        private readonly IMetricsService _metricsService;

        public AuthController(BmsPosDbContext context, IUserActivityService userActivityService, IPinSecurityService pinSecurityService, IServiceProvider serviceProvider, IMetricsService metricsService)
        {
            _context = context;
            _userActivityService = userActivityService;
            _pinSecurityService = pinSecurityService;
            _serviceProvider = serviceProvider;
            _metricsService = metricsService;
        }

        // POST: api/auth/login
        [HttpPost("login")]
        public async Task<ActionResult<ApiResponse<LoginResponse>>> Login(LoginRequest request)
        {
            // Validate input
            var validationErrors = new List<string>();
            
            if (string.IsNullOrWhiteSpace(request.EmployeeId))
            {
                validationErrors.Add("Employee ID is required");
            }

            if (string.IsNullOrWhiteSpace(request.Pin))
            {
                validationErrors.Add("PIN is required");
            }

            if (validationErrors.Any())
            {
                return BadRequest(ApiResponse<LoginResponse>.ErrorResponse(
                    AuthErrorMessages.INVALID_INPUT,
                    AuthErrorCodes.INVALID_INPUT,
                    validationErrors
                ));
            }

            Console.WriteLine($"Login attempt - Employee ID: {request.EmployeeId}, Selected Role: {request.SelectedRole}");
            
            try
            {
                // First, find the employee by ID (don't check PIN in query)
                var employee = await _context.Employees
                    .FirstOrDefaultAsync(e => e.EmployeeId == request.EmployeeId && e.IsActive);

                // Check if employee exists and verify PIN (with backward compatibility)
                if (employee == null)
                {
                    Console.WriteLine($"Employee not found for Employee ID: {request.EmployeeId}");
                    
                    // Log failed login attempt
                    await LogFailedLoginAttempt(request.EmployeeId, "Employee not found", null);
                    
                    // Log business metric
                    await _metricsService.LogLoginAttempt(request.EmployeeId, false, "Employee not found");
                    
                    return Unauthorized(ApiResponse<LoginResponse>.ErrorResponse(
                        AuthErrorMessages.EMPLOYEE_NOT_FOUND,
                        AuthErrorCodes.EMPLOYEE_NOT_FOUND
                    ));
                }

                if (!IsValidPin(employee.Pin, request.Pin))
                {
                    Console.WriteLine($"Wrong PIN for Employee ID: {request.EmployeeId}");
                    
                    // Log failed login attempt
                    await LogFailedLoginAttempt(request.EmployeeId, "Invalid PIN", employee.Id);
                    
                    // Log business metric
                    await _metricsService.LogLoginAttempt(request.EmployeeId, false, "Invalid PIN");
                    
                    return Unauthorized(ApiResponse<LoginResponse>.ErrorResponse(
                        AuthErrorMessages.INVALID_PIN,
                        AuthErrorCodes.INVALID_PIN
                    ));
                }

                // Check role validation if selectedRole is provided
                if (!string.IsNullOrEmpty(request.SelectedRole))
                {
                    var employeeRole = employee.Role ?? (employee.IsManager ? "Manager" : "Cashier");
                    Console.WriteLine($"Role validation - Employee role: {employeeRole}, Selected role: {request.SelectedRole}");
                    
                    if (!employeeRole.Equals(request.SelectedRole, StringComparison.OrdinalIgnoreCase))
                    {
                        Console.WriteLine("Role mismatch detected");
                        
                        // Log failed login attempt due to role mismatch
                        await LogFailedLoginAttempt(
                            request.EmployeeId, 
                            $"Role mismatch - Employee: {employeeRole}, Selected: {request.SelectedRole}", 
                            employee.Id
                        );
                        
                        // Log business metric
                        await _metricsService.LogLoginAttempt(request.EmployeeId, false, $"Role mismatch: {employeeRole} vs {request.SelectedRole}");
                        
                        return Unauthorized(ApiResponse<LoginResponse>.ErrorResponse(
                            $"You are registered as a {employeeRole}. Please select '{employeeRole}' and try again.",
                            AuthErrorCodes.ROLE_MISMATCH
                        ));
                    }
                }

                // Log successful login
                await _userActivityService.LogActivityAsync(
                    employee.Id,
                    employee.Name ?? employee.EmployeeId,
                    $"User logged in successfully",
                    $"Role: {employee.Role}, Manager: {employee.IsManager}",
                    "Employee",
                    employee.Id,
                    "LOGIN",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );

                // Log successful login metric
                await _metricsService.LogLoginAttempt(request.EmployeeId, true);

                var loginResponse = new LoginResponse
                {
                    Success = true,
                    Employee = employee,
                    Message = "Login successful"
                };

                return Ok(ApiResponse<LoginResponse>.SuccessResponse(loginResponse, "Login successful"));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Database error during login: {ex.Message}");
                
                // Return user-friendly database error
                return StatusCode(500, ApiResponse<LoginResponse>.ErrorResponse(
                    AuthErrorMessages.DATABASE_ERROR,
                    AuthErrorCodes.DATABASE_ERROR
                ));
            }
        }

        // POST: api/auth/validate-manager
        [HttpPost("validate-manager")]
        public async Task<ActionResult<ValidateManagerResponse>> ValidateManager(ValidateManagerRequest request)
        {
            // Find managers and verify PIN with hashing support
            var managers = await _context.Employees
                .Where(e => (e.Role == "Manager" || e.IsManager == true) && e.IsActive)
                .ToListAsync();

            // Check PIN against all managers (supports both legacy and hashed PINs)
            var manager = managers.FirstOrDefault(m => IsValidPin(m.Pin, request.Pin));

            if (manager == null)
            {
                return Ok(new ValidateManagerResponse
                {
                    Success = false,
                    Message = "Invalid manager PIN"
                });
            }

            return Ok(new ValidateManagerResponse
            {
                Success = true,
                Message = "Manager PIN validated successfully",
                ManagerName = manager.Name
            });
        }

        /// <summary>
        /// Validates PIN with backward compatibility and automatic upgrade
        /// </summary>
        private bool IsValidPin(string storedPin, string providedPin)
        {
            // Check if stored PIN is legacy (plaintext)
            if (_pinSecurityService.IsLegacyPin(storedPin))
            {
                // Legacy plaintext comparison
                bool isValid = storedPin == providedPin;
                
                // If valid, upgrade to hashed PIN in background
                if (isValid)
                {
                    _ = Task.Run(async () => await UpgradeLegacyPinAsync(storedPin, providedPin));
                }
                
                return isValid;
            }
            else
            {
                // Modern hashed PIN verification
                return _pinSecurityService.VerifyPin(providedPin, storedPin);
            }
        }

        /// <summary>
        /// Upgrades a legacy plaintext PIN to hashed PIN using separate DbContext
        /// </summary>
        private async Task UpgradeLegacyPinAsync(string storedPin, string providedPin)
        {
            try
            {
                // Create a new scope for this background operation
                using var scope = _serviceProvider.CreateScope();
                var separateContext = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();
                
                // Find employee with this legacy PIN
                var employee = await separateContext.Employees
                    .FirstOrDefaultAsync(e => e.Pin == storedPin);
                
                if (employee != null)
                {
                    // Hash the PIN and update database
                    employee.Pin = _pinSecurityService.HashPin(providedPin);
                    await separateContext.SaveChangesAsync();
                    
                    Console.WriteLine($"Upgraded legacy PIN for employee: {employee.EmployeeId}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error upgrading legacy PIN: {ex.Message}");
            }
        }

        /// <summary>
        /// Helper method to log failed login attempts with consistent error handling
        /// </summary>
        private async Task LogFailedLoginAttempt(string employeeId, string reason, int? employeeDbId)
        {
            try
            {
                await _userActivityService.LogActivityAsync(
                    null, // No valid user ID for failed attempts
                    employeeId,
                    $"Failed login attempt for employee ID: {employeeId}",
                    reason,
                    "Employee",
                    employeeDbId,
                    "LOGIN_FAILED",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );
                Console.WriteLine("Failed login logged successfully");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error logging failed login: {ex.Message}");
                // Don't throw - logging failure shouldn't break authentication
            }
        }
    }

    public class LoginRequest
    {
        public string EmployeeId { get; set; } = string.Empty;
        public string Pin { get; set; } = string.Empty;
        public string? SelectedRole { get; set; }
    }

    public class LoginResponse
    {
        public bool Success { get; set; }
        public Employee? Employee { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    public class ValidateManagerRequest
    {
        public string Pin { get; set; } = string.Empty;
    }

    public class ValidateManagerResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public string? ManagerName { get; set; }
    }
}