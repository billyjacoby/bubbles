# Bubbles for Omarchy

Bubbles is a native Omarchy shell plugin with two entry points:

- a headless service that keeps the BlueBubbles notification listener alive;
- a bar widget that reports connection state and opens or focuses the TUI.

The service also registers Bubbles with the desktop application index. Search
for **Bubbles** from the Super+Space menu to open or focus the TUI.

The committed bundles include the runtime dependencies, so installation does
not run package-manager hooks. Node.js 20 or newer, `jq`, `hyprctl`, and
`xdg-terminal-exec` must be available; these are present on a standard Omarchy
installation.

## Install

```bash
omarchy plugin add https://github.com/billyjacoby/bubbles.git --enable
```

Click the Bubbles icon and complete connection setup on first launch. The URL
and password are stored in `~/.config/bubbles/config.json` with user-only
permissions. Left-click opens or focuses the TUI; right-click reconnects the
background listener. The same focus-or-open behavior is used by the Bubbles
entry under Super+Space → Apps.

## Develop

Run `pnpm --filter @bubbles/omarchy build` after changing the TUI, shared client,
or plugin runtime. Validate a clean archive because dependency symlinks in a
development checkout are intentionally rejected by Omarchy's plugin validator.
