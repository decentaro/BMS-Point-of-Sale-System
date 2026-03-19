using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class AddPerformanceIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_sales_SaleDate_Status",
                table: "sales",
                columns: new[] { "SaleDate", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_returns_ReturnDate",
                table: "returns",
                column: "ReturnDate");

            migrationBuilder.CreateIndex(
                name: "IX_products_barcode",
                table: "products",
                column: "barcode");

            migrationBuilder.CreateIndex(
                name: "IX_products_is_active",
                table: "products",
                column: "is_active");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_sales_SaleDate_Status",
                table: "sales");

            migrationBuilder.DropIndex(
                name: "IX_returns_ReturnDate",
                table: "returns");

            migrationBuilder.DropIndex(
                name: "IX_products_barcode",
                table: "products");

            migrationBuilder.DropIndex(
                name: "IX_products_is_active",
                table: "products");
        }
    }
}
