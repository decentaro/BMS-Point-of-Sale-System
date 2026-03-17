using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BMS_POS_API.Models
{
    [Table("employees")]
    public class Employee
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [StringLength(10)]
        [Column("employee_id")]
        public string EmployeeId { get; set; } = string.Empty;

        [Required]
        [StringLength(60)]
        [Column("pin")]
        public string Pin { get; set; } = string.Empty;

        [Required]
        [StringLength(100)]
        [Column("name")]
        public string Name { get; set; } = string.Empty;

        [StringLength(20)]
        [Column("phone_number")]
        public string? PhoneNumber { get; set; }

        [StringLength(20)]
        [Column("employment_type")]
        public string? EmploymentType { get; set; } // Full-time, Part-time, Contractual

        [Column("hire_date")]
        public DateTime? HireDate { get; set; }

        [Required]
        [StringLength(50)]
        [Column("role")]
        public string Role { get; set; } = "Cashier"; // Comma-separated: Cashier, Inventory, Manager
        
        [Column("is_manager")]
        public bool IsManager { get; set; } = false; // Keep for backward compatibility

        [Column("is_active")]
        public bool IsActive { get; set; } = true; // New employees are active by default

        [Column("created_date")]
        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

        [Column("failed_login_attempts")]
        public int FailedLoginAttempts { get; set; } = 0;

        [Column("locked_until")]
        public DateTime? LockedUntil { get; set; }
    }
}