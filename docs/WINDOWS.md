# Clui on Windows

This is the living document for the Windows fork. Upstream clui is macOS-only; this branch (`windows-support`) ports it to Windows 11 native (no WSL required).

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Fork hygiene (branch, metadata, docs) | done |
| 1 | Dev environment runs on Windows (`npm install`, `npm run dev`) | done |
| 2 | Real Claude binary discovery + PATH bootstrap + cmd.exe wrapping + taskkill /T + Node-native skill installer | done |
| 3 | Overlay UX parity (transparency, always-on-top, virtual desktops) | done — defaults already cross-platform |
| 4 | Tray icon, `.ico` generation, JumpList, Ctrl+Alt+C hotkey, AppUserModelId | done |
| 5 | electron-builder `win` block, NSIS + portable installer | done |
| 6 | winget + scoop manifests with placeholders | done — fill in `<YOUR_GITHUB_HANDLE>` and submit |
| 7 | CI matrix incl. `windows-latest` (release.yml + new ci.yml) | done |
| 8 | PowerShell `setup.ps1` / `doctor.ps1`, README install docs | done |
| 9 | (deferred) `desktopCapturer` screenshot, native Windows terminal-app discovery | not started |

## Dev setup (Phase 1)

```powershell
git clone https://github.com/<your-fork>/clui
cd clui
git checkout windows-support
npm install
npm run dev
```

`npm install` will print a non-fatal warning if Visual Studio Build Tools aren't present:

```
postinstall: electron-builder install-app-deps reported a failure
(typically node-pty needs Visual Studio Build Tools to recompile).
```

This is expected without VS Build Tools and is harmless: the default `RunManager` (stream-json transport over stdio) doesn't use node-pty. The interactive PTY transport (`PtyRunManager`) is gated behind the `CLUI_INTERACTIVE_PERMISSIONS_PTY` env var.

## Enabling PTY mode on Windows

PTY mode requires a working `node-pty` binary built against Electron's V8 ABI. To get one:

**Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)** with the **"Desktop development with C++"** workload (includes MSVC + Windows 10/11 SDK).

  - VS 2022 (v17), VS 2026 (v18) Build Tools — both supported by this fork.
  - VS 2026 (v18) needs node-gyp's VS detection patched (we ship `patches/node-gyp+11.5.0.patch` which adds VS 18 → toolset v145 mapping; auto-applied via `patch-package` on every `npm install`).
  - node-pty 1.1.0's `binding.gyp` opts into Spectre-mitigated libraries, which require an extra VS component most users don't have. We ship `patches/node-pty+1.1.0.patch` that disables Spectre mitigation — node-pty still ships SSP/CFG hardening via the other compiler flags.

After installing Build Tools, run `npm install` again. The `postinstall` hook applies the patches, and `electron-rebuild` compiles `node-pty` against Electron 35's V8 ABI. The build artifacts land in `node_modules/node-pty/build/Release/` and `prebuilds/win32-x64/`.

To enable PTY mode at runtime, set the env var before launching:

```powershell
$env:CLUI_INTERACTIVE_PERMISSIONS_PTY = "1"
npm run dev
```

## Current limitations on Windows (Phase 1)

- Claude binary discovery is hardcoded to `%APPDATA%\npm\claude.cmd`. If your install lives elsewhere (Volta, nvm-windows, custom npm prefix), prompts won't reach Claude until Phase 2.
- `getCliPath()` returns the inherited `process.env.PATH` unchanged. No login-shell PATH enrichment (Windows has no login shell concept).
- The default global hotkey is `Ctrl+Alt+C` ("C for Clui"). `Alt+Space` is reserved by Windows for the title-bar context menu, and `Ctrl+Alt+Space` is Anthropic's Claude Desktop default — `Ctrl+Alt+C` avoids both. Fallback: `Ctrl+Shift+K`.
- The "Open in terminal" launcher honors the Windows default terminal app (Settings → Privacy & Security → For Developers → Terminal). It shells `cmd /c start "" /D <cwd> cmd /k claude` so the user's preferred host (Windows Terminal, Console Host, etc.) takes over.
- The screenshot button captures the **full screen of the display under your cursor** via `desktopCapturer`. There is no interactive crop selection yet (deferred — would require a renderer-side selection overlay). Crop in your image editor afterward, or paste into Claude as-is.
- Voice input via `@huggingface/transformers` ONNX is cross-platform and works. The `whisper-cli` shell-out fallback is dead code on Windows.
- Skill installer shells out `curl | tar` with bash globs. cmd.exe doesn't expand the globs the same way. Will be replaced with Node-native fetch + `tar` package in Phase 2.
- Tray icon uses `trayTemplate.png` (macOS template image) on all platforms — Windows will render it but as a flat colored dot. Phase 4 ships a real `tray.ico`.
- App icon falls back to `icon.png` on Windows (Electron ignores `.icns`). Phase 4 generates `icon.ico`.

