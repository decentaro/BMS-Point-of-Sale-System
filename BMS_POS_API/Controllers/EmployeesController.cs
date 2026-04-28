using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;
using System.Linq;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class EmployeesController : ControllerBase
    {
        private readonly BmsPosDbContext _context;
        private readonly IUserActivityService _userActivityService;
        private readonly IPinSecurityService _pinSecurityService;

        public EmployeesController(BmsPosDbContext context, IUserActivityService userActivityService, IPinSecurityService pinSecurityService)
        {
            _context = context;
            _userActivityService = userActivityService;
            _pinSecurityService = pinSecurityService;
        }

        // GET: api/employees
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Employee>>> GetEmployees([FromQuery] bool includeInactive = false)
        {
            var query = _context.Employees.AsNoTracking().AsQueryable();
            
            if (!includeInactive)
            {
                query = query.Where(e => e.IsActive);
            }
            
            var employees = await query.ToListAsync();
            return Ok(employees);
        }

        // GET: api/employees/5
        [HttpGet("{id}")]
        public async Task<ActionResult<Employee>> GetEmployee(int id)
        {
            var employee = await _context.Employees.FindAsync(id);

            if (employee == null)
            {
                return NotFound();
            }

            return Ok(employee);
        }

        // POST: api/employees
        [HttpPost]
        [Authorize(Roles = "Manager")]
        public async Task<ActionResult<Employee>> CreateEmployee(Employee employee)
        {
            // Validate EmployeeId
            if (string.IsNullOrWhiteSpace(employee.EmployeeId))
            {
                return BadRequest("Employee ID cannot be empty");
            }

            // Validate Name
            if (string.IsNullOrWhiteSpace(employee.Name))
            {
                return BadRequest("Employee name cannot be empty");
            }

            // Validate PIN
            if (string.IsNullOrWhiteSpace(employee.Pin))
            {
                return BadRequest("PIN cannot be empty");
            }

            var pinError = await ValidatePin(employee.Pin);
            if (pinError != null)
                return BadRequest(pinError);

            // Validate Role (supports comma-separated multi-role, e.g. "Cashier,Inventory")
            var validRoles = new HashSet<string> { "Manager", "Cashier", "Inventory" };
            var assignedRoles = (employee.Role ?? "").Split(',').Select(r => r.Trim()).Where(r => r.Length > 0).ToArray();
            if (assignedRoles.Length == 0 || assignedRoles.Any(r => !validRoles.Contains(r)))
            {
                return BadRequest("Each role must be one of: Manager, Cashier, Inventory");
            }
            employee.Role = string.Join(",", assignedRoles.Distinct());

            // Check if employee ID already exists
            if (await _context.Employees.AnyAsync(e => e.EmployeeId == employee.EmployeeId))
            {
                return BadRequest("Employee ID already exists");
            }

            // Hash the PIN before saving
            employee.Pin = _pinSecurityService.HashPin(employee.Pin);
            employee.CreatedDate = DateTime.UtcNow;
            if (employee.HireDate.HasValue && employee.HireDate.Value.Kind == DateTimeKind.Unspecified)
                employee.HireDate = DateTime.SpecifyKind(employee.HireDate.Value, DateTimeKind.Utc);
            _context.Employees.Add(employee);
            await _context.SaveChangesAsync();

            // Log employee creation activity
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
            {
                await _userActivityService.LogActivityAsync(
                    userId,
                    userNameHeader ?? "Unknown",
                    $"Created employee: {employee.Name ?? employee.EmployeeId}",
                    $"Employee ID: {employee.EmployeeId}, Role: {employee.Role}, Manager: {employee.IsManager}",
                    "Employee",
                    employee.Id,
                    "CREATE",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );
            }

            return CreatedAtAction(nameof(GetEmployee), new { id = employee.Id }, employee);
        }

        // PUT: api/employees/5
        [HttpPut("{id}")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> UpdateEmployee(int id, Employee employee)
        {
            if (id != employee.Id)
            {
                return BadRequest();
            }

            // Get original employee for logging
            var originalEmployee = await _context.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id);
            if (originalEmployee == null)
            {
                return NotFound();
            }

            // Check if another employee has the same employee ID
            if (await _context.Employees.AnyAsync(e => e.EmployeeId == employee.EmployeeId && e.Id != id))
            {
                return BadRequest("Employee ID already exists");
            }

            // Validate Role (supports comma-separated multi-role, e.g. "Cashier,Inventory")
            var validRoles = new HashSet<string> { "Manager", "Cashier", "Inventory" };
            var assignedRoles = (employee.Role ?? "").Split(',').Select(r => r.Trim()).Where(r => r.Length > 0).ToArray();
            if (assignedRoles.Length == 0 || assignedRoles.Any(r => !validRoles.Contains(r)))
            {
                return BadRequest("Each role must be one of: Manager, Cashier, Inventory");
            }
            employee.Role = string.Join(",", assignedRoles.Distinct());

            if (employee.HireDate.HasValue && employee.HireDate.Value.Kind == DateTimeKind.Unspecified)
                employee.HireDate = DateTime.SpecifyKind(employee.HireDate.Value, DateTimeKind.Utc);

            // Detach any locally-tracked instance with the same key before attaching the updated one,
            // so EF Core doesn't throw on duplicate-key tracking (e.g. in unit test contexts).
            var tracked = _context.Employees.Local.FirstOrDefault(e => e.Id == id);
            if (tracked != null)
                _context.Entry(tracked).State = EntityState.Detached;

            _context.Entry(employee).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();

                // Log employee update activity
                var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
                var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
                
                if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
                {
                    // Create a summary of changes
                    var changes = new List<string>();
                    if (originalEmployee.Name != employee.Name) changes.Add($"Name: '{originalEmployee.Name}' → '{employee.Name}'");
                    if (originalEmployee.EmployeeId != employee.EmployeeId) changes.Add($"Employee ID: '{originalEmployee.EmployeeId}' → '{employee.EmployeeId}'");
                    if (originalEmployee.Pin != employee.Pin) changes.Add("PIN updated");
                    if (originalEmployee.Role != employee.Role) changes.Add($"Role: '{originalEmployee.Role}' → '{employee.Role}'");
                    if (originalEmployee.IsManager != employee.IsManager) changes.Add($"Manager status: {originalEmployee.IsManager} → {employee.IsManager}");
                    if (originalEmployee.IsActive != employee.IsActive) changes.Add($"Active status: {originalEmployee.IsActive} → {employee.IsActive}");
                    
                    var changesSummary = changes.Any() ? string.Join(", ", changes) : "Employee details updated";
                    
                    await _userActivityService.LogActivityAsync(
                        userId,
                        userNameHeader ?? "Unknown",
                        $"Updated employee: {employee.Name ?? employee.EmployeeId}",
                        changesSummary,
                        "Employee",
                        employee.Id,
                        "UPDATE",
                        HttpContext.Connection?.RemoteIpAddress?.ToString()
                    );
                }
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!EmployeeExists(id))
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

        // PUT: api/employees/5/deactivate
        [HttpPut("{id}/deactivate")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> DeactivateEmployee(int id)
        {
            var employee = await _context.Employees.FindAsync(id);
            if (employee == null)
            {
                return NotFound();
            }

            if (!employee.IsActive)
            {
                return BadRequest("Employee is already inactive");
            }

            employee.IsActive = false;
            await _context.SaveChangesAsync();

            // Log employee deactivation activity
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
            {
                await _userActivityService.LogActivityAsync(
                    userId,
                    userNameHeader ?? "Unknown",
                    $"Deactivated employee: {employee.Name ?? employee.EmployeeId}",
                    $"Employee ID: {employee.EmployeeId}, Role: {employee.Role}, Manager: {employee.IsManager}",
                    "Employee",
                    id,
                    "DEACTIVATE",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );
            }

            return NoContent();
        }

        // PUT: api/employees/5/activate
        [HttpPut("{id}/activate")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> ActivateEmployee(int id)
        {
            var employee = await _context.Employees.FindAsync(id);
            if (employee == null)
            {
                return NotFound();
            }

            if (employee.IsActive)
            {
                return BadRequest("Employee is already active");
            }

            employee.IsActive = true;
            await _context.SaveChangesAsync();

            // Log employee activation activity
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
            {
                await _userActivityService.LogActivityAsync(
                    userId,
                    userNameHeader ?? "Unknown",
                    $"Activated employee: {employee.Name ?? employee.EmployeeId}",
                    $"Employee ID: {employee.EmployeeId}, Role: {employee.Role}, Manager: {employee.IsManager}",
                    "Employee",
                    id,
                    "ACTIVATE",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );
            }

            return NoContent();
        }

        // PUT: api/employees/5/reset-pin
        [HttpPut("{id}/reset-pin")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> ResetEmployeePin(int id, ResetPinRequest request)
        {
            var employee = await _context.Employees.FindAsync(id);
            if (employee == null)
            {
                return NotFound("Employee not found");
            }

            // Validate PIN requirements
            if (string.IsNullOrWhiteSpace(request.NewPin))
            {
                return BadRequest("PIN cannot be empty");
            }

            var pinError = await ValidatePin(request.NewPin);
            if (pinError != null)
                return BadRequest(pinError);

            // Store old PIN info for logging (don't log actual PIN values for security)
            var oldPinLength = employee.Pin?.Length ?? 0;

            // Hash and update PIN; clear any forced-change requirement
            employee.Pin = _pinSecurityService.HashPin(request.NewPin);
            employee.MustChangePinOnNextLogin = false;
            await _context.SaveChangesAsync();

            // Log PIN reset activity
            var userIdHeader = Request.Headers["X-User-Id"].FirstOrDefault();
            var userNameHeader = Request.Headers["X-User-Name"].FirstOrDefault();
            
            if (!string.IsNullOrEmpty(userIdHeader) && int.TryParse(userIdHeader, out int userId))
            {
                await _userActivityService.LogActivityAsync(
                    userId,
                    userNameHeader ?? "Unknown",
                    $"Reset PIN for employee: {employee.Name ?? employee.EmployeeId}",
                    $"Employee ID: {employee.EmployeeId}, PIN length changed from {oldPinLength} to {request.NewPin?.Length ?? 0} digits",
                    "Employee",
                    id,
                    "PIN_RESET",
                    HttpContext.Connection?.RemoteIpAddress?.ToString()
                );
            }

            return Ok(new { message = "PIN reset successfully" });
        }

        private bool EmployeeExists(int id)
        {
            return _context.Employees.Any(e => e.Id == id);
        }

        /// <summary>
        /// Validates a plain-text PIN against length and optional strength rules.
        /// Returns null on success, or a descriptive error message on failure.
        /// </summary>
        private async Task<string?> ValidatePin(string pin)
        {
            if (!pin.All(char.IsDigit))
                return "PIN must contain digits only — no letters or special characters";

            if (pin.Length < 4)
                return $"PIN is too short — minimum 4 digits (you entered {pin.Length})";

            if (pin.Length > 6)
                return $"PIN is too long — maximum 6 digits (you entered {pin.Length})";

            var settings = await _context.AdminSettings.FirstOrDefaultAsync();
            if (settings?.RequireStrongPins == true)
            {
                if (pin.Length < 6)
                    return $"Strong PINs are required — minimum 6 digits (you entered {pin.Length})";

                if (pin.Distinct().Count() == 1)
                    return "PIN is too weak — all digits are the same (e.g. 1111). Use a mix of digits";

                bool ascending = true, descending = true;
                for (int i = 1; i < pin.Length; i++)
                {
                    if (pin[i] - pin[i - 1] != 1) ascending  = false;
                    if (pin[i - 1] - pin[i] != 1) descending = false;
                }
                if (ascending || descending)
                    return "PIN is too weak — sequential digits (e.g. 1234) are not allowed. Use a mix of digits";
            }

            return null;
        }
    }

    public class ResetPinRequest
    {
        public string NewPin { get; set; } = string.Empty;
    }
}