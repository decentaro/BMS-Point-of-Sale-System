# Kiosk Mode

## Production vs Development

| | Production (`npm start`) | Development (`npm run dev`) |
|---|---|---|
| Window frame | None | Standard frame |
| Fullscreen / kiosk | Yes | No — resizable at 80% |
| DevTools (F12) | Disabled | Enabled |
| Context menu | Disabled | Enabled |
| Always on top | Yes | No |
| Taskbar entry | Hidden | Shown |
| Hot reload | No | Yes |

## Emergency Exit (Production)

- **Ctrl+Shift+Q** — quit the application
- **F11** — toggle fullscreen off
- **Ctrl+Alt+Del** — open Task Manager (Windows) as a last resort

## Electron Window Options (Production)

```js
{
  frame: false,
  resizable: false,
  fullscreen: true,
  kiosk: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  autoHideMenuBar: true,
}
```

## Linux / Raspberry Pi Deployment

For headless kiosk deployment on Raspberry Pi or similar:

```bash
# Build ARM64 AppImage
npm run build:linux

# Run without sandbox (required on some Linux kiosk setups)
./BMS-POS-*.AppImage --no-sandbox
```

See the README for full installation steps.

## Touch Screen Configuration

- All interactive elements meet the **44 × 44 px** minimum touch target.
- Right-click / context menu is disabled in production.
- Text selection is disabled globally.
- No hover-only interactions.

See [`SCREEN_OPTIMIZATION.md`](SCREEN_OPTIMIZATION.md) for detailed layout notes.

## Multi-Display

See [`MULTI_DISPLAY_SETUP.md`](MULTI_DISPLAY_SETUP.md) for targeting a specific display in a multi-monitor setup.
