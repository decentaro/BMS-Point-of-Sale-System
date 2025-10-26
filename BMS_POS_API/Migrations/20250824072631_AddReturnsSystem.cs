using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class AddReturnsSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "returns",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ReturnId = table.Column<string>(type: "text", nullable: false),
                    OriginalSaleId = table.Column<int>(type: "integer", nullable: false),
                    ReturnDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    TotalRefundAmount = table.Column<decimal>(type: "numeric", nullable: false),
                    ProcessedByEmployeeId = table.Column<int>(type: "integer", nullable: false),
                    ApprovedByEmployeeId = table.Column<int>(type: "integer", nullable: true),
                    ManagerApprovalRequired = table.Column<bool>(type: "boolean", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_returns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_returns_employees_ApprovedByEmployeeId",
                        column: x => x.ApprovedByEmployeeId,
                        principalTable: "employees",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_returns_employees_ProcessedByEmployeeId",
                        column: x => x.ProcessedByEmployeeId,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_returns_sales_OriginalSaleId",
                        column: x => x.OriginalSaleId,
                        principalTable: "sales",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "return_items",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ReturnId = table.Column<int>(type: "integer", nullable: false),
                    OriginalSaleItemId = table.Column<int>(type: "integer", nullable: false),
                    ProductId = table.Column<int>(type: "integer", nullable: false),
                    ProductName = table.Column<string>(type: "text", nullable: false),
                    ReturnQuantity = table.Column<int>(type: "integer", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric", nullable: false),
                    LineTotal = table.Column<decimal>(type: "numeric", nullable: false),
                    Condition = table.Column<string>(type: "text", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    RestockedToInventory = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_return_items", x => x.Id);
                    table.ForeignKey(
                        name: "FK_return_items_products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_return_items_returns_ReturnId",
                        column: x => x.ReturnId,
                        principalTable: "returns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_return_items_sale_items_OriginalSaleItemId",
                        column: x => x.OriginalSaleItemId,
                        principalTable: "sale_items",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_return_items_OriginalSaleItemId",
                table: "return_items",
                column: "OriginalSaleItemId");

            migrationBuilder.CreateIndex(
                name: "IX_return_items_ProductId",
                table: "return_items",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_return_items_ReturnId",
                table: "return_items",
                column: "ReturnId");

            migrationBuilder.CreateIndex(
                name: "IX_returns_ApprovedByEmployeeId",
                table: "returns",
                column: "ApprovedByEmployeeId");

            migrationBuilder.CreateIndex(
                name: "IX_returns_OriginalSaleId",
                table: "returns",
                column: "OriginalSaleId");

            migrationBuilder.CreateIndex(
                name: "IX_returns_ProcessedByEmployeeId",
                table: "returns",
                column: "ProcessedByEmployeeId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "return_items");

            migrationBuilder.DropTable(
                name: "returns");
        }
    }
}
