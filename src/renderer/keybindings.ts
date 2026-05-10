/**
 * Keybinding registry — Phase 0.5b.
 *
 * Single source of truth for all rebindable keyboard shortcuts. Each
 * Binding has a stable `id` (used as the key in user-overrides) and a
 * `defaultKey` in the portable string format below.
 *
 * Format:
 *   <modifiers>+<key>     e.g. "mod+shift+t", "mod+space", "mod+."
 *
 * Modifier tokens (case-insensitive, in any order):
 *   mod    — Cmd on macOS, Ctrl on Windows/Linux. The default for nearly
 *            every binding because users expect the platform-native one.
 *   ctrl   — literal Ctrl on every platform. Only use when you need
 *            "Ctrl-not-Cmd" semantics on Mac (rare; we don't ship any).
 *   shift, alt, meta — themselves
 *
 * Key tokens are normalized to lowercase. A few aliases for readability:
 *   "space" → " ",  "tab" → "tab",  letter / digit / punctuation as-is.
 *
 * Esc / Space / Tab-cycling stay in useKeyboardShortcuts.ts as locked
 * special-cases (their semantics — Esc cascade, Space-when-no-editable,
 * Ctrl+Tab forward/backward — don't fit the generic dispatch model).
 */
export type BindingGroup = 'tabs' | 'conversation' | 'overlay' | 'tools'

export interface BindingHandlerCtx {
  onAttachFile: () => void
  onScreenshot: () => void
  onFocusInput: () => void
  onOpenSlashMenu: () => void
  onVoiceCapture: () => void
}

export interface Binding {
  id: string
  label: string
  group: BindingGroup
  defaultKey: string
  /** Called when the binding's key combo fires. The handler may reference
   *  the store / IPC; ctx provides the prop-level callbacks the
   *  useKeyboardShortcuts hook owns. */
  run: (ctx: BindingHandlerCtx) => void
}

// Lazy import to avoid pulling the store into modules that only need the
// metadata (e.g. SettingsPanel, which lists bindings without dispatching).
const lazyStore = () => import('./stores/sessionStore').then((m) => m.useSessionStore)
const lazyTerminal = () => import('./utils/terminal').then((m) => m.openInPreferredTerminal)

