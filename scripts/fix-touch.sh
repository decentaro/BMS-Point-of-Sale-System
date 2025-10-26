#!/bin/bash

# Quick touch fix script for BMS POS
echo "🔧 BMS POS Touch Fix"
echo "===================="

# Run the setup script
if [ -f "scripts/setup-touch.sh" ]; then
    ./scripts/setup-touch.sh
else
    echo "Setting up touch device manually..."
    xinput map-to-output 9 HDMI-A-0
    echo "✅ Touch mapping applied"
fi

echo "Touch should now work on your HDMI-A-0 monitor!"