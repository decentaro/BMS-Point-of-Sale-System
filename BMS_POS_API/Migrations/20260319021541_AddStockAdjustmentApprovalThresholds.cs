using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class AddStockAdjustmentApprovalThresholds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "StockAdjustmentApprovalCostThreshold",
                table: "system_settings",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "StockAdjustmentApprovalQuantityThreshold",
                table: "system_settings",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "StockAdjustmentApprovalCostThreshold",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "StockAdjustmentApprovalQuantityThreshold",
                table: "system_settings");
        }
    }
}
