using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class AddForeignKeyIndexesAndConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_products_barcode",
                table: "products");

            migrationBuilder.CreateIndex(
                name: "IX_returns_Status",
                table: "returns",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_products_barcode",
                table: "products",
                column: "barcode",
                unique: true,
                filter: "barcode IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_counts_status",
                table: "inventory_counts",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "IX_employees_employee_id",
                table: "employees",
                column: "employee_id",
                unique: true,
                filter: "employee_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_cash_sessions_SessionDate",
                table: "cash_sessions",
                column: "SessionDate");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_returns_Status",
                table: "returns");

            migrationBuilder.DropIndex(
                name: "IX_products_barcode",
                table: "products");

            migrationBuilder.DropIndex(
                name: "IX_inventory_counts_status",
                table: "inventory_counts");

            migrationBuilder.DropIndex(
                name: "IX_employees_employee_id",
                table: "employees");

            migrationBuilder.DropIndex(
                name: "IX_cash_sessions_SessionDate",
                table: "cash_sessions");

            migrationBuilder.CreateIndex(
                name: "IX_products_barcode",
                table: "products",
                column: "barcode");
        }
    }
}
