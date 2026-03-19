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
                name: "IdempotencyKey",
                table: "sales",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IdempotencyKey",
                table: "returns",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_sales_IdempotencyKey",
                table: "sales",
                column: "IdempotencyKey",
                unique: true,
                filter: "idempotency_key IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_returns_IdempotencyKey",
                table: "returns",
                column: "IdempotencyKey",
                unique: true,
                filter: "idempotency_key IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_sales_IdempotencyKey",
                table: "sales");

            migrationBuilder.DropIndex(
                name: "IX_returns_IdempotencyKey",
                table: "returns");

            migrationBuilder.DropColumn(
                name: "IdempotencyKey",
                table: "sales");

            migrationBuilder.DropColumn(
                name: "IdempotencyKey",
                table: "returns");
        }
    }
}
