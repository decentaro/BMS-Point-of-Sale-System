using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [AllowAnonymous]
    public class AuthController : ControllerBase
    {
        private readonly BmsPosDbContext _context;
        private readonly IUserActivityService _userActivityService;
        private readonly IPinSecurityService _pinSecurityService;
        private readonly IMetricsService _metricsService;
        private readonly ILoginLockoutService _lockoutService;
        private readonly JwtSecretHolder _jwtSecretHolder;
        private readonly TokenDenylistService _denylist;

        public AuthController(
            BmsPosDbContext context,
            IUserActivityService userActivityService,
            IPinSecurityService pinSecurityService,
            IMetricsService metricsService,
            ILoginLockoutService lockoutService,
            JwtSecretHolder jwtSecretHolder,
            TokenDenylistService denylist)
        {
            _context = context;
            _userActivityService = userActivityService;
            _pinSecurityService = pinSecurityService;
            _metricsService = metricsService;
            _lockoutService = lockoutService;
            _jwtSecretHolder = jwtSecretHolder;
            _denylist = denylist;
        }

        // POST: api/auth/login
        [HttpPost("login")]
        [EnableRateLimiting("auth")]
        public async Task<ActionResult<ApiResponse<LoginResponse>>> Login(LoginRequest request)
        {
            // Validate input
            var validationErrors = new List<string>();

            if (string.IsNullOrWhiteSpace(request.EmployeeId))
                validationErrors.Add("Employee ID is required");

            if (string.IsNullOrWhiteSpace(request.Pin))
                validationErrors.Add("PIN is required");

            if (validationErrors.Any())
            {
                return BadRequest(ApiResponse<LoginResponse>.ErrorResponse(
                    AuthErrorMessages.INVALID_INPUT,
                    AuthErrorCodes.INVALID_INPUT,
                    validationErrors
                ));
            }

            // Check account lockout before hitting the database
            if (await _lockoutService.IsLockedOutAsync(request.EmployeeId))
            {
                return StatusCode(423, ApiResponse<LoginResponse>.ErrorResponse(
                    "Account temporarily locked due to too many failed attempts. Try again in 15 minutes.",
                    "ACCOUNT_LOCKED"
                ));
            }

            try
            {
                // Load max attempts from admin settings (default 5)
                var adminSettings = await _context.AdminSettings.FirstOrDefaultAsync();
                var maxAttempts = adminSettings?.MaxFailedLoginAttempts ?? 5;

                var employee = await _context.Employees
                    .FirstOrDefaultAsync(e => e.EmployeeId == request.EmployeeId && e.IsActive);

                if (employee == null)
                {
                    await _lockoutService.RecordFailedAttemptAsync(request.EmployeeId, maxAttempts);
                    await LogFailedLoginAttempt(request.EmployeeId, "Employee not found", null);
                    await _metricsService.LogLoginAttempt(request.EmployeeId, false, "Employee not found");
                    return Unauthorized(ApiResponse<LoginResponse>.ErrorResponse(
                        AuthErrorMessages.EMPLOYEE_NOT_FOUND,
                        AuthErrorCodes.EMPLOYEE_NOT_FOUND
                    ));
                }

                if (!IsValidPin(employee.Pin, request.Pin))
                {
                    await _lockoutService.RecordFailedAttemptAsync(request.EmployeeId, maxAttempts);
                    await LogFailedLoginAttempt(request.EmployeeId, "Invalid PIN", employee.Id);
                    await _metricsService.LogLoginAttempt(request.EmployeeId, false, "Invalid PIN");
                    return Unauthorized(ApiResponse<LoginResponse>.ErrorResponse(
                        AuthErrorMessages.INVALID_PIN,
                        AuthErrorCodes.INVALID_PIN
                    ));
                }

                if (!string.IsNullOrEmpty(request.SelectedRole))
                {
                    var employeeRoles = (employee.Role ?? (employee.IsManager ? "Manager" : "Cashier"))
                        .Split(',').Select(r => r.Trim()).ToArray();
                    if (!employeeRoles.Any(r => r.Equals(request.SelectedRole, StringComparison.OrdinalIgnoreCase)))
                    {
                        var rolesDisplay = string.Join(" or ", employeeRoles);
                        await _lockoutService.RecordFailedAttemptAsync(request.EmployeeId, maxAttempts);
                        await LogFailedLoginAttempt(
                            request.EmployeeId,
                            $"Role mismatch - Employee roles: {string.Join(",", employeeRoles)}, Selected: {request.SelectedRole}",
                            employee.Id
                        );
                        await _metricsService.LogLoginAttempt(request.EmployeeId, false, $"Role mismatch: {string.Join(",", employeeRoles)} vs {request.SelectedRole}");
                        return Unauthorized(ApiResponse<LoginResponse>.ErrorResponse(
                            $"You are not assigned the '{request.SelectedRole}' role. Please select one of: {rolesDisplay}.",
                            AuthErrorCodes.ROLE_MISMATCH
                        ));
                    }
                }

                // Success — reset lockout counter
                await _lockoutService.ResetAttemptsAsync(request.EmployeeId);

                // Synchronously upgrade legacy plaintext PIN to BCrypt hash.
                // Done here (not fire-and-forget) so plaintext never persists
                // past a successful login.
                if (_pinSecurityService.IsLegacyPin(employee.Pin))
                {
                    employee.Pin = _pinSecurityService.HashPin(request.Pin);
                    try
                    {
                        await _context.SaveChangesAsync();
                    }
                    catch (Exception ex)
                    {
                        // Log but don't fail login — PIN still works on next attempt
                        Console.WriteLine($"Failed to upgrade legacy PIN for employee {employee.EmployeeId}: {ex.Message}");
                    }
                }

                // Generate JWT
                var token = GenerateJwt(employee);

                // Log successful login
                await _userActivityService.LogActivityAsync(
                    employee.Id,
                    employee.Name ?? employee.EmployeeId,
                    "User logged in successfully",
                    $"Role: {employee.Role}, Manager: {employee.IsManager}",
                    "Employee",
                    employee.Id,
                    "LOGIN",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );

                await _metricsService.LogLoginAttempt(request.EmployeeId, true);

                var loginResponse = new LoginResponse
                {
                    Success = true,
                    Employee = employee,
                    Token = token,
                    Message = "Login successful"
                };

                return Ok(ApiResponse<LoginResponse>.SuccessResponse(loginResponse, "Login successful"));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Database error during login: {ex.Message}");
                return StatusCode(500, ApiResponse<LoginResponse>.ErrorResponse(
                    AuthErrorMessages.DATABASE_ERROR,
                    AuthErrorCodes.DATABASE_ERROR
                ));
            }
        }

        // POST: api/auth/logout
        [HttpPost("logout")]
        [Authorize]
        public IActionResult Logout()
        {
            var jti = User.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;
            var expClaim = User.FindFirst(JwtRegisteredClaimNames.Exp)?.Value;

            if (jti != null)
            {
                var expiresAt = expClaim != null && long.TryParse(expClaim, out var exp)
                    ? DateTimeOffset.FromUnixTimeSeconds(exp).UtcDateTime
                    : DateTime.UtcNow.AddHours(12);
                _denylist.Revoke(jti, expiresAt);
            }

            return Ok(new { message = "Logged out" });
        }

        private string GenerateJwt(Employee employee)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSecretHolder.Secret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
            var roleString = employee.Role ?? (employee.IsManager ? "Manager" : "Cashier");
            var roles = roleString.Split(',').Select(r => r.Trim()).Where(r => !string.IsNullOrEmpty(r));

            var claims = new List<Claim>
            {
                new Claim(JwtRegisteredClaimNames.Sub, employee.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.UniqueName, employee.EmployeeId),
                new Claim(ClaimTypes.Name, employee.Name ?? employee.EmployeeId),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };
            claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));

            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.UtcNow.AddHours(12),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        // POST: api/auth/validate-manager
        [HttpPost("validate-manager")]
        [EnableRateLimiting("auth")]
        public async Task<ActionResult<ValidateManagerResponse>> ValidateManager(ValidateManagerRequest request)
        {
            const string lockoutKey = "manager_pin_global";
            const int maxAttempts = 5;

            if (await _lockoutService.IsLockedOutAsync(lockoutKey))
                return Ok(new ValidateManagerResponse { Success = false, Message = "Too many failed attempts. Please wait before trying again." });

            // Load candidates broadly in SQL, then filter strictly in memory to avoid
            // substring false-positives (e.g. "AssistantManager" containing "Manager")
            var candidates = await _context.Employees
                .Where(e => (e.Role.Contains("Manager") || e.IsManager == true) && e.IsActive)
                .ToListAsync();

            var managers = candidates.Where(m =>
                (m.Role ?? "").Split(',').Select(r => r.Trim())
                    .Contains("Manager", StringComparer.OrdinalIgnoreCase)
                || m.IsManager == true).ToList();

            // Check PIN against all managers (supports both legacy and hashed PINs)
            var manager = managers.FirstOrDefault(m => IsValidPin(m.Pin, request.Pin));

            if (manager == null)
            {
                await _lockoutService.RecordFailedAttemptAsync(lockoutKey, maxAttempts);
                return Ok(new ValidateManagerResponse
                {
                    Success = false,
                    Message = "Invalid manager PIN"
                });
            }

            await _lockoutService.ResetAttemptsAsync(lockoutKey);
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
            if (_pinSecurityService.IsLegacyPin(storedPin))
                return storedPin == providedPin;

            return _pinSecurityService.VerifyPin(providedPin, storedPin);
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
        public string? Token { get; set; }
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