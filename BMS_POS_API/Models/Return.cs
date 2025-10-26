using System.ComponentModel.DataAnnotations;

namespace BMS_POS_API.Models
{
    public class Return
    {
        public int Id { get; set; }
        
        [Required]
        public string ReturnId { get; set; } = string.Empty; // Unique return identifier
        
        public int OriginalSaleId { get; set; }
        public Sale OriginalSale { get; set; } = null!;
        
        public DateTime ReturnDate { get; set; } = DateTime.UtcNow;
        
        [Required]
        public string Status { get; set; } = "Completed"; // Completed, Pending, Cancelled
        
        public decimal TotalRefundAmount { get; set; }
        
        public int ProcessedByEmployeeId { get; set; }
        public Employee ProcessedByEmployee { get; set; } = null!;
        
        public int? ApprovedByEmployeeId { get; set; }
        public Employee? ApprovedByEmployee { get; set; }
        
        public bool ManagerApprovalRequired { get; set; } = false;
        
        public string? Notes { get; set; }
        
        // Navigation property
        public List<ReturnItem> ReturnItems { get; set; } = new List<ReturnItem>();
    }
    
    public class ReturnItem
    {
        public int Id { get; set; }
        
        public int ReturnId { get; set; }
        public Return Return { get; set; } = null!;
        
        public int OriginalSaleItemId { get; set; }
        public SaleItem OriginalSaleItem { get; set; } = null!;
        
        public int ProductId { get; set; }
        public Product Product { get; set; } = null!;
        
        [Required]
        public string ProductName { get; set; } = string.Empty;
        
        public int ReturnQuantity { get; set; }
        
        public decimal UnitPrice { get; set; }
        
        public decimal LineTotal { get; set; }
        
        [Required]
        public string Condition { get; set; } = "good"; // good, defective
        
        [Required]
        public string Reason { get; set; } = string.Empty;
        
        public bool RestockedToInventory { get; set; } = false;
    }
}