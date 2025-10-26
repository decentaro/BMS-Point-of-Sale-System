using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class StandardizeTableNamesToSnakeCase : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SaleItems_Sales_SaleId",
                table: "SaleItems");

            migrationBuilder.DropForeignKey(
                name: "FK_SaleItems_products_ProductId",
                table: "SaleItems");

            migrationBuilder.DropForeignKey(
                name: "FK_Sales_employees_EmployeeId",
                table: "Sales");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Sales",
                table: "Sales");

            migrationBuilder.DropPrimaryKey(
                name: "PK_TaxSettings",
                table: "TaxSettings");

            migrationBuilder.DropPrimaryKey(
                name: "PK_SystemSettings",
                table: "SystemSettings");

            migrationBuilder.DropPrimaryKey(
                name: "PK_SaleItems",
                table: "SaleItems");

            migrationBuilder.RenameTable(
                name: "Sales",
                newName: "sales");

            migrationBuilder.RenameTable(
                name: "TaxSettings",
                newName: "tax_settings");

            migrationBuilder.RenameTable(
                name: "SystemSettings",
                newName: "system_settings");

            migrationBuilder.RenameTable(
                name: "SaleItems",
                newName: "sale_items");

            migrationBuilder.RenameIndex(
                name: "IX_Sales_EmployeeId",
                table: "sales",
                newName: "IX_sales_EmployeeId");

            migrationBuilder.RenameIndex(
                name: "IX_SaleItems_SaleId",
                table: "sale_items",
                newName: "IX_sale_items_SaleId");

            migrationBuilder.RenameIndex(
                name: "IX_SaleItems_ProductId",
                table: "sale_items",
                newName: "IX_sale_items_ProductId");

            migrationBuilder.AddPrimaryKey(
                name: "PK_sales",
                table: "sales",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_tax_settings",
                table: "tax_settings",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_system_settings",
                table: "system_settings",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_sale_items",
                table: "sale_items",
                column: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_sale_items_products_ProductId",
                table: "sale_items",
                column: "ProductId",
                principalTable: "products",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_sale_items_sales_SaleId",
                table: "sale_items",
                column: "SaleId",
                principalTable: "sales",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_sales_employees_EmployeeId",
                table: "sales",
                column: "EmployeeId",
                principalTable: "employees",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_sale_items_products_ProductId",
                table: "sale_items");

            migrationBuilder.DropForeignKey(
                name: "FK_sale_items_sales_SaleId",
                table: "sale_items");

            migrationBuilder.DropForeignKey(
                name: "FK_sales_employees_EmployeeId",
                table: "sales");

            migrationBuilder.DropPrimaryKey(
                name: "PK_sales",
                table: "sales");

            migrationBuilder.DropPrimaryKey(
                name: "PK_tax_settings",
                table: "tax_settings");

            migrationBuilder.DropPrimaryKey(
                name: "PK_system_settings",
                table: "system_settings");

            migrationBuilder.DropPrimaryKey(
                name: "PK_sale_items",
                table: "sale_items");

            migrationBuilder.RenameTable(
                name: "sales",
                newName: "Sales");

            migrationBuilder.RenameTable(
                name: "tax_settings",
                newName: "TaxSettings");

            migrationBuilder.RenameTable(
                name: "system_settings",
                newName: "SystemSettings");

            migrationBuilder.RenameTable(
                name: "sale_items",
                newName: "SaleItems");

            migrationBuilder.RenameIndex(
                name: "IX_sales_EmployeeId",
                table: "Sales",
                newName: "IX_Sales_EmployeeId");

            migrationBuilder.RenameIndex(
                name: "IX_sale_items_SaleId",
                table: "SaleItems",
                newName: "IX_SaleItems_SaleId");

            migrationBuilder.RenameIndex(
                name: "IX_sale_items_ProductId",
                table: "SaleItems",
                newName: "IX_SaleItems_ProductId");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Sales",
                table: "Sales",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_TaxSettings",
                table: "TaxSettings",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_SystemSettings",
                table: "SystemSettings",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_SaleItems",
                table: "SaleItems",
                column: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_SaleItems_Sales_SaleId",
                table: "SaleItems",
                column: "SaleId",
                principalTable: "Sales",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_SaleItems_products_ProductId",
                table: "SaleItems",
                column: "ProductId",
                principalTable: "products",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Sales_employees_EmployeeId",
                table: "Sales",
                column: "EmployeeId",
                principalTable: "employees",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
