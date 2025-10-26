using Xunit;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests
{
    public class SimpleTest : TestBase
    {
        [Fact]
        public void Database_ShouldHave_TestData()
        {
            // Act
            var employees = Context.Employees.ToList();
            
            // Assert
            Assert.Equal(3, employees.Count);
            Assert.Contains(employees, e => e.EmployeeId == "TEST001");
            Assert.Contains(employees, e => e.EmployeeId == "TEST002");
            Assert.Contains(employees, e => e.EmployeeId == "TEST003");
        }

        [Fact]
        public async Task Employee_Login_ShouldWork()
        {
            // Arrange
            var employeeId = "TEST001";
            var pin = "123456";
            
            // Act
            var employee = await Context.Employees
                .FirstOrDefaultAsync(e => e.EmployeeId == employeeId && e.Pin == pin);
            
            // Assert
            Assert.NotNull(employee);
            Assert.Equal("Test Manager", employee.Name);
            Assert.True(employee.IsManager);
        }
    }
}