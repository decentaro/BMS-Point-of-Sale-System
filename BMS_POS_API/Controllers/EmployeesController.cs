using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;
using System.Linq;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
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
            var query = _context.Employees.AsQueryable();
            
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

            if (employee.Pin.Length != 6)
            {
                return BadRequest("PIN must be exactly 6 characters long");
            }

            if (!employee.Pin.All(char.IsDigit))
            {
                return BadRequest("PIN must contain only digits");
            }

            // Validate Role
            var validRoles = new[] { "Manager", "Cashier", "Inventory" };
            if (string.IsNullOrWhiteSpace(employee.Role) || !validRoles.Contains(employee.Role))
            {
                return BadRequest("Role must be one of: Manager, Cashier, Inventory");
            }

            // Check if employee ID already exists
            if (await _context.Employees.AnyAsync(e => e.EmployeeId == employee.EmployeeId))
            {
                return BadRequest("Employee ID already exists");
            }

            // Hash the PIN before saving
            employee.Pin = _pinSecurityService.HashPin(employee.Pin);
            employee.CreatedDate = DateTime.UtcNow;
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

            // Clear change tracker to avoid conflicts
            _context.ChangeTracker.Clear();

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

            if (request.NewPin.Length != 6)
            {
                return BadRequest("PIN must be exactly 6 characters long");
            }

            if (!request.NewPin.All(char.IsDigit))
            {
                return BadRequest("PIN must contain only digits");
            }

            // Store old PIN info for logging (don't log actual PIN values for security)
            var oldPinLength = employee.Pin?.Length ?? 0;

            // Hash and update PIN
            employee.Pin = _pinSecurityService.HashPin(request.NewPin);
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
    }

    public class ResetPinRequest
    {
        public string NewPin { get; set; } = string.Empty;
    }
}