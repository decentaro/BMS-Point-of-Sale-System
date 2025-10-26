using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class InventoryFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ProductBatchId",
                table: "sale_items",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "inventory_counts",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    count_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    count_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    started_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    completed_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    started_by_employee_id = table.Column<int>(type: "integer", nullable: false),
                    completed_by_employee_id = table.Column<int>(type: "integer", nullable: true),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    total_items_counted = table.Column<int>(type: "integer", nullable: false),
                    total_discrepancies = table.Column<int>(type: "integer", nullable: false),
                    total_shrinkage_value = table.Column<decimal>(type: "numeric(10,2)", nullable: false),
                    total_overage_value = table.Column<decimal>(type: "numeric(10,2)", nullable: false),
                    net_variance_value = table.Column<decimal>(type: "numeric(10,2)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inventory_counts", x => x.id);
                    table.ForeignKey(
                        name: "FK_inventory_counts_employees_completed_by_employee_id",
                        column: x => x.completed_by_employee_id,
                        principalTable: "employees",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_inventory_counts_employees_started_by_employee_id",
                        column: x => x.started_by_employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "product_batches",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    product_id = table.Column<int>(type: "integer", nullable: false),
                    batch_number = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    quantity = table.Column<int>(type: "integer", nullable: false),
                    cost_per_unit = table.Column<decimal>(type: "numeric(10,2)", nullable: false),
                    received_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    expiration_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    manufacturing_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    supplier = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    lot_number = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    is_expired = table.Column<bool>(type: "boolean", nullable: false),
                    is_recalled = table.Column<bool>(type: "boolean", nullable: false),
                    recall_reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    created_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    last_updated = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_product_batches", x => x.id);
                    table.ForeignKey(
                        name: "FK_product_batches_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "stock_adjustments",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    product_id = table.Column<int>(type: "integer", nullable: false),
                    adjustment_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    quantity_change = table.Column<int>(type: "integer", nullable: false),
                    quantity_before = table.Column<int>(type: "integer", nullable: false),
                    quantity_after = table.Column<int>(type: "integer", nullable: false),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    adjusted_by_employee_id = table.Column<int>(type: "integer", nullable: false),
                    cost_impact = table.Column<decimal>(type: "numeric(10,2)", nullable: false),
                    adjustment_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    reference_number = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    requires_approval = table.Column<bool>(type: "boolean", nullable: false),
                    is_approved = table.Column<bool>(type: "boolean", nullable: false),
                    approved_by_employee_id = table.Column<int>(type: "integer", nullable: true),
                    approved_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_adjustments", x => x.id);
                    table.ForeignKey(
                        name: "FK_stock_adjustments_employees_adjusted_by_employee_id",
                        column: x => x.adjusted_by_employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_stock_adjustments_employees_approved_by_employee_id",
                        column: x => x.approved_by_employee_id,
                        principalTable: "employees",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_stock_adjustments_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "inventory_count_items",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    inventory_count_id = table.Column<int>(type: "integer", nullable: false),
                    product_id = table.Column<int>(type: "integer", nullable: false),
                    product_batch_id = table.Column<int>(type: "integer", nullable: true),
                    system_quantity = table.Column<int>(type: "integer", nullable: false),
                    counted_quantity = table.Column<int>(type: "integer", nullable: false),
                    variance = table.Column<int>(type: "integer", nullable: false),
                    cost_per_unit = table.Column<decimal>(type: "numeric(10,2)", nullable: false),
                    variance_value = table.Column<decimal>(type: "numeric(10,2)", nullable: false),
                    discrepancy_reason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    counted_by_employee_id = table.Column<int>(type: "integer", nullable: false),
                    counted_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_verified = table.Column<bool>(type: "boolean", nullable: false),
                    verified_by_employee_id = table.Column<int>(type: "integer", nullable: true),
                    verified_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inventory_count_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_inventory_count_items_employees_counted_by_employee_id",
                        column: x => x.counted_by_employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_inventory_count_items_employees_verified_by_employee_id",
                        column: x => x.verified_by_employee_id,
                        principalTable: "employees",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_inventory_count_items_inventory_counts_inventory_count_id",
                        column: x => x.inventory_count_id,
                        principalTable: "inventory_counts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_inventory_count_items_product_batches_product_batch_id",
                        column: x => x.product_batch_id,
                        principalTable: "product_batches",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_inventory_count_items_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_sale_items_ProductBatchId",
                table: "sale_items",
                column: "ProductBatchId");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_count_items_counted_by_employee_id",
                table: "inventory_count_items",
                column: "counted_by_employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_count_items_inventory_count_id",
                table: "inventory_count_items",
                column: "inventory_count_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_count_items_product_batch_id",
                table: "inventory_count_items",
                column: "product_batch_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_count_items_product_id",
                table: "inventory_count_items",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_count_items_verified_by_employee_id",
                table: "inventory_count_items",
                column: "verified_by_employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_counts_completed_by_employee_id",
                table: "inventory_counts",
                column: "completed_by_employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_counts_started_by_employee_id",
                table: "inventory_counts",
                column: "started_by_employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_product_batches_product_id",
                table: "product_batches",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_adjustments_adjusted_by_employee_id",
                table: "stock_adjustments",
                column: "adjusted_by_employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_adjustments_approved_by_employee_id",
                table: "stock_adjustments",
                column: "approved_by_employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_adjustments_product_id",
                table: "stock_adjustments",
                column: "product_id");

            migrationBuilder.AddForeignKey(
                name: "FK_sale_items_product_batches_ProductBatchId",
                table: "sale_items",
                column: "ProductBatchId",
                principalTable: "product_batches",
                principalColumn: "id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_sale_items_product_batches_ProductBatchId",
                table: "sale_items");

            migrationBuilder.DropTable(
                name: "inventory_count_items");

            migrationBuilder.DropTable(
                name: "stock_adjustments");

            migrationBuilder.DropTable(
                name: "inventory_counts");

            migrationBuilder.DropTable(
                name: "product_batches");

            migrationBuilder.DropIndex(
                name: "IX_sale_items_ProductBatchId",
                table: "sale_items");

            migrationBuilder.DropColumn(
                name: "ProductBatchId",
                table: "sale_items");
        }
    }
}
