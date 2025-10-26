using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class AddSystemSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SystemSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    CurrencyCode = table.Column<string>(type: "text", nullable: false),
                    CurrencySymbolBefore = table.Column<bool>(type: "boolean", nullable: false),
                    DateFormat = table.Column<string>(type: "text", nullable: false),
                    DecimalSeparator = table.Column<string>(type: "text", nullable: false),
                    ThousandsSeparator = table.Column<string>(type: "text", nullable: false),
                    AutoLogoutMinutes = table.Column<int>(type: "integer", nullable: false),
                    DefaultPaymentMethod = table.Column<string>(type: "text", nullable: false),
                    SoundEffectsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    RequireManagerApprovalForDiscount = table.Column<bool>(type: "boolean", nullable: false),
                    Theme = table.Column<string>(type: "text", nullable: false),
                    FontScaling = table.Column<double>(type: "double precision", nullable: false),
                    Language = table.Column<string>(type: "text", nullable: false),
                    BusinessName = table.Column<string>(type: "text", nullable: true),
                    ReceiptFooterText = table.Column<string>(type: "text", nullable: true),
                    StoreLocation = table.Column<string>(type: "text", nullable: true),
                    CreatedDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastUpdated = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemSettings", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SystemSettings");
        }
    }
}
