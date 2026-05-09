# Android port research — clui mobile

## TL;DR

You have **three serious options**, and you should probably try the first one before building anything:

1. **Use Anthropic's official Claude mobile app + Remote Control** (no fork, no code). Ships a polished Android client with a "Remote Control" mode (released Q1 2026) that pairs to your desktop Claude Code session. Requires Claude Max. This is the path of least resistance and the most likely to satisfy 80% of "I want clui on my phone."

2. **Use [Happy](https://happy.engineering/) as-is** ([repo](https://github.com/slopus/happy), MIT). Open-source 3-component architecture (CLI daemon + relay server + Expo app). Already on Play Store + App Store + web. Ships e2e-encrypted message routing. If you like this UX, fork and rebrand instead of building from scratch.

3. **Build a clui-mobile companion app** that mirrors clui's UX onto Android. Concrete and finite, but you're competing with Anthropic's own product. Recommended only if you specifically want clui's *pill overlay* UX on the phone (which doesn't transfer well — see below).

There is **no good path** to running clui's actual Electron app on Android. Electron doesn't target Android; the architecture has to change.

## What already works

### Official: Claude Android app + Remote Control

- **Claude Android app** is on Google Play (`com.anthropic.claude`). General Claude UI.
- **Remote Control** (Q1 2026, Max-only) lets you start a Claude Code task in your desktop terminal, then drive it from your phone or web. The local CLI stays the executor; the phone is a thin remote.
- Architecture: synchronization layer between local CLI and mobile/web client. No daemon you write.
- Limitation: requires the Claude Max plan and an active terminal session on a machine somewhere.
- Verdict: **try this first**. If it covers your need, the rest of this doc is unnecessary.

### Open-source: Happy ([slopus/happy](https://github.com/slopus/happy))

A working blueprint for "clui on mobile." Three components:

| Component | What it does | Where it runs |
|---|---|---|
| **Happy CLI** | Wraps `claude` / `codex`. Encrypts session events, ships them to relay. | User's desktop |
| **Happy Server** | Encrypted message broker. Sees only opaque blobs. | Hosted (Cloudflare/etc.) |
| **Happy App** | Expo-based client. Decrypts and renders. | iOS, Android, web (one Expo codebase) |

Stack: TypeScript 95%, Expo for the mobile app, pnpm monorepo, MIT license. The relay protocol is **not publicly documented** but the source is open — readable from `packages/`.

What this proves:
- The companion-app pattern is viable for this exact problem.
- Expo lets you ship a single codebase to iOS + Android + web.
- E2E encryption with a relay is the right security shape — your code stays on your machine, only encrypted transcripts hit a third-party server.

### Termux-based: [claude-code-android](https://github.com/ferrumclaudepilgrim/claude-code-android)

Runs Claude Code **natively on the phone** via [Termux](https://termux.dev/) (a real Linux userspace on Android). Three install paths: native Termux, Ubuntu via `proot-distro` (recommended), or [Android Virtualization Framework](https://source.android.com/docs/core/virtualization) on Pixel 6+ Android 16. Uses the existing terminal UI of Claude Code; no GUI wrapper.

**Caveat:** `@anthropic-ai/claude-code` 2.1.113+ broke native Termux installs (switched to native binaries with no `android-arm64` build). Use 2.1.112, or the Ubuntu container path.

This is for users who genuinely want **on-device, offline-capable, no-desktop** Claude Code. Hard to combine with a polished GUI because the Android sandbox makes it tricky for a third-party native app to spawn and pipe a Termux subprocess. Doable but not the ergonomic fit clui has on desktop.

## Why clui doesn't port directly to Android

| clui assumption | Android reality |
|---|---|
| Electron runtime | Not supported on Android |
| Spawn `claude` as a child process | Android sandbox prevents arbitrary subprocess execution by GUI apps |
| Transparent overlay window with global hotkey | Android has `SYSTEM_ALERT_WINDOW` permission for floating overlays, but no global hotkey API |
| `~/.claude/projects/` on local FS | Android scoped storage; no equivalent of `$HOME` for arbitrary tool access |
| User has Node + npm + git installed | Phone has none of this unless Termux |
| Tray icon | No equivalent — closest is foreground-service notification |
| Multi-session terminal multiplexing | Possible, but the form factor (one screen, one keyboard) makes multi-tab less valuable |

**The pill-overlay UX in particular is desktop-only.** On Android the equivalent of "summon a small input over my work" is the keyboard input bar of the active app, or a Bubble (Android 11+ chathead). Bubbles work but they have UX constraints — small footprint, single-purpose. The macOS NSPanel feel doesn't translate.

So a "clui mobile" can't be a port — it has to be a **rethink**. The two questions to settle before writing any code:

1. **What problem does it solve that the official Claude app + Remote Control doesn't?**
2. **Does Claude Code execute on the phone (Termux) or on a desktop you connect to (companion model)?**

## Architectural option A — Companion app (recommended if you build)

Mobile app pairs to your existing clui Electron desktop app via QR-code → token. clui main process becomes the daemon: it already spawns and manages `claude` subprocesses; it just exposes a websocket-over-relay so the phone can subscribe to one or more sessions.

```
┌──────────────────┐                ┌──────────────────┐                ┌──────────────────┐
│  clui (desktop)  │   websocket    │   relay server   │   websocket    │  clui-mobile     │
│  Electron app    │ ──── E2E ─────▶│  (yours or       │ ◀──── E2E ──── │  Expo / RN       │
│                  │   encrypted    │   Cloudflare DO) │   encrypted    │                  │
│  spawns `claude` │                │  routes blobs    │                │  renders events  │
└──────────────────┘                └──────────────────┘                └──────────────────┘
```

**What changes in clui (desktop):**
- New `src/main/companion/` module. WebSocket client to relay. Pairing flow (QR code in tray menu).
- Sessions become routable: pass through the existing `RunManager` event stream over the wire.
- Permission prompts have to be remoteable — the existing permission server already serves an HTTP UI; the mobile client subscribes to permission events and POSTs decisions back.
- E2E key derivation (libsodium / NaCl). Pairing seeds the symmetric key on both ends.

**What clui-mobile is:**
- Expo app (TypeScript + React Native). Reuses ~30-40% of clui's renderer components — the Markdown/event/permission rendering — minus the pill chrome.
- Minimum surface: tab list, conversation view, input bar, permission prompts, attachments.
- Hard parts: file attachments (Android scoped storage picker), screenshots (`expo-media-library`), voice (Whisper via `onnxruntime-react-native` is plausible).

**Effort (rough):**
- Daemon side (clui main): 3-5 days. The `RunManager` stream-json transport is already structured to be tee-able.
- Mobile app: 2-3 weeks. Expo + Expo Router + a state library + reuse the renderer components.
- Relay: 1-2 days using Cloudflare Durable Objects or a simple Node ws server. Or piggyback on an existing relay protocol if you fork Happy.
- E2E crypto: 1 day with libsodium.
- App store submission: 1-2 weeks of intermittent work (review, screenshots, privacy policy).

**Total:** ~5-7 weeks of focused work for a usable v0.1.

## Architectural option B — Termux-native Android app

Wraps a Termux subprocess in a real Android UI. Skip the desktop entirely.

```
┌─────────────────────────────────┐
│  clui-mobile (native Android)   │
│                                 │
│  Jetpack Compose UI             │
│       │                         │
│       ▼                         │
│  Termux:RUN_COMMAND intent ───▶ │
│                                 │
│  Termux app (separate)          │
│       │                         │
│       ▼                         │
│   `claude` running in Termux    │
└─────────────────────────────────┘
```

**Why it's hard:**
- You can't bundle Claude Code into the APK; the user installs Termux + sets up node + claude separately.
- The app drives Termux via [Termux:RUN_COMMAND](https://wiki.termux.com/wiki/RUN_COMMAND_Intent) intents, but capturing stdout streams in real time is awkward (you'd have to write Termux output to a shared file and tail it).
- Termux is now hostile to non-F-Droid distribution. Your app's setup instructions become a Russian doll.
- The 2.1.113+ native binary break means you depend on community workarounds.

**Why you might still want it:** offline operation. Genuinely useful if you're on a plane.

**Effort:** ~3-4 weeks, but most of it is fighting the Termux integration rather than building product.

## Architectural option C — PWA / web client

A web app that talks to clui-desktop's existing local HTTP server (the permission server already exists). Use Tailscale or ngrok or Cloudflare Tunnel to expose your desktop's port to your phone.

**Pros:** zero app-store friction, no native code, nothing to build beyond a single React app.
**Cons:** no native overlay UX, no push notifications without PWA gymnastics, depends on a tunnel, not really a "fork" — more a project of its own.

**Verdict:** worth a weekend to prototype. Not a real Android product.

## Recommended path

Sequenced from least to most work:

1. **Install Anthropic's Claude Android app** ([Play Store link](https://play.google.com/store/apps/details?id=com.anthropic.claude)) and try Remote Control if you have Max. Stop here if it works.
2. **Install Happy** (`npm i -g happy && happy`, then download the [Happy Android app](https://play.google.com/store/apps/details?id=com.ex3ndr.happy)). It's already what you'd build. If the UX is close enough, fork Happy + rebrand, don't reinvent.
3. **If neither suffices** — start the companion app fork (Option A). Build it as a separate repo (`clui-mobile`) and treat the desktop clui's daemon shim as a Phase 10+ addition to this fork.

Skip Termux-native (Option B) unless your hard requirement is offline. Skip PWA (Option C) unless you want a one-weekend hack.

## Tech stack if you build (Option A)

- **Mobile UI:** [Expo](https://expo.dev/) + React Native. Same TypeScript + React skill set as clui's renderer. Single codebase for Android + iOS + web.
- **Mobile rendering:** Reuse clui's `ConversationView`, `PermissionCard`, etc. Replace `framer-motion` with `react-native-reanimated`, `@phosphor-icons/react` with `@phosphor-icons/react-native`.
- **State:** Zustand works in RN unchanged.
- **Markdown:** [`react-native-markdown-display`](https://github.com/iamacup/react-native-markdown-display) replaces `react-markdown`.
- **Crypto:** [`libsodium-jsi`](https://github.com/margelo/libsodium-jsi) for hardware-accelerated NaCl.
- **Transport:** WebSocket (RN built-in) over a simple relay (Node + `ws`, or Cloudflare Durable Objects).
- **Pairing:** `expo-camera` for QR scan; clui-desktop tray menu shows the QR.
- **Notifications:** `expo-notifications` for "Claude needs your approval" pushes.
- **Build:** EAS Build for Android `.apk`/`.aab`.
- **Distribution:** Play Store closed beta → public.

## Open questions for the user

These should be answered before any code lands:

1. **Is your Claude plan Max?** If yes, Anthropic's Remote Control may already do this. If no, official Remote Control isn't an option and Happy / a fork is your only path.
2. **Does clui's desktop session need to be running for the phone to work?** (Companion model says yes.) Or do you want a self-contained on-phone experience? (Termux model.)
3. **Does the phone need to send code edits, or just chat with Claude?** (Pure chat is much simpler — no scoped-storage file picker work.)
4. **iOS too, or Android only?** Expo gives both for free; the question is whether the App Store review / annual cert is worth the cost.
5. **Hosted relay or self-hosted?** A trusted-third-party relay simplifies onboarding but you become responsible for it. Cloudflare Durable Objects scales free for personal use.

## Sources

- [Sealos: Claude Code Mobile guide (2026)](https://sealos.io/blog/claude-code-on-phone/)
- [Happy mobile client homepage](https://happy.engineering/)
- [slopus/happy on GitHub](https://github.com/slopus/happy)
- [VentureBeat: Anthropic releases mobile Remote Control for Claude Code](https://venturebeat.com/orchestration/anthropic-just-released-a-mobile-version-of-claude-code-called-remote)
- [Claude Android app blog post](https://claude.com/blog/android-app)
- [Claude Android app on Google Play](https://play.google.com/store/apps/details?id=com.anthropic.claude)
- [ferrumclaudepilgrim/claude-code-android](https://github.com/ferrumclaudepilgrim/claude-code-android)
- [Ishabdullah/claude-code-termux (workaround for 2.1.113+ break)](https://github.com/Ishabdullah/claude-code-termux)
- [Claude Code headless / programmatic docs](https://code.claude.com/docs/en/headless)
- [Claude Agent SDK quickstart](https://platform.claude.com/docs/en/agent-sdk/quickstart)
- [Termux:RUN_COMMAND intent docs](https://wiki.termux.com/wiki/RUN_COMMAND_Intent)
