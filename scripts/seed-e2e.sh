#!/usr/bin/env bash
# seed-e2e.sh
# Seeds the E2E test employee into the database.
#
# Usage:
#   BMS_TEST_DB_HOST=localhost BMS_TEST_DB_USER=bms_test \
#   BMS_TEST_DB_PASSWORD=bms_test BMS_TEST_DB_NAME=bms_pos_test \
#   ./scripts/seed-e2e.sh
#
# The employee uses a plaintext PIN ("1234") which the AuthController
# accepts as a legacy plaintext match before bcrypt hashing exists.

set -euo pipefail

HOST="${BMS_TEST_DB_HOST:-localhost}"
PORT="${BMS_TEST_DB_PORT:-5432}"
USER="${BMS_TEST_DB_USER:-bms_test}"
PASS="${BMS_TEST_DB_PASSWORD:-bms_test}"
DB="${BMS_TEST_DB_NAME:-bms_pos_test}"

export PGPASSWORD="$PASS"

psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" <<SQL
INSERT INTO "Employees" ("EmployeeId", "Pin", "Name", "Role", "IsManager", "IsActive", "CreatedDate")
VALUES ('E2E001', '1234', 'E2E Manager', 'Manager', true, true, NOW())
ON CONFLICT ("EmployeeId") DO NOTHING;

INSERT INTO "Products" ("Barcode", "Name", "Price", "Cost", "StockQuantity", "MinStockLevel", "Unit", "IsActive", "CreatedDate")
VALUES ('E2EPROD1', 'E2E Test Product', 9.99, 5.00, 500, 5, 'pcs', true, NOW())
ON CONFLICT ("Barcode") DO NOTHING;
SQL

echo "E2E seed data inserted."
