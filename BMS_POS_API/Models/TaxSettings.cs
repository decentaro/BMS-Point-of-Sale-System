using System.ComponentModel.DataAnnotations;

namespace BMS_POS_API.Models
{
    public class TaxSettings
    {
        public int Id { get; set; }
        
        [Required]
        public string BusinessName { get; set; } = string.Empty;
        
        public string TaxNumber { get; set; } = string.Empty;
        
        public string BusinessAddress { get; set; } = string.Empty;
        
        public bool EnableTax { get; set; } = true;
        
        public string TaxName { get; set; } = "Sales Tax";
        
        [Range(0, 100)]
        public decimal TaxRate { get; set; } = 10;
        
        public bool EnableSecondaryTax { get; set; } = false;
        
        public string SecondaryTaxName { get; set; } = "Service Tax";
        
        [Range(0, 100)]
        public decimal SecondaryTaxRate { get; set; } = 5;
        
        public bool EnableTaxExemptions { get; set; } = false;
        
        public string? Notes { get; set; }
        
        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
        
        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
    }
}