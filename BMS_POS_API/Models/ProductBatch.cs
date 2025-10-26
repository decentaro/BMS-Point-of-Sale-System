using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BMS_POS_API.Models
{
    [Table("product_batches")]
    public class ProductBatch
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [Column("product_id")]
        public int ProductId { get; set; }

        [ForeignKey("ProductId")]
        public Product Product { get; set; } = null!;

        [Required]
        [StringLength(100)]
        [Column("batch_number")]
        public string BatchNumber { get; set; } = string.Empty;

        [Required]
        [Column("quantity")]
        public int Quantity { get; set; }

        [Required]
        [Column("cost_per_unit", TypeName = "decimal(10,2)")]
        public decimal CostPerUnit { get; set; }

        [Column("received_date")]
        public DateTime ReceivedDate { get; set; } = DateTime.UtcNow;

        [Column("expiration_date")]
        public DateTime? ExpirationDate { get; set; }

        [Column("manufacturing_date")]
        public DateTime? ManufacturingDate { get; set; }

        [StringLength(100)]
        [Column("supplier")]
        public string? Supplier { get; set; }

        [StringLength(100)]
        [Column("lot_number")]
        public string? LotNumber { get; set; } // Supplier's lot number

        [Column("is_expired")]
        public bool IsExpired { get; set; } = false;

        [Column("is_recalled")]
        public bool IsRecalled { get; set; } = false;

        [StringLength(500)]
        [Column("recall_reason")]
        public string? RecallReason { get; set; }

        [Column("days_until_expiry")]
        public int? DaysUntilExpiry 
        { 
            get 
            {
                if (ExpirationDate == null) return null;
                var days = (ExpirationDate.Value.Date - DateTime.UtcNow.Date).Days;
                return days;
            }
        }

        [Column("expiry_status")]
        public string ExpiryStatus
        {
            get
            {
                if (ExpirationDate == null) return "NO_EXPIRY";
                if (IsExpired) return "EXPIRED";
                
                var daysLeft = DaysUntilExpiry ?? 0;
                if (daysLeft <= 0) return "EXPIRED";
                if (daysLeft <= 7) return "CRITICAL";
                if (daysLeft <= 30) return "WARNING";
                if (daysLeft <= 60) return "CAUTION";
                return "GOOD";
            }
        }

        [Column("created_date")]
        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

        [Column("last_updated")]
        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public ICollection<SaleItem> SaleItems { get; set; } = new List<SaleItem>();
    }
}