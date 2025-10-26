using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BMS_POS_API.Models
{
    [Table("stock_adjustments")]
    public class StockAdjustment
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
        [Column("adjustment_type")]
        [StringLength(50)]
        public string AdjustmentType { get; set; } = string.Empty; // "DAMAGE", "THEFT", "EXPIRED", "FOUND", "CORRECTION", "RETURN"

        [Required]
        [Column("quantity_change")]
        public int QuantityChange { get; set; } // Can be negative

        [Required]
        [Column("quantity_before")]
        public int QuantityBefore { get; set; }

        [Required]
        [Column("quantity_after")]
        public int QuantityAfter { get; set; }

        [Required]
        [StringLength(500)]
        [Column("reason")]
        public string Reason { get; set; } = string.Empty;

        [Column("notes")]
        [StringLength(1000)]
        public string? Notes { get; set; }

        [Required]
        [Column("adjusted_by_employee_id")]
        public int AdjustedByEmployeeId { get; set; }

        [ForeignKey("AdjustedByEmployeeId")]
        public Employee AdjustedByEmployee { get; set; } = null!;

        [Column("cost_impact", TypeName = "decimal(10,2)")]
        public decimal CostImpact { get; set; } // Financial impact of adjustment

        [Column("adjustment_date")]
        public DateTime AdjustmentDate { get; set; } = DateTime.UtcNow;

        [StringLength(200)]
        [Column("reference_number")]
        public string? ReferenceNumber { get; set; } // For tracking external docs

        [Column("requires_approval")]
        public bool RequiresApproval { get; set; } = false;

        [Column("is_approved")]
        public bool IsApproved { get; set; } = false;

        [Column("approved_by_employee_id")]
        public int? ApprovedByEmployeeId { get; set; }

        [ForeignKey("ApprovedByEmployeeId")]
        public Employee? ApprovedByEmployee { get; set; }

        [Column("approved_date")]
        public DateTime? ApprovedDate { get; set; }
    }
}