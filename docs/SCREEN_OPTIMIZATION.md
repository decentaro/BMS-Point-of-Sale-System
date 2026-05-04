# Screen Optimization

## Target Resolutions

The app is optimised for the following form factors:

| Target | Resolution | Notes |
|--------|-----------|-------|
| 10.1" kiosk | 1024 × 600 – 1366 × 768 | Primary deployment target |
| Development desktop | Up to 1920 × 1080 | Windowed at 80% of display |

In production the Electron window fills the entire target display (fullscreen / kiosk mode). In development it opens at 80% of the display up to 1200 × 800, resizable, so you can inspect and test responsiveness.

## UI Stack

The frontend is built with **Tailwind CSS 4 + shadcn/ui (Radix UI)**. Layout adapts to the viewport using Tailwind utility classes rather than fixed pixel sizes. There are no hardcoded panel dimensions.

Key layout decisions:
- Navigation sidebar is fixed-width on large viewports and collapses on small ones.
- Product grids use `grid-cols-*` responsive classes.
- All interactive elements meet the 44 × 44 px minimum touch target requirement.
- `user-select: none` and `-webkit-tap-highlight-color: transparent` are applied globally for touch use.

## Touch Optimisation

- Minimum button size: **44 × 44 px**
- All numpad / PIN keys are oversized for finger accuracy.
- No hover-only interactions — every action is reachable by tap.
- Scrollable areas use `overflow-y: auto` with momentum scrolling (`-webkit-overflow-scrolling: touch`).

## Kiosk-Specific Settings (Production)

See [`KIOSK_MODE.md`](KIOSK_MODE.md) for the full configuration. In summary:
- `frame: false` — no title bar
- `fullscreen: true` / `kiosk: true` — fills the display
- `alwaysOnTop: true` — prevents other windows from appearing on top
- F12 / DevTools disabled

## Testing Checklist

- [ ] All content visible without horizontal scroll at 1024 × 600
- [ ] Touch targets ≥ 44 px on every interactive element
- [ ] Text readable at kiosk viewing distance (arm's length)
- [ ] No overflow or clipping in product grid, employee list, receipt preview
- [ ] POS numpad usable with finger — no keys cramped or overlapping
- [ ] Modal dialogs centered and fully visible at minimum resolution
