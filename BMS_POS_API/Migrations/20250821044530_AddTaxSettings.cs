using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class AddTaxSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TaxSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    BusinessName = table.Column<string>(type: "text", nullable: false),
                    TinNumber = table.Column<string>(type: "text", nullable: false),
                    BusinessAddress = table.Column<string>(type: "text", nullable: false),
                    IsVATRegistered = table.Column<bool>(type: "boolean", nullable: false),
                    AnnualGrossSales = table.Column<decimal>(type: "numeric", nullable: false),
                    DefaultTaxType = table.Column<string>(type: "text", nullable: false),
                    VATRate = table.Column<decimal>(type: "numeric", nullable: false),
                    PercentageTaxRate = table.Column<decimal>(type: "numeric", nullable: false),
                    EnableZeroRatedSales = table.Column<bool>(type: "boolean", nullable: false),
                    EnableVATExemptSales = table.Column<bool>(type: "boolean", nullable: false),
                    WithholdingTaxRate = table.Column<decimal>(type: "numeric", nullable: false),
                    LocalBusinessTaxRate = table.Column<decimal>(type: "numeric", nullable: false),
                    BirRegistrationDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PermitNumber = table.Column<string>(type: "text", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    CreatedDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastUpdated = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaxSettings", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TaxSettings");
        }
    }
}
