using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class AddIdempotencyKeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "idempotency_key",
                table: "sales",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "idempotency_key",
                table: "returns",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_sales_idempotency_key",
                table: "sales",
                column: "idempotency_key",
                unique: true,
                filter: "idempotency_key IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_returns_idempotency_key",
                table: "returns",
                column: "idempotency_key",
                unique: true,
                filter: "idempotency_key IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_sales_idempotency_key",
                table: "sales");

            migrationBuilder.DropIndex(
                name: "IX_returns_idempotency_key",
                table: "returns");

            migrationBuilder.DropColumn(
                name: "idempotency_key",
                table: "sales");

            migrationBuilder.DropColumn(
                name: "idempotency_key",
                table: "returns");
        }
    }
}
