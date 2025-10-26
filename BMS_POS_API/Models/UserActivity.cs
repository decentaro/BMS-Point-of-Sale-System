using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BMS_POS_API.Models
{
    public class UserActivity
    {
        [Key]
        public int Id { get; set; }
        
        public int? UserId { get; set; }
        
        [Required]
        [MaxLength(100)]
        public string UserName { get; set; } = string.Empty;
        
        [Required]
        [MaxLength(200)]
        public string Action { get; set; } = string.Empty;
        
        public string? Details { get; set; }
        
        [MaxLength(45)]
        public string? IPAddress { get; set; }
        
        [Required]
        public DateTime Timestamp { get; set; }
        
        [MaxLength(50)]
        public string? EntityType { get; set; }
        
        public int? EntityId { get; set; }
        
        [MaxLength(20)]
        public string? ActionType { get; set; } // CREATE, UPDATE, DELETE, VIEW, LOGIN, etc.
        
        // Navigation properties
        [ForeignKey("UserId")]
        public virtual Employee? User { get; set; }
    }
}