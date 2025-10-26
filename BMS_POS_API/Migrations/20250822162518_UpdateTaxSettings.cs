using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class UpdateTaxSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AnnualGrossSales",
                table: "TaxSettings");

            migrationBuilder.DropColumn(
                name: "BirRegistrationDate",
                table: "TaxSettings");

            migrationBuilder.DropColumn(
                name: "LocalBusinessTaxRate",
                table: "TaxSettings");

            migrationBuilder.DropColumn(
                name: "PercentageTaxRate",
                table: "TaxSettings");

            migrationBuilder.RenameColumn(
                name: "WithholdingTaxRate",
                table: "TaxSettings",
                newName: "TaxRate");

            migrationBuilder.RenameColumn(
                name: "VATRate",
                table: "TaxSettings",
                newName: "SecondaryTaxRate");

            migrationBuilder.RenameColumn(
                name: "TinNumber",
                table: "TaxSettings",
                newName: "TaxNumber");

            migrationBuilder.RenameColumn(
                name: "PermitNumber",
                table: "TaxSettings",
                newName: "TaxName");

            migrationBuilder.RenameColumn(
                name: "IsVATRegistered",
                table: "TaxSettings",
                newName: "EnableTaxExemptions");

            migrationBuilder.RenameColumn(
                name: "EnableZeroRatedSales",
                table: "TaxSettings",
                newName: "EnableTax");

            migrationBuilder.RenameColumn(
                name: "EnableVATExemptSales",
                table: "TaxSettings",
                newName: "EnableSecondaryTax");

            migrationBuilder.RenameColumn(
                name: "DefaultTaxType",
                table: "TaxSettings",
                newName: "SecondaryTaxName");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "TaxRate",
                table: "TaxSettings",
                newName: "WithholdingTaxRate");

            migrationBuilder.RenameColumn(
                name: "TaxNumber",
                table: "TaxSettings",
                newName: "TinNumber");

            migrationBuilder.RenameColumn(
                name: "TaxName",
                table: "TaxSettings",
                newName: "PermitNumber");

            migrationBuilder.RenameColumn(
                name: "SecondaryTaxRate",
                table: "TaxSettings",
                newName: "VATRate");

            migrationBuilder.RenameColumn(
                name: "SecondaryTaxName",
                table: "TaxSettings",
                newName: "DefaultTaxType");

            migrationBuilder.RenameColumn(
                name: "EnableTaxExemptions",
                table: "TaxSettings",
                newName: "IsVATRegistered");

            migrationBuilder.RenameColumn(
                name: "EnableTax",
                table: "TaxSettings",
                newName: "EnableZeroRatedSales");

            migrationBuilder.RenameColumn(
                name: "EnableSecondaryTax",
                table: "TaxSettings",
                newName: "EnableVATExemptSales");

            migrationBuilder.AddColumn<decimal>(
                name: "AnnualGrossSales",
                table: "TaxSettings",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "BirRegistrationDate",
                table: "TaxSettings",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "LocalBusinessTaxRate",
                table: "TaxSettings",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "PercentageTaxRate",
                table: "TaxSettings",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);
        }
    }
}
