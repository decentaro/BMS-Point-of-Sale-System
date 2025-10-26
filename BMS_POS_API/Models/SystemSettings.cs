using System.ComponentModel.DataAnnotations;

namespace BMS_POS_API.Models
{
    public class SystemSettings
    {
        public int Id { get; set; }
        
        // Regional Settings
        [Required]
        public string DateFormat { get; set; } = "MM/DD/YYYY";
        
        [Required]
        public string DecimalSeparator { get; set; } = ".";
        
        [Required]
        public string ThousandsSeparator { get; set; } = ",";
        
        // POS Behavior Settings
        public int AutoLogoutMinutes { get; set; } = 30;
        
        [Required]
        public string DefaultPaymentMethod { get; set; } = "Cash";
        
        public string AvailablePaymentMethods { get; set; } = "Cash,Card,ETF/Digital";
        
        public bool SoundEffectsEnabled { get; set; } = true;
        
        public bool RequireManagerApprovalForDiscount { get; set; } = false;
        
        // Display Settings
        [Required]
        public string Theme { get; set; } = "light";
        
        public double FontScaling { get; set; } = 1.0;
        
        // Receipt & Printing Settings  
        public string? ReceiptFooterText { get; set; }
        
        public string? StoreLocation { get; set; }
        
        public string? PhoneNumber { get; set; }
        
        // Receipt & Printing Settings
        public string? ReceiptHeaderText { get; set; }
        
        
        public bool PrintReceiptAutomatically { get; set; } = true;
        
        public int ReceiptCopies { get; set; } = 1;
        
        [Required]
        public string ReceiptPaperSize { get; set; } = "80mm"; // 58mm, 80mm
        
        
        public bool ShowReceiptPreview { get; set; } = false;
        
        public bool EmailReceiptEnabled { get; set; } = false;
        
        public string? DefaultReceiptEmail { get; set; }
        
        
        [Required]
        public string ReceiptFontSize { get; set; } = "Normal"; // Small, Normal, Large
        
        [Required]
        public string ReceiptTemplateLayout { get; set; } = "Standard"; // Compact, Standard, Detailed
        
        public bool ShowReceiptBarcode { get; set; } = true;
        
        // Returns Policy Settings
        public bool EnableReturns { get; set; } = true;
        
        public bool RequireReceiptForReturns { get; set; } = true;
        
        public bool RequireManagerApprovalForReturns { get; set; } = false;
        
        public bool RestockReturnedItems { get; set; } = true;
        
        public bool AllowDefectiveItemReturns { get; set; } = true;
        
        public int ReturnTimeLimitDays { get; set; } = 7;
        
        public decimal ReturnManagerApprovalAmount { get; set; } = 1000.00m;
        
        public string ReturnReasons { get; set; } = "Defective Product,Wrong Size,Pet Doesn't Like,Food Allergies,Damaged Package,Changed Mind,Other";
        
        // Product Management Settings
        public string productCategories { get; set; } = "Pet Food,Pet Toys,Pet Accessories,Pet Medicine,Pet Grooming,Pet Treats";
        
        // Timestamps
        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
        
        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
    }
}