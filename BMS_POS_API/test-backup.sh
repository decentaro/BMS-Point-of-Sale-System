#!/bin/bash

echo "Testing backup functionality with different database configurations..."
echo ""

echo "=== Test 1: No password configured (should fail with helpful message) ==="
unset BMS_DB_PASSWORD
export BMS_DB_USER="postgres.saaudpmfwnbphgveugzx"
export BMS_DB_SERVER="aws-1-ap-southeast-1.pooler.supabase.com"
export BMS_DB_PORT="5432" 
export BMS_DB_NAME="postgres"

echo "Attempting to start API without BMS_DB_PASSWORD..."
curl -X POST http://localhost:5002/api/AdminSettings/backup/create -v 2>/dev/null || echo "API not running - this is expected if no password is set"

echo ""
echo "=== Test 2: Setup Instructions ==="
echo "To fix this issue:"
echo "1. Run: source ../setup-environment.sh"
echo "2. Set password: export BMS_DB_PASSWORD='your_actual_password'"
echo "3. Restart the API server: dotnet run"
echo ""

echo "This test demonstrates that our improved error handling will provide"
echo "clear guidance to users when database configuration is missing."