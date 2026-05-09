# Android bubble Claude — research

The short version: **yes, partially, today**. There are three working paths depending on your Android version and tolerance for setup. None of the existing solutions give you full Claude *Code* (with tools/permissions/sessions) in a bubble — for that you'd build a thin wrapper, ~1–2 weeks. Details below.

## Path 1 — Android 17 universal Bubbles (zero code, if you have it)

Android 17 Beta 2 (released **Feb 2026**) made "bubbles" a **windowing mode that works on any app**, not just messaging apps. You long-press any app icon → tap the minimize-to-bubble button → it floats on top of your screen as a draggable bubble. You bubble [the official Claude Android app](https://play.google.com/store/apps/details?id=com.anthropic.claude) and you have a floating Claude.

**Caveats:**
- You need to be on the **Android 17 beta channel** (Pixel 6+ today, possibly OnePlus). Stable release is somewhere mid-to-late 2026.
- Multiple bubbles can run simultaneously, so you can have Claude + a chat app + your IDE side-by-side.
- The system overrides apps' "non-resizable" manifest flags, so even apps not designed for windowing work.
- The bubbled Claude app gets the full Claude UX (chat + Claude Code remote-control if you have Max), just in a smaller floating window.

**How to check:** Settings → About phone → Android version. If "17", you're set. Otherwise skip to Path 2.

[Source — 9to5Google: Android 17 Beta 2](https://9to5google.com/2026/02/26/android-17-beta-2-brings-a-pop-out-windowed-mode-to-all-apps-with-bubbles/) · [Android 17 Beta 3 multitasking bubbles](https://9to5google.com/2026/03/26/android-17-beta-3-adds-bubbles/)

## Path 2 — Tasker + AutoNotification + AutoTools (works on Android 10+, ~$15)

The community pre-Bubbles-API solution: a Tasker macro intercepts notification reply actions from any app and renders them as floating chat heads, exactly like Facebook Messenger. The "Chat Heads For Any App" project from joaoapps has been working since 2019 and still works in 2026.

**What you'd need:**
- [Tasker](https://play.google.com/store/apps/details?id=net.dinglisch.android.taskerm) (~$3.50)
- [AutoNotification](https://play.google.com/store/apps/details?id=com.joaomgcd.autonotification) (~$2.50)
- [AutoTools](https://play.google.com/store/apps/details?id=com.joaomgcd.autotools) (~$2.50)
- The "Chat Heads For Any App" Tasker project import: [XDA thread](https://xdaforums.com/t/project-chat-heads-for-any-app.3955393/)

**How well it works for Claude:**
- Claude Code mobile push notifications (introduced Q1 2026) DO carry a reply action when Claude is asking for permission or has a question. AutoNotification can turn those into a chat head.
- The chat head pops up a small "type a reply" window. You can respond to Claude's question.
- **What you don't get:** a persistent conversation view (just the latest notification's reply box), tool-use stream, attachments, or session history. It's a chat-head-shaped reply box, not a full Claude UI.

**Verdict:** good as a "Claude needs me, here's a quick reply" interrupt handler. Not a replacement for the full client.

[Source — XDA: Chat Heads with Tasker + AutoTools](https://www.xda-developers.com/tasker-chat-heads-autotools/) · [Andrew Ford on Claude Code mobile push](https://andrewford.co.nz/articles/claude-code-instant-notifications-ntfy/)

## Path 3 — Floating-overlay AI assistant apps (Claude API only, no Claude Code)

Several Android apps already render a floating AI chat overlay using `SYSTEM_ALERT_WINDOW`. They're chat-bubble shaped, work on every Android version since 6, and most accept a custom Anthropic API key.

| App | Custom Claude key | Floating UI | Claude Code support |
|---|---|---|---|
| **[ChatBoost](https://play.google.com/store/apps/details?id=studio.muggle.chatboost)** | yes (Anthropic, OpenAI, Azure, Gemini) | system-wide AI Keyboard + cross-app suggestions | **no** — chat completion only |
| [FloatingAI](https://www.aibucket.io/tools/floatingai) | mostly OpenAI; Claude unclear | floating bubble that hovers over apps | no |
| [Arc AI Assistant](https://www.makeuseof.com/i-stopped-switching-to-chatgpt-mid-task-the-day-i-found-this-android-overlay-app/) | varies | swipe-from-edge sidebar | no |

**Critical limitation:** these talk to the Claude API (`/v1/messages`), not Claude Code. They're a chat companion, not a coding agent. You lose:
- File reading/editing
- Tool use (Bash, Edit, Read, etc.)
- Session resumption
- Permission prompts
- Slash commands and skills

**Verdict:** great for general-purpose Claude chat anywhere on screen. Not what you'd want if you specifically need Claude Code's agent capabilities.

## Path 4 — The actual Claude Android app already supports Bubbles (sort of)

The **official Claude Android app** does *NOT* currently implement the conversation-Bubbles API (no `BubbleMetadata` on its notifications, as far as is publicly documented). It receives push notifications from Claude Code remote sessions, but those notifications open the full app, they don't bubble.

Anthropic could add `setBubbleMetadata()` to the notification builder; that would make any Claude Code remote-session push become a persistent bubble. They haven't (as of May 2026). [File a feature request on the Claude help center](https://support.claude.com/) — it's a 2-line patch to their Android source.

[Android docs: Use notification bubbles for conversations](https://developer.android.com/develop/ui/views/notifications/bubbles)

## Path 5 — Build it (~1–2 weeks for MVP)

If you want **Claude Code in a bubble**, you have to write code. Here's the minimum viable shape:

### Architecture

```
┌──────────────────┐              ┌──────────────────┐
│  Your desktop    │   websocket  │  Phone           │
│  Either:         │              │                  │
│  - clui (with    │ ──── E2E ───▶│  ┌────────────┐  │
│    companion     │  encrypted   │  │ chat-head  │  │
│    daemon)       │              │  │ bubble     │  │
│  - Happy CLI     │              │  │ (overlay   │  │
│  - Anthropic's   │              │  │  service)  │  │
│    Remote Control│              │  └─────┬──────┘  │
└──────────────────┘              │        │ tap     │
                                  │        ▼         │
                                  │  ┌────────────┐  │
                                  │  │ chat panel │  │
                                  │  │ (full UI)  │  │
                                  │  └────────────┘  │
                                  └──────────────────┘
```

### Two viable stacks

**A. Expo (React Native) + [react-native-floating-bubble](https://github.com/hybriteq/react-native-floating-bubble)**
- Reuse ~30% of clui's renderer components (Markdown, message rendering).
- The library wraps `WindowManager` + `TYPE_APPLICATION_OVERLAY` for the actual overlay. Bubble is a small Compose-rendered widget; tapping it expands to a full-screen Activity.
- Pair to your existing clui-desktop (after I add a companion daemon — Phase 10 work) or pair to a Happy daemon if you go that route.
- **Effort:** 1–2 weeks for chat head + expanded chat panel + WebSocket pairing.

**B. Native Android (Kotlin + Jetpack Compose)**
- More code but tighter UX and proper bubble integration. Implement `BubbleMetadata` correctly so Android 11+ users get a "real" Bubble (not just a SYSTEM_ALERT_WINDOW chat head).
- Notification with `BubbleMetadata.Builder(PendingIntent, Icon).setDesiredHeight(600).build()`. The expanded view is a resizable embedded Activity — same Activity that renders the conversation.
- **Effort:** 2–3 weeks. Better long-term shape, especially if you want to ride Android 17's bubble windowing later.

Either way, the **transport** is the easier side: just a WebSocket subscribed to events from the clui daemon (or Happy's relay protocol). The renderer is the harder side — you're rebuilding the conversation UI.

## Recommended path for you

1. **Right now today:** install [ChatBoost](https://play.google.com/store/apps/details?id=studio.muggle.chatboost) + your Anthropic API key. That gets you a floating Claude chat overlay anywhere on screen, accepts your existing Claude key, free. **It's not Claude Code** — but it covers the "I need to chat with Claude on top of any app" use case immediately.

2. **If your Android is on the beta channel:** check Settings → About phone → Android version. If "17", long-press the Claude app icon → bubble. Done.

3. **If you want Claude Code (with tools/permissions) in a bubble:** there's no shortcut. Either:
   - Wait for Anthropic to ship `BubbleMetadata` support in the official app (weeks–months, you can file a feature request).
   - Use Tasker + AutoNotification to hijack Claude Code push notifications into chat heads. Limited to the reply box but works on every Android.
   - Build a thin Expo wrapper around Happy's relay or clui's (future) daemon. ~1–2 weeks.

## Sources

- [Android Developers: Use notification bubbles for conversations](https://developer.android.com/develop/ui/views/notifications/bubbles)
- [Notification.BubbleMetadata API reference](https://developer.android.com/reference/android/app/Notification.BubbleMetadata)
- [9to5Google — Android 17 Beta 2 bubbles for any app](https://9to5google.com/2026/02/26/android-17-beta-2-brings-a-pop-out-windowed-mode-to-all-apps-with-bubbles/)
- [Android Central — Android 17 Beta 2 multitasking](https://www.androidcentral.com/apps-software/android-os/android-17-beta-2-rolling-out)
- [XDA — Chat Heads For Any App with Tasker](https://www.xda-developers.com/tasker-chat-heads-autotools/)
- [XDA forum — original project thread](https://xdaforums.com/t/project-chat-heads-for-any-app.3955393/)
- [ChatBoost on Google Play](https://play.google.com/store/apps/details?id=studio.muggle.chatboost)
- [Slack engineering — building Android conversation bubbles](https://slack.engineering/building-android-conversation-bubbles/)
- [react-native-floating-bubble](https://github.com/hybriteq/react-native-floating-bubble)
- [bubbles-for-android (txusballesteros)](https://github.com/txusballesteros/bubbles-for-android)
- [slopus/happy](https://github.com/slopus/happy)
- [Andrew Ford — Claude Code instant notifications](https://andrewford.co.nz/articles/claude-code-instant-notifications-ntfy/)
- [Joe Njenga — Claude Code mobile push notifications walkthrough](https://medium.com/@joe.njenga/how-im-using-new-claude-code-mobile-push-notifications-for-hands-off-coding-79fa924709ae)
