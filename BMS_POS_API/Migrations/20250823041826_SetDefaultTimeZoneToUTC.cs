using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class SetDefaultTimeZoneToUTC : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Update existing records with empty timezone to UTC
            migrationBuilder.Sql("UPDATE system_settings SET \"TimeZone\" = 'UTC' WHERE \"TimeZone\" = '' OR \"TimeZone\" IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