export const BINDINGS: readonly Binding[] = [
  // ─── Tabs ───
  {
    id: 'new-tab',
    label: 'New tab (default directory)',
    group: 'tabs',
    defaultKey: 'mod+n',
    run: () => { void lazyStore().then((s) => s.getState().createTab()) },
  },
  {
    id: 'new-tab-here',
    label: 'New tab in same folder',
    group: 'tabs',
    defaultKey: 'mod+t',
    run: () => { void lazyStore().then((s) => s.getState().createTabInSameFolder()) },
  },
  {
    id: 'close-tab',
    label: 'Close current tab',
    group: 'tabs',
    defaultKey: 'mod+w',
    run: () => {
      void lazyStore().then((s) => {
        const { activeTabId } = s.getState()
        s.getState().closeTab(activeTabId)
      })
    },
  },
  {
    id: 'reopen-tab',
    label: 'Reopen last closed tab',
    group: 'tabs',
    defaultKey: 'mod+shift+t',
    run: () => { void lazyStore().then((s) => s.getState().reopenLastClosedTab()) },
  },
  {
    id: 'next-tab',
    label: 'Next tab',
    group: 'tabs',
    defaultKey: 'mod+shift+]',
    run: () => { void lazyStore().then((s) => s.getState().nextTab()) },
  },
  {
    id: 'prev-tab',
    label: 'Previous tab',
    group: 'tabs',
    defaultKey: 'mod+shift+[',
    run: () => { void lazyStore().then((s) => s.getState().prevTab()) },
  },

  // ─── Conversation ───
  {
    id: 'focus-input',
    label: 'Focus input',
    group: 'conversation',
    defaultKey: 'mod+l',
    run: (ctx) => ctx.onFocusInput(),
  },
  {
    id: 'clear-conversation',
    label: 'Clear conversation',
    group: 'conversation',
    defaultKey: 'mod+k',
    run: () => {
      void lazyStore().then((s) => {
        s.getState().clearTab()
        s.getState().addSystemMessage('Conversation cleared.')
      })
    },
  },
  {
    id: 'stop-run',
    label: 'Stop active run',
    group: 'conversation',
    defaultKey: 'mod+.',
    run: () => { void lazyStore().then((s) => s.getState().stopActiveRun()) },
  },
  {
    id: 'copy-last-response',
    label: 'Copy last response',
    group: 'conversation',
    defaultKey: 'mod+shift+c',
    run: () => { void lazyStore().then((s) => s.getState().copyLastResponse()) },
  },

  // ─── Overlay ───
  {
    id: 'expand-toggle',
    label: 'Expand / collapse',
    group: 'overlay',
    defaultKey: 'mod+e',
    run: () => { void lazyStore().then((s) => s.getState().toggleExpanded()) },
  },
  {
    id: 'minimize',
    label: 'Minimize (collapse if expanded)',
    group: 'overlay',
    defaultKey: 'mod+m',
    run: () => {
      void lazyStore().then((s) => {
        if (s.getState().isExpanded) s.getState().toggleExpanded()
      })
    },
  },
  {
    id: 'command-palette',
    label: 'Open command palette',
    group: 'overlay',
    defaultKey: 'mod+space',
    run: () => { void lazyStore().then((s) => s.getState().toggleCommandPalette()) },
  },

  // ─── Tools & input ───
  {
    id: 'slash-menu',
    label: 'Open slash command palette',
    group: 'tools',
    defaultKey: 'mod+shift+p',
    run: (ctx) => ctx.onOpenSlashMenu(),
  },
  {
    id: 'marketplace',
    label: 'Toggle skills marketplace',
    group: 'tools',
    defaultKey: 'mod+shift+m',
    run: () => { void lazyStore().then((s) => s.getState().toggleMarketplace()) },
  },
  {
    id: 'search-panel',
    label: 'Toggle search panel',
    group: 'tools',
    defaultKey: 'mod+shift+f',
    run: () => { void lazyStore().then((s) => s.getState().toggleSearchPanel()) },
  },
  {
    id: 'history',
    label: 'Toggle session history',
    group: 'tools',
    defaultKey: 'mod+shift+h',
    run: () => { void lazyStore().then((s) => s.getState().toggleHistoryPicker()) },
  },
  {
    id: 'attach',
    label: 'Attach file',
    group: 'tools',
    defaultKey: 'mod+shift+a',
    run: (ctx) => ctx.onAttachFile(),
  },
  {
    id: 'screenshot',
    label: 'Take screenshot',
    group: 'tools',
    defaultKey: 'mod+shift+s',
    run: (ctx) => ctx.onScreenshot(),
  },
  {
    id: 'open-terminal',
    label: 'Open in terminal',
    group: 'tools',
    defaultKey: 'mod+shift+e',
    run: () => {
      void Promise.all([lazyStore(), lazyTerminal()]).then(([s, openInPreferredTerminal]) => {
        const state = s.getState()
        const tab = state.tabs.find((t) => t.id === state.activeTabId)
        if (tab) openInPreferredTerminal(tab.claudeSessionId, tab.workingDirectory)
      })
    },
  },
  {
    id: 'voice',
    label: 'Voice capture',
    group: 'tools',
    defaultKey: 'mod+shift+v',
    run: (ctx) => ctx.onVoiceCapture(),
  },
]

export const BINDING_BY_ID: Readonly<Record<string, Binding>> = Object.fromEntries(
  BINDINGS.map((b) => [b.id, b]),
)

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

/** Normalize a stored binding string into a canonical sorted-modifiers form
 *  ("shift+mod+t" → "mod+shift+t") so equality comparisons are reliable. */
export function normalizeBinding(raw: string): string {
  if (!raw) return ''
  const parts = raw.toLowerCase().split('+').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return ''
  const key = parts.pop()!
  const order = ['mod', 'ctrl', 'meta', 'alt', 'shift']
  const mods = parts.filter((p) => order.includes(p)).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return [...mods, normalizeKeyToken(key)].join('+')
}

