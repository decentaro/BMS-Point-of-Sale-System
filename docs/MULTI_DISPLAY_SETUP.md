# Multi-Display Setup Guide

## 🖥️ Your Detected Displays

Based on the console output, your system has **3 displays**:

1. **Display 0**: 2654×1111 (Large monitor)
2. **Display 1**: 2962×1666 (Primary large monitor) 
3. **Display 2**: 790×495 (10.1" touch screen) ⭐ **AUTO-SELECTED**

The app automatically chose **Display 2** (790×495) as it's the smallest and most likely your touch screen.

## 🎯 Moving the App to Your Touch Screen

### Method 1: Automatic (Default)
```bash
npm start    # Automatically goes to smallest display (Display 2)
```

### Method 2: Manual Display Selection
```bash
npm run display0    # Force to Display 0 (2654×1111)
npm run display1    # Force to Display 1 (2962×1666) 
npm run display2    # Force to Display 2 (790×495) - Your touch screen
```

### Method 3: Keyboard Shortcut (While App is Running)
- **Ctrl+Shift+M** - Cycle between displays
- Press it to move the window from one display to another

### Method 4: Custom Display
```bash
# Target specific display by number
electron . --no-sandbox --display=2    # Your touch screen
electron . --no-sandbox --display=0    # Large monitor 1
electron . --no-sandbox --display=1    # Large monitor 2
```

## 🔧 Quick Commands for Your Setup

### Development on Touch Screen
```bash
npm run dev --display=2
```

### Production on Touch Screen (Kiosk Mode)
```bash
npm run display2    # Full kiosk mode on 790×495 display
```

### If App Goes to Wrong Display
1. **Press Ctrl+Shift+M** to cycle displays
2. **Or restart with**: `npm run display2`
3. **Or drag window** to correct display (dev mode only)

## ⚙️ Display Detection Logic

The app automatically selects displays in this priority:

1. **Command line** - `--display=N` overrides everything
2. **Touch screen detection** - Displays ≤1366×768 pixels 
3. **Secondary display** - Any non-primary display
4. **Primary display** - Fallback to main monitor

Your 790×495 display is automatically detected as a touch screen due to its small size.

## 🎛️ Advanced Options

### Force Specific Display
```javascript
// In main.js, you can also hardcode:
const targetDisplay = displays[2]; // Always use display 2
```

### Debug Display Info
```bash
npm run dev    # Check console for "Available displays" info
```

## 🔍 Troubleshooting

### App Not Appearing on Touch Screen
1. **Check console output** - Look for "Auto-detected touch screen display"
2. **Try manual selection** - `npm run display2`
3. **Use keyboard shortcut** - Ctrl+Shift+M while app is running

### Wrong Display Selected
1. **Override auto-detection** - Use `npm run display2`
2. **Check display order** - May change when displays are disconnected/reconnected

### Touch Screen Not Detected
If your 790×495 display isn't auto-selected:
1. **Force it**: `npm run display2`
2. **Check display bounds** in console output
3. **Verify it's connected** and showing up in display list

## 📋 Summary for Your Setup

**Your 10.1" touch screen is Display 2** - Use these commands:

```bash
# Development with hot reload on touch screen
npm run dev --display=2

# Production kiosk mode on touch screen  
npm run display2

# Quick switch while running
Ctrl+Shift+M
```

The app should automatically appear on your 790×495 touch screen by default! 🎯