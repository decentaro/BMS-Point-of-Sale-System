using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/cash-sessions")]
    [Authorize]
    public class CashSessionsController : ControllerBase
    {
        private readonly BmsPosDbContext _context;
        private readonly IUserActivityService _userActivityService;

        public CashSessionsController(BmsPosDbContext context, IUserActivityService userActivityService)
        {
            _context = context;
            _userActivityService = userActivityService;
        }

        // GET: api/cash-sessions
        [HttpGet]
        public async Task<ActionResult<IEnumerable<CashSessionResponse>>> GetSessions(
            [FromQuery] int limit = 30,
            [FromQuery] string? status = null,
            [FromQuery] string? terminalId = null)
        {
            // Fall back to header if not in query string
            var tid = terminalId ?? Request.Headers["X-Terminal-Id"].FirstOrDefault();

            var query = _context.CashSessions
                .AsNoTracking()
                .Include(cs => cs.OpenedByEmployee)
                .Include(cs => cs.ClosedByEmployee)
                .AsQueryable();

            if (!string.IsNullOrEmpty(status))
                query = query.Where(cs => cs.Status == status);

            if (!string.IsNullOrEmpty(tid))
                query = query.Where(cs => cs.TerminalId == tid);

            var sessions = await query
                .OrderByDescending(cs => cs.SessionDate)
                .Take(limit)
                .ToListAsync();

            return sessions.Select(MapToResponse).ToList();
        }

        // GET: api/cash-sessions/today
        [HttpGet("today")]
        public async Task<ActionResult<CashSessionResponse?>> GetTodaySession()
        {
            var today = DateTime.SpecifyKind(DateTime.Today.ToUniversalTime(), DateTimeKind.Utc);
            var terminalId = Request.Headers["X-Terminal-Id"].FirstOrDefault();

            var query = _context.CashSessions
                .AsNoTracking()
                .Include(cs => cs.OpenedByEmployee)
                .Include(cs => cs.ClosedByEmployee)
                .Where(cs => cs.SessionDate == today);

            // Scope to terminal if provided; fall back to any session (single-terminal legacy)
            if (!string.IsNullOrEmpty(terminalId))
                query = query.Where(cs => cs.TerminalId == terminalId);

            var session = await query.OrderBy(cs => cs.Id).FirstOrDefaultAsync();

            if (session == null)
                return Ok(null);

            return Ok(MapToResponse(session));
        }

        // GET: api/cash-sessions/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<CashSessionResponse>> GetSession(int id)
        {
            var session = await _context.CashSessions
                .AsNoTracking()
                .Include(cs => cs.OpenedByEmployee)
                .Include(cs => cs.ClosedByEmployee)
                .FirstOrDefaultAsync(cs => cs.Id == id);

            if (session == null)
                return NotFound();

            return MapToResponse(session);
        }

        // POST: api/cash-sessions/open
        [HttpPost("open")]
        public async Task<ActionResult<CashSessionResponse>> OpenSession([FromBody] OpenSessionRequest request)
        {
            var employee = await _context.Employees.FindAsync(request.EmployeeId);
            if (employee == null)
                return BadRequest("Invalid employee ID.");

            var today = DateTime.SpecifyKind(DateTime.Today.ToUniversalTime(), DateTimeKind.Utc);
            var terminalId = Request.Headers["X-Terminal-Id"].FirstOrDefault();
            var terminalName = Request.Headers["X-Terminal-Name"].FirstOrDefault();

            // Enforce one session per terminal per day (or one global session for legacy terminals)
            var existingQuery = _context.CashSessions.Where(cs => cs.SessionDate == today);
            if (!string.IsNullOrEmpty(terminalId))
                existingQuery = existingQuery.Where(cs => cs.TerminalId == terminalId);
            else
                existingQuery = existingQuery.Where(cs => cs.TerminalId == null);

            var existing = await existingQuery.OrderBy(cs => cs.Id).FirstOrDefaultAsync();

            if (existing != null)
                return Conflict(new { message = "A session already exists for today.", session = MapToResponse(existing) });

            // Generate session code: CS-YYYYMMDD-TID-NNNN (includes terminal prefix when available)
            var sessionCount = await _context.CashSessions.CountAsync(cs => cs.SessionDate == today);
            var terminalPrefix = !string.IsNullOrEmpty(terminalId) ? $"-{terminalId}" : "";
            var sessionCode = $"CS-{today:yyyyMMdd}{terminalPrefix}-{(sessionCount + 1):D4}";

            var session = new CashSession
            {
                SessionCode = sessionCode,
                SessionDate = today,
                OpenedByEmployeeId = request.EmployeeId,
                OpenedAt = DateTime.UtcNow,
                OpeningCash = request.OpeningCash,
                Status = "Open",
                Notes = request.Notes,
                TerminalId = string.IsNullOrEmpty(terminalId) ? null : terminalId,
                TerminalName = string.IsNullOrEmpty(terminalName) ? null : terminalName
            };

            _context.CashSessions.Add(session);
            await _context.SaveChangesAsync();

            await _userActivityService.LogActivityAsync(
                request.EmployeeId,
                employee.Name ?? employee.EmployeeId,
                $"Opened cash session {sessionCode} with opening cash {request.OpeningCash:C}",
                $"SessionDate: {today:yyyy-MM-dd}, OpeningCash: {request.OpeningCash}",
                "CashSession",
                session.Id,
                "OPEN_SESSION",
                HttpContext.Connection?.RemoteIpAddress?.ToString()
            );

            await _context.Entry(session).Reference(s => s.OpenedByEmployee).LoadAsync();

            return CreatedAtAction(nameof(GetSession), new { id = session.Id }, MapToResponse(session));
        }

        // PUT: api/cash-sessions/{id}/close
        [HttpPut("{id}/close")]
        public async Task<ActionResult<CashSessionResponse>> CloseSession(int id, [FromBody] CloseSessionRequest request)
        {
            var session = await _context.CashSessions
                .Include(cs => cs.OpenedByEmployee)
                .FirstOrDefaultAsync(cs => cs.Id == id);

            if (session == null)
                return NotFound();

            if (session.Status == "Closed")
                return BadRequest("Session is already closed.");

            var employee = await _context.Employees.FindAsync(request.ClosedByEmployeeId);
            if (employee == null)
                return BadRequest("Invalid employee ID.");

            session.ClosedByEmployeeId = request.ClosedByEmployeeId;
            session.ClosedAt = DateTime.UtcNow;
            session.ClosingCash = request.ClosingCash;
            session.Status = "Closed";
            if (!string.IsNullOrEmpty(request.Notes))
                session.Notes = request.Notes;

            await _context.SaveChangesAsync();

            await _userActivityService.LogActivityAsync(
                request.ClosedByEmployeeId,
                employee.Name ?? employee.EmployeeId,
                $"Closed cash session {session.SessionCode} with closing cash {request.ClosingCash:C}",
                $"SessionDate: {session.SessionDate:yyyy-MM-dd}, ClosingCash: {request.ClosingCash}",
                "CashSession",
                session.Id,
                "CLOSE_SESSION",
                HttpContext.Connection?.RemoteIpAddress?.ToString()
            );

            await _context.Entry(session).Reference(s => s.ClosedByEmployee).LoadAsync();

            return MapToResponse(session);
        }

        private static CashSessionResponse MapToResponse(CashSession s) => new()
        {
            Id = s.Id,
            SessionCode = s.SessionCode,
            SessionDate = s.SessionDate,
            OpenedByEmployeeId = s.OpenedByEmployeeId,
            OpenedByEmployeeName = s.OpenedByEmployee?.Name ?? s.OpenedByEmployee?.EmployeeId ?? "",
            ClosedByEmployeeId = s.ClosedByEmployeeId,
            ClosedByEmployeeName = s.ClosedByEmployee?.Name ?? s.ClosedByEmployee?.EmployeeId,
            OpenedAt = s.OpenedAt,
            ClosedAt = s.ClosedAt,
            OpeningCash = s.OpeningCash,
            ClosingCash = s.ClosingCash,
            Status = s.Status,
            Notes = s.Notes,
            TerminalId = s.TerminalId,
            TerminalName = s.TerminalName
        };
    }

    public class OpenSessionRequest
    {
        public int EmployeeId { get; set; }
        public decimal OpeningCash { get; set; } = 0;
        public string? Notes { get; set; }
    }

    public class CloseSessionRequest
    {
        public int ClosedByEmployeeId { get; set; }
        public decimal ClosingCash { get; set; }
        public string? Notes { get; set; }
    }

    public class CashSessionResponse
    {
        public int Id { get; set; }
        public string SessionCode { get; set; } = string.Empty;
        public DateTime SessionDate { get; set; }
        public int OpenedByEmployeeId { get; set; }
        public string OpenedByEmployeeName { get; set; } = string.Empty;
        public int? ClosedByEmployeeId { get; set; }
        public string? ClosedByEmployeeName { get; set; }
        public DateTime OpenedAt { get; set; }
        public DateTime? ClosedAt { get; set; }
        public decimal OpeningCash { get; set; }
        public decimal? ClosingCash { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? Notes { get; set; }
        public string? TerminalId { get; set; }
        public string? TerminalName { get; set; }
    }
}
