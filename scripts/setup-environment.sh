#!/bin/bash
echo "Setting up BMS POS Environment Variables..."
echo ""

echo "Setting database configuration..."
export BMS_DB_USER="postgres.saaudpmfwnbphgveugzx"
export BMS_DB_SERVER="aws-1-ap-southeast-1.pooler.supabase.com"
export BMS_DB_PORT="5432"
export BMS_DB_NAME="postgres"

echo ""
echo "IMPORTANT: You must set the database password manually for security."
echo "Run this command and replace 'your_actual_password' with the real password:"
echo ""
echo "export BMS_DB_PASSWORD='your_actual_password'"
echo ""

echo "Environment variables configured!"
echo "You can now run the BMS POS application."
echo ""