#!/bin/bash

# BMS POS Touch Setup Script
# This script ensures the touch device is properly mapped to the touch monitor

echo "Setting up touch device mapping..."

# Find the touch device ID (yldzkj USB2IIC_CTP_CONTROL)
TOUCH_DEVICE_ID=$(xinput list | grep "yldzkj USB2IIC_CTP_CONTROL" | grep -oP 'id=\K\d+')

if [ -z "$TOUCH_DEVICE_ID" ]; then
    echo "Touch device not found. Available input devices:"
    xinput list
    exit 1
fi

echo "Found touch device ID: $TOUCH_DEVICE_ID"

# Check available displays
echo "Available displays:"
xrandr --listmonitors

# Map touch device to HDMI-A-0 (touch monitor)
if xrandr | grep -q "HDMI-A-0 connected"; then
    echo "Mapping touch device $TOUCH_DEVICE_ID to HDMI-A-0..."
    xinput map-to-output $TOUCH_DEVICE_ID HDMI-A-0
    
    if [ $? -eq 0 ]; then
        echo "✅ Touch mapping successful!"
    else
        echo "❌ Touch mapping failed!"
        exit 1
    fi
else
    echo "❌ HDMI-A-0 display not found!"
    echo "Available displays:"
    xrandr | grep connected
    exit 1
fi

echo "Touch setup complete."