## Hotkey rebinding

Currently hardcoded to `Ctrl+Alt+C`. A user-facing settings file under `app.getPath('userData')` is planned for a future phase. To rebind locally, edit `src/main/index.ts` and restart `npm run dev`.

## Tray icon hidden in Win11 overflow

Win11 hides new tray icons in the "Show hidden icons" overflow menu by default. To pin the Clui tray icon to the visible area:

1. Click the chevron `^` in the system tray
2. Drag the Clui icon into the always-visible portion of the tray

## SmartScreen warning on first install

The Phase 5 NSIS installer will be unsigned for v0.1. On first launch you'll see:

> Windows protected your PC

Click **More info** → **Run anyway**. SmartScreen reputation accumulates after enough downloads; the warning will disappear over time (or when an EV code-signing certificate is added in a later phase).

## Reporting Windows-specific issues

Open an issue with the `[windows]` tag and include the output of `scripts/doctor.ps1` (once Phase 8 lands).

## Major-upgrade phases (v0.3-win series)

The Windows fork has shifted from "port parity with macOS" to "first-class daily driver." The plan is in [`~/.claude/plans/help-me-create-a-twinkly-lollipop.md`](../../.claude/plans/help-me-create-a-twinkly-lollipop.md). Status:

| Phase | Description | Status |
|-------|-------------|--------|
| 0.0 | Design language pass — near-black palette + utility classes | done |
| 0.1 | Tethered host window — pill + separate solid host with native drag, host-follow, roam across displays | done |
| 0.5 | Smart Esc cascade + command palette (Ctrl+Space) with fuzzy actions | done |
| 0.6 | Memoize message components for streaming throughput (react-window virtualization for >50-msg history is deferred) | partial |
| 0.7 | Pill bar restructure — `[model \| effort \| mode]` + chat-status chip in input bar | done |
| A | Adaptive model registry — auto-populate from `claude --list-models` with hardcoded fallback | done |
| B | `~/.claude/settings.json` + `CLAUDE.md` parity bridge with chokidar watch | done |
| C | Native slash UIs — `/agents`, `/memory`, `/compact`, `/context` as inline cards | done |
| D | Tabs-snapshot cross-window sync; Chat view in hub. Full CardBoard grid (drag-reorder cards) is deferred. | mvp |
| E | Goal-driven background agents — budget watchdog (sleep-aware via `powerMonitor`), tray submenu, native completion notifications | done |
| F | clui-only Settings Panel — Appearance, Claude config bridge, About + version check | done |
| G | Update banner + one-click `npm i -g @anthropic-ai/claude-code` upgrade | done |
| H | Tailscale peer session sharing — local HTTP server + shared secret + `tailscale status` autocomplete on the hostname field | done |
| I | First-launch onboarding modal; docs refresh | done |

Deferred for later:

- **Per-tab BrowserWindow architecture** ("cards-as-windows"). Phase D shipped the tabs-snapshot infrastructure groundwork; the in-hub Chat view is the v1 stopgap. Spinning each conversation into its own BrowserWindow lands as a follow-up.
- **react-window virtualization** for conversation history past 50 messages. UserMessage + SystemMessage are memoized; throwing a virtual list on top is the remaining win.
- **Comfortable-density audit (Phase 0.4)** and **28px hit-zone audit (Phase 0.3)**. Touched ad-hoc across the 0.1 stages but not done as a focused pass.
