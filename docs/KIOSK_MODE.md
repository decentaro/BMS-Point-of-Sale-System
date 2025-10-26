# Kiosk Mode Configuration for 10.1" Touch Screens

## 🖥️ Kiosk Mode Features

### Production Mode (`npm start` or `npm run kiosk`)
- ✅ **No Window Frame** - Removes title bar, borders, and window controls
- ✅ **Fullscreen Mode** - Takes up entire screen space
- ✅ **No Menu Bar** - File/Edit/View/Window/Help menus completely hidden
- ✅ **No Context Menu** - Right-click disabled
- ✅ **Always On Top** - Prevents other apps from covering the POS
- ✅ **Hidden from Taskbar** - App doesn't show in taskbar
- ✅ **DevTools Disabled** - F12 key disabled for security

### Development Mode (`npm run dev`)
- 🔧 **Windowed Mode** - Normal window with frame for development
- 🔧 **DevTools Available** - F12 key works, automatic DevTools opening
- 🔧 **Menu Bar Visible** - Standard Electron menus available
- 🔧 **Hot Reload Active** - Automatic refresh on file changes

## 🔐 Security & Control

### Emergency Exit
- **Ctrl+Shift+Q** - Quit application in kiosk mode
- **F11** - Toggle fullscreen mode
- **Alt+F4** - Standard Windows close (if available)

### Disabled Features in Production
- ❌ Right-click context menu
- ❌ F12 DevTools
- ❌ Window resizing/moving
- ❌ Alt+Tab switching (minimized)
- ❌ Standard menu shortcuts

## 📱 Touch Optimization for 10.1" Screens

### Touch Targets
- **Minimum Size**: 44px × 44px for all interactive elements
- **Button Spacing**: Adequate gaps to prevent mis-taps
- **Large Keypad**: Easy-to-tap numeric and letter buttons
- **No Hover Effects**: Optimized for touch-only interaction

### Touch Behavior
- **No Text Selection** - `user-select: none` prevents accidental text selection
- **No Tap Highlights** - Removes blue highlight flashes on touch
- **Touch Action** - `manipulation` for smooth scrolling and zooming
- **No Cursor** - Default cursor for touch interface

## 🚀 Deployment Scripts

### For Development
```bash
npm run dev          # Windowed mode with hot reload
```

### For Production/Kiosk
```bash
npm start           # Standard production mode
npm run kiosk       # Explicit kiosk mode (same as start)
```

## ⚙️ Advanced Configuration

### Window Settings
```javascript
{
    frame: false,                    // No title bar
    resizable: false,                // Cannot resize
    fullscreen: true,                // Takes full screen
    kiosk: true,                     // True kiosk mode
    alwaysOnTop: true,               // Stays above other windows
    skipTaskbar: true,               // Hidden from taskbar
    autoHideMenuBar: true,           // No menu visible
}
```

### Screen Resolution Handling
- **Fixed Layout**: Designed for 1024×640 base resolution
- **Scalable**: CSS automatically adapts to different screen sizes
- **Touch-First**: All interactions optimized for finger input
- **No Scrolling**: Everything fits on screen except employee list

## 📋 10.1" Touch Screen Checklist

- [ ] **Touch Targets**: All buttons ≥44px for easy tapping
- [ ] **No Hover States**: All interactions work with touch only
- [ ] **Proper Spacing**: Buttons have adequate gaps (6-8px)
- [ ] **Text Size**: Readable fonts (11px+ for content, 10px+ for labels)
- [ ] **Contrast**: High contrast for outdoor/bright environments
- [ ] **Performance**: Smooth scrolling and animations

## 🔧 Troubleshooting

### If App Won't Start in Kiosk Mode
```bash
# Check if running with correct flags
electron . --no-sandbox --disable-gpu-sandbox
```

### If Touch Not Working
- Ensure screen drivers are installed
- Check Windows touch calibration
- Verify touch events in DevTools (dev mode)

### If App is "Stuck" in Kiosk Mode
- **Ctrl+Shift+Q** to quit
- **Alt+Tab** then **Alt+F4** to force close
- **Ctrl+Alt+Del** for Task Manager access

## 🎯 Perfect For
- **POS Terminals** - Dedicated touch screen stations
- **Kiosks** - Self-service customer interfaces  
- **Tablets** - 10.1" Android/Windows tablets
- **Industrial Screens** - Factory floor terminals
- **Retail Displays** - In-store employee management

The app is now fully configured for professional kiosk deployment on 10.1" touch screens!