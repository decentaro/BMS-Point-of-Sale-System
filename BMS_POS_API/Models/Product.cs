using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BMS_POS_API.Models
{
    [Table("products")]
    public class Product
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [StringLength(50)]
        [Column("barcode")]
        public string Barcode { get; set; } = string.Empty;

        [Required]
        [StringLength(200)]
        [Column("name")]
        public string Name { get; set; } = string.Empty;

        [StringLength(500)]
        [Column("description")]
        public string? Description { get; set; }

        [Required]
        [Column("price", TypeName = "decimal(10,2)")]
        public decimal Price { get; set; }

        [Required]
        [Column("cost", TypeName = "decimal(10,2)")]
        public decimal Cost { get; set; }

        [Required]
        [Column("stock_quantity")]
        public int StockQuantity { get; set; }

        [Required]
        [Column("min_stock_level")]
        public int MinStockLevel { get; set; } = 5;

        [StringLength(100)]
        [Column("variant")]
        public string? Variant { get; set; }

        [StringLength(100)]
        [Column("brand")]
        public string? Brand { get; set; }

        [StringLength(100)]
        [Column("category")]
        public string? Category { get; set; }

        [StringLength(500)]
        [Column("image_url")]
        public string? ImageUrl { get; set; }

        [StringLength(20)]
        [Column("unit")]
        public string Unit { get; set; } = "pcs"; // pieces, kg, liter, etc.

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_date")]
        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

        [Column("last_updated")]
        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
    }
}