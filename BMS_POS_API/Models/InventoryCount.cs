using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BMS_POS_API.Models
{
    [Table("inventory_counts")]
    public class InventoryCount
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [StringLength(100)]
        [Column("count_name")]
        public string CountName { get; set; } = string.Empty; // "Monthly Count - December 2024"

        [Required]
        [Column("count_type")]
        [StringLength(50)]
        public string CountType { get; set; } = string.Empty; // "FULL", "CYCLE", "SPOT", "ANNUAL"

        [Column("started_date")]
        public DateTime StartedDate { get; set; } = DateTime.UtcNow;

        [Column("completed_date")]
        public DateTime? CompletedDate { get; set; }

        [Required]
        [Column("status")]
        [StringLength(20)]
        public string Status { get; set; } = "IN_PROGRESS"; // "IN_PROGRESS", "COMPLETED", "CANCELLED"

        [Required]
        [Column("started_by_employee_id")]
        public int StartedByEmployeeId { get; set; }

        [ForeignKey("StartedByEmployeeId")]
        public Employee StartedByEmployee { get; set; } = null!;

        [Column("completed_by_employee_id")]
        public int? CompletedByEmployeeId { get; set; }

        [ForeignKey("CompletedByEmployeeId")]
        public Employee? CompletedByEmployee { get; set; }

        [StringLength(500)]
        [Column("notes")]
        public string? Notes { get; set; }

        [Column("total_items_counted")]
        public int TotalItemsCounted { get; set; } = 0;

        [Column("total_discrepancies")]
        public int TotalDiscrepancies { get; set; } = 0;

        [Column("total_shrinkage_value", TypeName = "decimal(10,2)")]
        public decimal TotalShrinkageValue { get; set; } = 0;

        [Column("total_overage_value", TypeName = "decimal(10,2)")]
        public decimal TotalOverageValue { get; set; } = 0;

        [Column("net_variance_value", TypeName = "decimal(10,2)")]
        public decimal NetVarianceValue { get; set; } = 0;

        // Navigation properties
        public ICollection<InventoryCountItem> CountItems { get; set; } = new List<InventoryCountItem>();
    }

    [Table("inventory_count_items")]
    public class InventoryCountItem
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [Column("inventory_count_id")]
        public int InventoryCountId { get; set; }

        [ForeignKey("InventoryCountId")]
        public InventoryCount InventoryCount { get; set; } = null!;

        [Required]
        [Column("product_id")]
        public int ProductId { get; set; }

        [ForeignKey("ProductId")]
        public Product Product { get; set; } = null!;

        [Column("product_batch_id")]
        public int? ProductBatchId { get; set; }

        [ForeignKey("ProductBatchId")]
        public ProductBatch? ProductBatch { get; set; }

        [Required]
        [Column("system_quantity")]
        public int SystemQuantity { get; set; } // What system says we have

        [Required]
        [Column("counted_quantity")]
        public int CountedQuantity { get; set; } // What was actually counted

        [Required]
        [Column("variance")]
        public int Variance { get; set; } // Difference (counted - system)

        [Column("cost_per_unit", TypeName = "decimal(10,2)")]
        public decimal CostPerUnit { get; set; }

        [Column("variance_value", TypeName = "decimal(10,2)")]
        public decimal VarianceValue { get; set; } // Financial impact

        [StringLength(200)]
        [Column("discrepancy_reason")]
        public string? DiscrepancyReason { get; set; }

        [StringLength(500)]
        [Column("notes")]
        public string? Notes { get; set; }

        [Required]
        [Column("counted_by_employee_id")]
        public int CountedByEmployeeId { get; set; }

        [ForeignKey("CountedByEmployeeId")]
        public Employee CountedByEmployee { get; set; } = null!;

        [Column("counted_date")]
        public DateTime CountedDate { get; set; } = DateTime.UtcNow;

        [Column("is_verified")]
        public bool IsVerified { get; set; } = false;

        [Column("verified_by_employee_id")]
        public int? VerifiedByEmployeeId { get; set; }

        [ForeignKey("VerifiedByEmployeeId")]
        public Employee? VerifiedByEmployee { get; set; }

        [Column("verified_date")]
        public DateTime? VerifiedDate { get; set; }
    }
}