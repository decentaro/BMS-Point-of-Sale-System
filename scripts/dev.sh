#!/bin/bash

echo "Starting BMS POS Development Environment..."

# Load environment variables from .env file
if [ -f ".env" ]; then
    echo "Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
else
    echo "Warning: .env file not found. Using default values."
fi

# Kill any existing processes
echo "Stopping any existing processes..."

# Kill .NET/Backend processes with multiple patterns
pkill -f "dotnet.*BMS_POS_API" || true
pkill -f "dotnet run" || true  
pkill -f "BMS_POS_API.dll" || true
pkill -f "BMS_POS_API/bin" || true
pkill -f "localhost:5002" || true
pkill -f "5002" || true

# Kill Vite/Frontend processes with multiple patterns  
pkill -f "vite.*3001" || true
pkill -f "vite.*dev" || true
pkill -f "localhost:3001" || true
pkill -f "3001" || true
fuser -k 3001/tcp 2>/dev/null || true

# Kill Electron processes
pkill -f "electron.*BMS_POS" || true
pkill -f "electron.*dev" || true
pkill -f "electron.*Desktop" || true
pkill -f "electron" || true

# Kill any lingering Node.js processes
pkill -f "node.*vite" || true
pkill -f "npm.*dev" || true

# Force kill ports if still in use
fuser -k 5002/tcp 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true

# Wait longer for processes to fully terminate
echo "Waiting for processes to terminate..."
sleep 3

# Start Backend API in background
echo "Starting .NET Backend API..."
cd BMS_POS_API

echo "Building..."
dotnet run --urls="http://localhost:5002" &
BACKEND_PID=$!
cd ..

# Wait for backend to start and be ready
echo "Waiting for backend to be ready..."
while ! curl -s http://localhost:5002/api/tax-settings > /dev/null; do
    sleep 1
    echo -n "."
done
echo " Backend is ready!"

# Start Vite dev server in background
echo "Starting Vite Dev Server..."
npm run dev-vite &
VITE_PID=$!

# Wait for Vite to start
echo "Waiting for Vite dev server..."
sleep 5

# Setup touch device mapping
echo "Setting up touch device..."
if [ -f "scripts/setup-touch.sh" ]; then
    ./scripts/setup-touch.sh
else
    echo "Touch setup script not found, trying direct mapping..."
    xinput map-to-output 9 HDMI-A-0 2>/dev/null || echo "Touch mapping failed (device may not be connected)"
fi

# Start Electron
echo "Starting Electron Desktop App..."
./node_modules/.bin/electron . --dev --no-sandbox &
ELECTRON_PID=$!

echo ""
echo "=== BMS POS Development Started ==="
echo "Backend API: http://localhost:5002"
echo "Vite Dev Server: http://localhost:3001"
echo "Electron Desktop App: Running"
echo ""
echo "Hot reload is enabled!"
echo "Press Ctrl+C to stop all services"

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping all services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $VITE_PID 2>/dev/null || true
    kill $ELECTRON_PID 2>/dev/null || true
    
    # Comprehensive cleanup
    pkill -f "dotnet.*BMS_POS_API" || true
    pkill -f "dotnet run" || true
    pkill -f "BMS_POS_API.dll" || true
    pkill -f "BMS_POS_API/bin" || true
    pkill -f "localhost:5002" || true
    pkill -f "5002" || true
    pkill -f "vite.*3001" || true
    pkill -f "vite.*dev" || true
    pkill -f "localhost:3001" || true
    pkill -f "3001" || true
    pkill -f "electron.*BMS_POS" || true
    pkill -f "electron.*dev" || true
    pkill -f "electron" || true
    pkill -f "node.*vite" || true
    pkill -f "npm.*dev" || true
    
    # Force kill ports
    fuser -k 5002/tcp 2>/dev/null || true
    fuser -k 3001/tcp 2>/dev/null || true
    exit
}

trap cleanup SIGINT SIGTERM

# Wait for processes
wait