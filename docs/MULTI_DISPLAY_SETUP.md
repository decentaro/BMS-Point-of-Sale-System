# Multi-Display Setup

The app automatically selects the best display at startup and supports manual overrides for multi-monitor environments.

## Automatic Display Selection

On startup, Electron scans all connected displays and picks one in this priority order:

1. `--display=N` command-line argument — overrides everything
2. Smallest display ≤ 1366 × 768 — treated as the kiosk / touch screen
3. Any non-primary display
4. Primary display (fallback)

In **development mode** (`--dev` flag) the window opens resizable at 80% of the target display (capped at 1200 × 800). In **production** it goes fullscreen / kiosk on the target display.

## npm Scripts

```bash
npm run display0    # Force to display index 0
npm run display1    # Force to display index 1
npm run display2    # Force to display index 2
```

Display indices are assigned by the OS in the order Electron enumerates them. Run `npm run dev` and check the console for a "Available displays" log to see which index maps to which screen.

## Keyboard Shortcut

**Ctrl+Shift+M** — cycle the window through all connected displays while the app is running.

## Troubleshooting

**App opened on the wrong display**
- Press **Ctrl+Shift+M** to cycle to the correct screen.
- Or restart with `npm run display2` (or whichever index is your kiosk screen).

**Touch screen not auto-detected**
- The auto-detection picks the smallest display. If two displays are the same size, use `npm run displayN` to force the right one.
- Check the console for "Available displays" output to confirm bounds.

**Debug display info**
```bash
npm run dev    # Console prints all detected display bounds on startup
```
