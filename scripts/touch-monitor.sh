#!/bin/bash

# BMS POS Touch Monitor Script
# Monitors for touch device changes and automatically remaps

TOUCH_DEVICE_NAME="yldzkj USB2IIC_CTP_CONTROL"
TARGET_DISPLAY="HDMI-A-0"

echo "Starting BMS POS Touch Monitor..."
echo "Monitoring for: $TOUCH_DEVICE_NAME"
echo "Target display: $TARGET_DISPLAY"

# Function to setup touch mapping
setup_touch() {
    local device_id=$(xinput list | grep "$TOUCH_DEVICE_NAME" | grep -oP 'id=\K\d+')
    
    if [ -n "$device_id" ]; then
        if xrandr | grep -q "$TARGET_DISPLAY connected"; then
            echo "$(date): Mapping touch device $device_id to $TARGET_DISPLAY"
            xinput map-to-output $device_id $TARGET_DISPLAY
            
            if [ $? -eq 0 ]; then
                echo "$(date): ✅ Touch mapping successful"
                return 0
            else
                echo "$(date): ❌ Touch mapping failed"
                return 1
            fi
        else
            echo "$(date): ⚠️ Target display $TARGET_DISPLAY not connected"
            return 1
        fi
    else
        echo "$(date): ⚠️ Touch device '$TOUCH_DEVICE_NAME' not found"
        return 1
    fi
}

# Initial setup
setup_touch

# Monitor for device changes using udev if available, otherwise poll
if command -v udevadm >/dev/null 2>&1; then
    echo "Using udev monitoring..."
    udevadm monitor --udev --subsystem-match=input | while read line; do
        if echo "$line" | grep -q "UDEV"; then
            echo "$(date): Input device change detected"
            sleep 2  # Wait for device to be fully recognized
            setup_touch
        fi
    done
else
    echo "Using polling method (checking every 10 seconds)..."
    while true; do
        sleep 10
        # Check if device is still mapped correctly
        if ! setup_touch >/dev/null 2>&1; then
            setup_touch
        fi
    done
fi