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

        // GET: api/reports/z-report?date=2026-03-17
        [HttpGet("z-report")]
        public async Task<ActionResult<ZReportResponse>> GetZReport([FromQuery] string? date = null)
        {
            DateTime reportDate;
            if (string.IsNullOrEmpty(date))
                reportDate = DateTime.UtcNow.Date;
            else if (!DateTime.TryParse(date, out reportDate))
                return BadRequest("Invalid date format. Use yyyy-MM-dd.");

            reportDate = DateTime.SpecifyKind(reportDate.Date, DateTimeKind.Utc);
            var nextDay = reportDate.AddDays(1);

            return Ok(await BuildZReport(reportDate, nextDay));
        }

        // GET: api/reports/z-report-range?startDate=2026-03-10&endDate=2026-03-17
        [HttpGet("z-report-range")]
        public async Task<ActionResult<List<ZReportSummaryRow>>> GetZReportRange(
            [FromQuery] string startDate,
            [FromQuery] string endDate)
        {
            if (!DateTime.TryParse(startDate, out var start))
                return BadRequest("Invalid startDate format. Use yyyy-MM-dd.");
            if (!DateTime.TryParse(endDate, out var end))
                return BadRequest("Invalid endDate format. Use yyyy-MM-dd.");

            start = DateTime.SpecifyKind(start.Date, DateTimeKind.Utc);
            end = DateTime.SpecifyKind(end.Date, DateTimeKind.Utc);

            if (end < start)
                return BadRequest("endDate must be on or after startDate.");

            if ((end - start).TotalDays > 90)
                return BadRequest("Date range cannot exceed 90 days.");

            var results = new List<ZReportSummaryRow>();
            var current = start;

            while (current <= end)
            {
                var nextDay = current.AddDays(1);
                var report = await BuildZReport(current, nextDay);
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

        private async Task<ZReportResponse> BuildZReport(DateTime reportDate, DateTime nextDay)
        {
            // Load cash session for this date
            var session = await _context.CashSessions
                .Include(cs => cs.OpenedByEmployee)
                .Include(cs => cs.ClosedByEmployee)
                .FirstOrDefaultAsync(cs => cs.SessionDate == reportDate);

            // Load all completed sales for this date
            var sales = await _context.Sales
                .Where(s => s.SaleDate >= reportDate && s.SaleDate < nextDay && s.Status == "Completed")
                .ToListAsync();

            // Load all returns for this date
            var returns = await _context.Returns
                .Where(r => r.ReturnDate >= reportDate && r.ReturnDate < nextDay && r.Status == "Completed")
                .ToListAsync();

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

            var grossSales = sales.Sum(s => s.Subtotal + s.DiscountAmount); // pre-discount subtotal
            var netSales = sales.Sum(s => s.Total);
            var totalDiscounts = sales.Sum(s => s.DiscountAmount);
            var totalTax = sales.Sum(s => s.TaxAmount);
            var cashSales = sales.Where(s => s.PaymentMethod == "Cash").Sum(s => s.Total);
            var cardSales = sales.Where(s => s.PaymentMethod != "Cash").Sum(s => s.Total);

            // Returns breakdown — cash refunds reduce expected closing cash
            var cashRefunds = returns.Sum(r => r.TotalRefundAmount); // simplified: all refunds treated as cash
            var totalRefunds = returns.Sum(r => r.TotalRefundAmount);

            var openingCash = session?.OpeningCash ?? 0;
            var expectedClosingCash = openingCash + cashSales - cashRefunds;
            decimal? cashVariance = session?.ClosingCash.HasValue == true
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
        public decimal CashSales { get; set; }
        public decimal CardSales { get; set; }
        public decimal OpeningCash { get; set; }
        public decimal? ClosingCash { get; set; }
        public decimal ExpectedClosingCash { get; set; }
        public decimal? CashVariance { get; set; }
    }
}
