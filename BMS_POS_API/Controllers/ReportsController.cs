using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ReportsController : ControllerBase
    {
        private readonly BmsPosDbContext _context;

        public ReportsController(BmsPosDbContext context)
        {
            _context = context;
        }

        // GET: api/reports/z-report?date=2026-03-17&terminalId=T01
        [HttpGet("z-report")]
        public async Task<ActionResult<ZReportResponse>> GetZReport(
            [FromQuery] string? date = null,
            [FromQuery] string? terminalId = null)
        {
            DateTime reportDate;
            if (string.IsNullOrEmpty(date))
                reportDate = DateTime.SpecifyKind(DateTime.Today.ToUniversalTime(), DateTimeKind.Utc);
            else if (!DateTime.TryParse(date, out reportDate))
                return BadRequest("Invalid date format. Use yyyy-MM-dd.");
            else
                reportDate = DateTime.SpecifyKind(reportDate.Date.ToUniversalTime(), DateTimeKind.Utc);
            var nextDay = reportDate.AddDays(1);

            // Fall back to request header if not in query string
            var tid = terminalId ?? Request.Headers["X-Terminal-Id"].FirstOrDefault();

            return Ok(await BuildZReport(reportDate, nextDay, tid));
        }

        // GET: api/reports/z-report-range?startDate=2026-03-10&endDate=2026-03-17&terminalId=T01
        [HttpGet("z-report-range")]
        public async Task<ActionResult<List<ZReportSummaryRow>>> GetZReportRange(
            [FromQuery] string startDate,
            [FromQuery] string endDate,
            [FromQuery] string? terminalId = null)
        {
            if (!DateTime.TryParse(startDate, out var start))
                return BadRequest("Invalid startDate format. Use yyyy-MM-dd.");
            if (!DateTime.TryParse(endDate, out var end))
                return BadRequest("Invalid endDate format. Use yyyy-MM-dd.");

            start = DateTime.SpecifyKind(start.Date.ToUniversalTime(), DateTimeKind.Utc);
            end = DateTime.SpecifyKind(end.Date.ToUniversalTime(), DateTimeKind.Utc);

            if (end < start)
                return BadRequest("endDate must be on or after startDate.");

            if ((end - start).TotalDays > 90)
                return BadRequest("Date range cannot exceed 90 days.");

            // Fall back to request header if not in query string
            var tid = terminalId ?? Request.Headers["X-Terminal-Id"].FirstOrDefault();

            // Bulk fetch for the entire range: 3 queries instead of N*3
            var rangeEnd = end.AddDays(1);

            var sessionsQuery = _context.CashSessions
                .AsNoTracking()
                .Include(cs => cs.OpenedByEmployee)
                .Include(cs => cs.ClosedByEmployee)
                .Where(cs => cs.SessionDate >= start && cs.SessionDate < rangeEnd);
            if (!string.IsNullOrEmpty(tid))
                sessionsQuery = sessionsQuery.Where(cs => cs.TerminalId == tid);
            var sessions = await sessionsQuery.ToListAsync();

            var salesQuery = _context.Sales
                .AsNoTracking()
                .Where(s => s.SaleDate >= start && s.SaleDate < rangeEnd && s.Status == "Completed");
            if (!string.IsNullOrEmpty(tid))
                salesQuery = salesQuery.Where(s => s.TerminalId == tid);
            var allSales = await salesQuery.ToListAsync();

            var returnsQuery = _context.Returns
                .AsNoTracking()
                .Where(r => r.ReturnDate >= start && r.ReturnDate < rangeEnd && r.Status == "Completed");
            if (!string.IsNullOrEmpty(tid))
                returnsQuery = returnsQuery.Where(r => r.TerminalId == tid);
            var allReturns = await returnsQuery.ToListAsync();

            var results = new List<ZReportSummaryRow>();
            var current = start;

            while (current <= end)
            {
                var nextDay = current.AddDays(1);
                var utcMidnight = DateTime.SpecifyKind(current.ToLocalTime().Date, DateTimeKind.Utc);
                var session = sessions.FirstOrDefault(cs => cs.SessionDate == current || cs.SessionDate == utcMidnight);
                var daySales = allSales.Where(s => s.SaleDate >= current && s.SaleDate < nextDay).ToList();
                var dayReturns = allReturns.Where(r => r.ReturnDate >= current && r.ReturnDate < nextDay).ToList();

                var report = ComputeZReport(current, session, daySales, dayReturns);
                results.Add(new ZReportSummaryRow
                {
                    Date = report.Date,
                    SessionCode = report.SessionCode,
                    SessionStatus = report.SessionStatus,
                    TotalTransactions = report.TotalTransactions,
                    GrossSales = report.GrossSales,
                    TotalDiscounts = report.TotalDiscounts,
                    NetSales = report.NetSales,
                    TotalTax = report.TotalTax,
                    TotalReturns = report.TotalReturns,
                    TotalRefunds = report.TotalRefunds,
                    NetRevenue = report.NetRevenue,
                    CashSales = report.CashSales,
                    CardSales = report.CardSales,
                    OpeningCash = report.OpeningCash,
                    ClosingCash = report.ClosingCash,
                    ExpectedClosingCash = report.ExpectedClosingCash,
                    CashVariance = report.CashVariance
                });
                current = current.AddDays(1);
            }

            return Ok(results);
        }

        private async Task<ZReportResponse> BuildZReport(DateTime reportDate, DateTime nextDay, string? terminalId = null)
        {
            // Load cash session for this date.
            // Sessions may be stored as local-midnight UTC (new) or UTC midnight (legacy),
            // so check both to avoid missing sessions after the timezone fix.
            var utcMidnight = DateTime.SpecifyKind(reportDate.ToLocalTime().Date, DateTimeKind.Utc);
            var sessionQuery = _context.CashSessions
                .AsNoTracking()
                .Include(cs => cs.OpenedByEmployee)
                .Include(cs => cs.ClosedByEmployee)
                .Where(cs => cs.SessionDate == reportDate || cs.SessionDate == utcMidnight);
            if (!string.IsNullOrEmpty(terminalId))
                sessionQuery = sessionQuery.Where(cs => cs.TerminalId == terminalId);
            var session = await sessionQuery.FirstOrDefaultAsync();

            var salesQuery = _context.Sales
                .AsNoTracking()
                .Where(s => s.SaleDate >= reportDate && s.SaleDate < nextDay && s.Status == "Completed");
            if (!string.IsNullOrEmpty(terminalId))
                salesQuery = salesQuery.Where(s => s.TerminalId == terminalId);
            var sales = await salesQuery.ToListAsync();

            var returnsQuery = _context.Returns
                .AsNoTracking()
                .Where(r => r.ReturnDate >= reportDate && r.ReturnDate < nextDay && r.Status == "Completed");
            if (!string.IsNullOrEmpty(terminalId))
                returnsQuery = returnsQuery.Where(r => r.TerminalId == terminalId);
            var returns = await returnsQuery.ToListAsync();

            return ComputeZReport(reportDate, session, sales, returns);
        }

        private static ZReportResponse ComputeZReport(
            DateTime reportDate,
            CashSession? session,
            List<Sale> sales,
            List<Return> returns)
        {
            // Payment breakdown from sales
            var paymentBreakdown = sales
                .GroupBy(s => s.PaymentMethod)
                .Select(g => new ZReportPaymentBreakdown
                {
                    PaymentMethod = g.Key,
                    TransactionCount = g.Count(),
                    TotalAmount = g.Sum(s => s.Total)
                })
                .OrderByDescending(p => p.TotalAmount)
                .ToList();

            // Sale.Subtotal = pre-discount, pre-tax item total (set by POS from cart totals).
            // Gross = raw item prices before any deductions.
            // Net   = what was earned after discounts, before tax (Total already has tax baked in).
            var grossSales     = sales.Sum(s => s.Subtotal);
            var netSales       = sales.Sum(s => s.Total - s.TaxAmount);
            var totalDiscounts = sales.Sum(s => s.DiscountAmount);
            var totalTax       = sales.Sum(s => s.TaxAmount);
            var cashSales      = sales.Where(s => s.PaymentMethod == "Cash").Sum(s => s.Total);
            var cardSales      = sales.Where(s => s.PaymentMethod != "Cash").Sum(s => s.Total);

            // Returns breakdown — cash refunds reduce expected closing cash
            var totalRefunds = returns.Sum(r => r.TotalRefundAmount);
            var cashRefunds  = totalRefunds; // simplified: all refunds treated as cash

            var openingCash         = session?.OpeningCash ?? 0;
            var expectedClosingCash = openingCash + cashSales - cashRefunds;
            decimal? cashVariance   = session?.ClosingCash.HasValue == true
                ? session.ClosingCash!.Value - expectedClosingCash
                : null;

            return new ZReportResponse
            {
                Date = reportDate,
                SessionId = session?.Id,
                SessionCode = session?.SessionCode ?? "",
                SessionStatus = session?.Status ?? "No Session",
                OpenedByEmployeeName = session?.OpenedByEmployee?.Name ?? session?.OpenedByEmployee?.EmployeeId,
                ClosedByEmployeeName = session?.ClosedByEmployee?.Name ?? session?.ClosedByEmployee?.EmployeeId,
                OpenedAt = session?.OpenedAt,
                ClosedAt = session?.ClosedAt,
                OpeningCash = openingCash,
                ClosingCash = session?.ClosingCash,
                TotalTransactions = sales.Count,
                GrossSales = grossSales,
                TotalDiscounts = totalDiscounts,
                NetSales = netSales,
                TotalTax = totalTax,
                TotalReturns = returns.Count,
                TotalRefunds = totalRefunds,
                NetRevenue = netSales + totalTax - totalRefunds,
                CashSales = cashSales,
                CardSales = cardSales,
                PaymentBreakdown = paymentBreakdown,
                ExpectedClosingCash = expectedClosingCash,
                CashVariance = cashVariance,
                Notes = session?.Notes
            };
        }
    }

    public class ZReportResponse
    {
        public DateTime Date { get; set; }
        public int? SessionId { get; set; }
        public string SessionCode { get; set; } = string.Empty;
        public string SessionStatus { get; set; } = string.Empty;
        public string? OpenedByEmployeeName { get; set; }
        public string? ClosedByEmployeeName { get; set; }
        public DateTime? OpenedAt { get; set; }
        public DateTime? ClosedAt { get; set; }
        public decimal OpeningCash { get; set; }
        public decimal? ClosingCash { get; set; }
        public int TotalTransactions { get; set; }
        public decimal GrossSales { get; set; }
        public decimal TotalDiscounts { get; set; }
        public decimal NetSales { get; set; }
        public decimal TotalTax { get; set; }
        public int TotalReturns { get; set; }
        public decimal TotalRefunds { get; set; }
        public decimal NetRevenue { get; set; }
        public decimal CashSales { get; set; }
        public decimal CardSales { get; set; }
        public List<ZReportPaymentBreakdown> PaymentBreakdown { get; set; } = new();
        public decimal ExpectedClosingCash { get; set; }
        public decimal? CashVariance { get; set; }
        public string? Notes { get; set; }
    }

    public class ZReportPaymentBreakdown
    {
        public string PaymentMethod { get; set; } = string.Empty;
        public int TransactionCount { get; set; }
        public decimal TotalAmount { get; set; }
    }

    public class ZReportSummaryRow
    {
        public DateTime Date { get; set; }
        public string SessionCode { get; set; } = string.Empty;
        public string SessionStatus { get; set; } = string.Empty;
        public int TotalTransactions { get; set; }
        public decimal GrossSales { get; set; }
        public decimal TotalDiscounts { get; set; }
        public decimal NetSales { get; set; }
        public decimal TotalTax { get; set; }
        public int TotalReturns { get; set; }
        public decimal TotalRefunds { get; set; }
        public decimal NetRevenue { get; set; }
        public decimal CashSales { get; set; }
        public decimal CardSales { get; set; }
        public decimal OpeningCash { get; set; }
        public decimal? ClosingCash { get; set; }
        public decimal ExpectedClosingCash { get; set; }
        public decimal? CashVariance { get; set; }
    }
}
