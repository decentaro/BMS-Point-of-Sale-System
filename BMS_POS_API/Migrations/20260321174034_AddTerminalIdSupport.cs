using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class AddTerminalIdSupport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "terminal_id",
                table: "stock_adjustments",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "terminal_id",
                table: "sales",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "terminal_id",
                table: "returns",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TerminalId",
                table: "cash_sessions",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TerminalName",
                table: "cash_sessions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_sales_terminal_id",
                table: "sales",
                column: "terminal_id");

            migrationBuilder.CreateIndex(
                name: "IX_returns_terminal_id",
                table: "returns",
                column: "terminal_id");

            migrationBuilder.CreateIndex(
                name: "IX_cash_sessions_TerminalId",
                table: "cash_sessions",
                column: "TerminalId");

            migrationBuilder.CreateIndex(
                name: "IX_cash_sessions_TerminalId_SessionDate",
                table: "cash_sessions",
                columns: new[] { "TerminalId", "SessionDate" },
                unique: true,
                filter: "terminal_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_sales_terminal_id",
                table: "sales");

            migrationBuilder.DropIndex(
                name: "IX_returns_terminal_id",
                table: "returns");

            migrationBuilder.DropIndex(
                name: "IX_cash_sessions_TerminalId",
                table: "cash_sessions");

            migrationBuilder.DropIndex(
                name: "IX_cash_sessions_TerminalId_SessionDate",
                table: "cash_sessions");

            migrationBuilder.DropColumn(
                name: "terminal_id",
                table: "stock_adjustments");

            migrationBuilder.DropColumn(
                name: "terminal_id",
                table: "sales");

            migrationBuilder.DropColumn(
                name: "terminal_id",
                table: "returns");

            migrationBuilder.DropColumn(
                name: "TerminalId",
                table: "cash_sessions");

            migrationBuilder.DropColumn(
                name: "TerminalName",
                table: "cash_sessions");
        }
    }
}
