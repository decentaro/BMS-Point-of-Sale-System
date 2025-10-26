using System.ComponentModel.DataAnnotations;

namespace BMS_POS_API.Models
{
    public class SaleItem
    {
        public int Id { get; set; }
        
        public int SaleId { get; set; }
        public Sale Sale { get; set; } = null!;
        
        public int ProductId { get; set; }
        public Product Product { get; set; } = null!;
        
        [Range(1, int.MaxValue)]
        public int Quantity { get; set; }
        
        [Range(0, double.MaxValue)]
        public decimal UnitPrice { get; set; }
        
        [Range(0, double.MaxValue)]
        public decimal LineTotal { get; set; }
        
        // Store product details at time of sale (for historical accuracy)
        public string ProductName { get; set; } = string.Empty;
        public string? ProductBarcode { get; set; }
    }
}