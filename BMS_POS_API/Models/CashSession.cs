using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BMS_POS_API.Models
{
    public class CashSession
    {
        public int Id { get; set; }

        [Required]
        public string SessionCode { get; set; } = string.Empty; // e.g. CS-20260317-0001

        public DateTime SessionDate { get; set; } // business date (date only, UTC midnight)

        public int OpenedByEmployeeId { get; set; }
        public Employee OpenedByEmployee { get; set; } = null!;

        public int? ClosedByEmployeeId { get; set; }
        public Employee? ClosedByEmployee { get; set; }

        public DateTime OpenedAt { get; set; } = DateTime.UtcNow;
        public DateTime? ClosedAt { get; set; }

        [Range(0, double.MaxValue)]
        public decimal OpeningCash { get; set; } = 0;

        [Range(0, double.MaxValue)]
        public decimal? ClosingCash { get; set; } // actual counted cash at close

        public string Status { get; set; } = "Open"; // Open, Closed

        public string? Notes { get; set; }

        // Terminal that owns this session (e.g. "T01", "T02")
        [Column("terminal_id")]
        [StringLength(50)]
        public string? TerminalId { get; set; }

        // Human-readable terminal name (e.g. "Register 1")
        [Column("terminal_name")]
        [StringLength(100)]
        public string? TerminalName { get; set; }
    }
}
