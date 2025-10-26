using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class AddProductCategoriesToSystemSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ProductCategories",
                table: "system_settings",
                type: "text",
                nullable: false,
                defaultValue: "Pet Food,Pet Toys,Pet Accessories,Pet Medicine,Pet Grooming,Pet Treats");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProductCategories",
                table: "system_settings");
        }
    }
}
