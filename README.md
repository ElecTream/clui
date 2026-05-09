# Clui - The better UI for Claude Code

> [!NOTE]
> **Windows fork** of [Youssef2430/clui](https://github.com/Youssef2430/clui), which is itself a fork of [Lucas Couto](https://github.com/lcoutodemos)'s [Clui CC](https://github.com/lcoutodemos/clui-cc).
> Native Windows support is in active development on the `windows-support` branch — see [docs/WINDOWS.md](docs/WINDOWS.md) for the current parity matrix and known issues.

It's a lightweight, transparent desktop overlay for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Clui wraps the Claude Code CLI in a floating pill interface with multi-tab sessions, a permission approval UI, voice input, and a skills marketplace. Originally macOS-only; this fork adds Windows 11 native support.

![Hero](resources/hero.jpeg)

## Features

- **Floating overlay** - transparent, click-through window that stays on top. Toggle with `⌥ + Space` on macOS / `Ctrl + Alt + C` on Windows (fallback: `Cmd/Ctrl + Shift + K`).
- **Multi-tab sessions** - each tab spawns its own `claude -p` process with independent session state.
- **Permission approval UI** - intercepts tool calls via PreToolUse HTTP hooks so you can review and approve/deny from the UI.
- **Conversation history** - browse and resume past Claude Code sessions.
- **Skills marketplace** - install plugins from Anthropic's GitHub repos without leaving Clui.
- **Voice input** - local speech-to-text via Whisper (required, installed automatically).
- **File & screenshot attachments** - paste images or attach files directly.
- **Dual theme** - dark/light mode with system-follow option.

> [!IMPORTANT]
> Clui is not yet notarized with Apple. macOS Gatekeeper may block the first launch. See the install sections below for the workaround. Notarization is coming soon.

## Install

### Website

Visit **[clui.app](https://clui.app)** to install via Homebrew or download the `.dmg` directly, it auto-detects your Mac's architecture.

<a href="https://clui.app">
  <img src="resources/homepage.jpeg" alt="Clui website" width="600" />
</a>

### Homebrew

```bash
brew install --cask Youssef2430/clui/clui
```

### DMG Download (macOS)

Download the latest `.dmg` from [Releases](https://github.com/Youssef2430/clui/releases):

- **Apple Silicon (M1+):** `Clui-x.x.x-arm64.dmg`
- **Intel:** `Clui-x.x.x.dmg`

> **First launch:** macOS may block the app because it's not notarized. Go to **System Settings > Privacy & Security > Open Anyway**, or run:
> ```bash
> xattr -cr /Applications/Clui.app
> ```
> You only need to do this once.

### Windows

Once the Windows fork is published to a GitHub Release, install via:

```powershell
# winget (preferred)
winget install <YOUR_GITHUB_HANDLE>.Clui

# scoop (if you've added the bucket)
scoop bucket add clui https://github.com/<YOUR_GITHUB_HANDLE>/scoop-bucket
scoop install clui/clui

# Direct download — grab Clui-Setup-x.x.x.exe from Releases.
```

> **First launch:** Windows SmartScreen will warn the installer is unsigned. Click **More info → Run anyway**. SmartScreen reputation accumulates after enough downloads — the warning will disappear over time. See [`docs/WINDOWS.md`](docs/WINDOWS.md) for details.

## Prerequisites

- **macOS 13+** (Ventura or later) **or Windows 10 1809+ / Windows 11**
- **Claude Code CLI** - install with `npm install -g @anthropic-ai/claude-code` and authenticate by running `claude`

> **No API keys or `.env` file required.** Clui uses your existing Claude Code CLI authentication (Pro/Team/Enterprise subscription).

## How It Works

```
UI prompt → Main process spawns claude -p → NDJSON stream → live render
                                         → tool call? → permission UI → approve/deny
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full deep-dive.

<details>
<summary><strong>Development</strong></summary>

```bash
git clone https://github.com/Youssef2430/clui.git
cd clui
npm install
npm run dev
```

Renderer changes update instantly. Main-process changes require restarting `npm run dev`.

### Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start in dev mode with hot reload |
| `npm run build` | Production build (no packaging) |
| `npm run dist` | Package as macOS `.app` into `release/` |
| `npm run dist:dmg` | Build DMG + ZIP for both architectures |
| `npm run dist:win` | Build Windows NSIS installer + portable .exe |
| `npm run dist:win:nsis` | Build Windows NSIS installer only |
| `npm run dist:win:portable` | Build Windows portable .exe only |
| `npm run build-icons` | Regenerate `resources/icon.ico` + `tray.ico` from PNG sources |
| `npm run setup` | (Windows) check prerequisites |
| `npm run doctor` | Run environment diagnostic (auto-dispatches by platform) |

</details>

## Troubleshooting

For setup issues and recovery commands, see [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md).

Quick self-check:

```bash
npm run doctor
```

## Known Limitations

- **Requires Claude Code CLI** - Clui is a UI layer, not a standalone AI client.
- **Windows fork is in active development** — see [`docs/WINDOWS.md`](docs/WINDOWS.md) for the parity matrix. As of v0.2.0-win.0, screenshot capture and per-app terminal picker are macOS-only; everything else works on both.

## Q&A
> Why didn't you just contribute to the original project ?
>
> > I just got excited about the project and at first wanted a better way to install it and keep up with its versions but I ended up using it and wanting to add some features so I figured I'd use it as a base conva to build on top!
