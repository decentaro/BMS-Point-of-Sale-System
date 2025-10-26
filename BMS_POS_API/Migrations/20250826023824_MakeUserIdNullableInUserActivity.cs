using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class MakeUserIdNullableInUserActivity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_user_activities_employees_UserId",
                table: "user_activities");

            migrationBuilder.AlterColumn<int>(
                name: "UserId",
                table: "user_activities",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddForeignKey(
                name: "FK_user_activities_employees_UserId",
                table: "user_activities",
                column: "UserId",
                principalTable: "employees",
                principalColumn: "id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_user_activities_employees_UserId",
                table: "user_activities");

            migrationBuilder.AlterColumn<int>(
                name: "UserId",
                table: "user_activities",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_user_activities_employees_UserId",
                table: "user_activities",
                column: "UserId",
                principalTable: "employees",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