function normalizeKeyToken(key: string): string {
  if (key === ' ') return 'space'
  if (key === 'arrowup') return 'up'
  if (key === 'arrowdown') return 'down'
  if (key === 'arrowleft') return 'left'
  if (key === 'arrowright') return 'right'
  return key
}

/** Pretty key for display. "mod+shift+t" → "⌘ Shift T" on Mac, "Ctrl+Shift+T" elsewhere. */
export function formatBinding(raw: string): string {
  const norm = normalizeBinding(raw)
  if (!norm) return ''
  const parts = norm.split('+')
  const key = parts.pop()!
  const labelMod = (m: string): string => {
    if (m === 'mod') return IS_MAC ? '⌘' : 'Ctrl'
    if (m === 'ctrl') return IS_MAC ? '⌃' : 'Ctrl'
    if (m === 'shift') return IS_MAC ? '⇧' : 'Shift'
    if (m === 'alt') return IS_MAC ? '⌥' : 'Alt'
    if (m === 'meta') return IS_MAC ? '⌘' : 'Win'
    return m
  }
  const labelKey = (k: string): string => {
    if (k === 'space') return 'Space'
    if (k === 'tab') return 'Tab'
    if (k.length === 1) return k.toUpperCase()
    return k.slice(0, 1).toUpperCase() + k.slice(1)
  }
  const sep = IS_MAC ? ' ' : '+'
  return [...parts.map(labelMod), labelKey(key)].join(sep)
}

/** Build the e.key portion to compare. Lowercased on every platform. */
function eventKey(e: KeyboardEvent): string {
  const k = e.key.toLowerCase()
  if (k === ' ') return 'space'
  return normalizeKeyToken(k)
}

/** Test a KeyboardEvent against a binding string. */
export function matchesBinding(e: KeyboardEvent, raw: string): boolean {
  const norm = normalizeBinding(raw)
  if (!norm) return false
  const parts = norm.split('+')
  const key = parts.pop()!
  const wantMod = parts.includes('mod')
  const wantCtrl = parts.includes('ctrl')
  const wantShift = parts.includes('shift')
  const wantAlt = parts.includes('alt')
  const wantMeta = parts.includes('meta')

  // mod = Cmd on Mac, Ctrl elsewhere. ctrl = literal Ctrl always.
  const primary = IS_MAC ? e.metaKey : e.ctrlKey
  const literalCtrl = e.ctrlKey

  // Modifier presence
  if (wantMod !== primary) return false
  if (wantCtrl) {
    // Literal Ctrl required; on non-Mac this overlaps with mod, so just
    // require the key. On Mac it's the unique Ctrl key.
    if (!literalCtrl) return false
    if (!IS_MAC && wantMod) {
      // On Win/Linux, ctrl IS mod — already counted.
    }
  }
  if (wantShift !== e.shiftKey) return false
  if (wantAlt !== e.altKey) return false
  // Meta is only meaningful on Mac (where mod already eats Cmd). Treat as exact match.
  if (wantMeta && !e.metaKey) return false

  return eventKey(e) === key
}

/** Capture a KeyboardEvent and turn it into a normalized binding string.
 *  Returns null if the event has no usable key (just a modifier press). */
export function captureBinding(e: KeyboardEvent): string | null {
  const rawKey = e.key.toLowerCase()
  // Skip pure-modifier presses: meta / control / shift / alt by themselves.
  if (['meta', 'control', 'shift', 'alt', 'os'].includes(rawKey)) return null
  // Don't capture Esc — reserved for cancel-capture in the UI.
  if (rawKey === 'escape') return null

  const parts: string[] = []
  if (IS_MAC ? e.metaKey : e.ctrlKey) parts.push('mod')
  if (IS_MAC && e.ctrlKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  parts.push(normalizeKeyToken(rawKey))
  return normalizeBinding(parts.join('+'))
}
