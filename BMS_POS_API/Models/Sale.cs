using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BMS_POS_API.Models
{
    public class Sale
    {
        public int Id { get; set; }
        
        [Required]
        public string TransactionId { get; set; } = string.Empty;
        
        public int EmployeeId { get; set; }
        public Employee Employee { get; set; } = null!;
        
        public DateTime SaleDate { get; set; } = DateTime.UtcNow;
        
        [Range(0, double.MaxValue)]
        public decimal Subtotal { get; set; }
        
        [Range(0, 100)]
        public decimal TaxRate { get; set; } = 0; // Percentage
        
        [Range(0, double.MaxValue)]
        public decimal TaxAmount { get; set; }
        
        [Range(0, double.MaxValue)]
        public decimal DiscountAmount { get; set; } = 0;
        
        [StringLength(100)]
        public string? DiscountReason { get; set; }
        
        [Range(0, double.MaxValue)]
        public decimal Total { get; set; }
        
        [Range(0, double.MaxValue)]
        public decimal AmountPaid { get; set; }
        
        public decimal Change { get; set; }
        
        public string PaymentMethod { get; set; } = "Cash"; // Cash, Card, etc.
        
        public string Status { get; set; } = "Completed"; // Completed, Voided, Refunded
        
        public List<SaleItem> SaleItems { get; set; } = new List<SaleItem>();
        
        public string? Notes { get; set; }

        // Deduplication key — prevents duplicate records if the same request is retried
        [Column("idempotency_key")]
        public string? IdempotencyKey { get; set; }

        // Terminal that processed this sale (e.g. "T01", "T02")
        [Column("terminal_id")]
        [StringLength(50)]
        public string? TerminalId { get; set; }
    }
}