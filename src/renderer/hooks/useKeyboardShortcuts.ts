import { useEffect, useCallback } from 'react'
import { useSessionStore } from '../stores/sessionStore'

/**
 * Cycle the permission mode in a fixed order. Today the store only supports
 * 'ask' | 'auto'; when 'plan' (and others) ship in a future phase we just
 * extend this array — the cycle picks them up automatically.
 */
import type { PermissionModeKind } from '../../shared/types'

const PERMISSION_MODE_CYCLE: Array<PermissionModeKind> = ['ask', 'auto', 'plan']

function cyclePermissionMode(current: PermissionModeKind, forward = true): PermissionModeKind {
  const idx = PERMISSION_MODE_CYCLE.indexOf(current)
  const safeIdx = idx < 0 ? 0 : idx
  const len = PERMISSION_MODE_CYCLE.length
  const next = forward ? (safeIdx + 1) % len : (safeIdx - 1 + len) % len
  return PERMISSION_MODE_CYCLE[next]
}

/**
 * Smart Esc cascade — Phase 0.5a.
 * Closes the most-foreground UI in priority order rather than blanket-hiding
 * the overlay. Does NOT hide the pill (users press Esc by habit and would
 * lose their workspace). To dismiss the overlay use the global summon hotkey.
 *
 * Priority: cancel running run → close command palette → close marketplace →
 * close search panel → close history picker → collapse expanded → blur input.
 */
function smartEsc(): boolean {
  const state = useSessionStore.getState()

  // 1. Cancel an active run
  const tab = state.tabs.find((t) => t.id === state.activeTabId)
  if (tab && (tab.status === 'running' || tab.status === 'connecting')) {
    state.stopActiveRun()
    return true
  }

  // 2. Close command palette (state lives in sessionStore — see below)
  if (state.commandPaletteOpen) {
    state.setCommandPaletteOpen(false)
    return true
  }

  // 2b. Close settings panel (Phase F)
  if (state.settingsPanelOpen) {
    state.setSettingsPanelOpen(false)
    return true
  }

  // 3. Close marketplace
  if (state.marketplaceOpen) {
    state.toggleMarketplace()
    return true
  }

  // 4. Close search panel
  if (state.searchPanelOpen) {
    state.toggleSearchPanel()
    return true
  }

  // 5. Close history picker (if open)
  if (state.historyPickerOpen) {
    state.toggleHistoryPicker()
    return true
  }

  // 6. Collapse expanded view
  if (state.isExpanded) {
    state.toggleExpanded()
    return true
  }

  // 7. Blur the active element so Space-to-focus still works
  if (document.activeElement && (document.activeElement as HTMLElement).blur) {
    ;(document.activeElement as HTMLElement).blur()
    return true
  }

  return false
}

/**
 * Centralized keyboard shortcut handler for Clui.
 *
 * Registered on the document level so shortcuts work regardless of focus.
 * The "primary" modifier is Cmd on macOS, Ctrl on Windows/Linux. The platform
 * literal-Ctrl ("Ctrl+Tab" semantics on Mac, also Ctrl+Tab on Windows) is
 * handled separately so it works identically on both.
 *
 * Note: on macOS, when Cmd is held, e.key returns lowercase even with Shift.
 * We normalize all key comparisons to lowercase to handle this.
 */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
export function useKeyboardShortcuts({
  onAttachFile,
  onScreenshot,
  onFocusInput,
  onOpenSlashMenu,
  onVoiceCapture,
}: {
  onAttachFile: () => void
  onScreenshot: () => void
  onFocusInput: () => void
  onOpenSlashMenu: () => void
  onVoiceCapture: () => void
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore held-down repeats (prevents spam-creating tabs, etc.)
      // and IME composition (prevents interfering with text input methods)
      if (e.repeat || e.isComposing) return

      // `primary` = Cmd on macOS, Ctrl on Windows/Linux. `ctrlExtra` is the literal Ctrl
      // *as a separate modifier from primary* — only meaningful on macOS.
      // `tabCycle` is the universal Ctrl+Tab tab-switch convention (works on both platforms).
      const primary = IS_MAC ? e.metaKey : e.ctrlKey
      const ctrlExtra = IS_MAC ? e.ctrlKey : false
      const tabCycle = e.ctrlKey
      const shift = e.shiftKey
      const key = e.key.toLowerCase()

      // Detect whether the user is currently typing in an editable element. Many
      // top-level shortcuts (especially Space → focus-input and Esc → cascade)
      // need to behave differently when an input has focus.
      const target = e.target as HTMLElement | null
      const isEditable =
        !!target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        )

      // ─── Esc — smart cascading dismiss (Phase 0.5a) ───
      // Cancel run → close palette → close marketplace → close search → collapse → blur.
      // Never hides the pill (use the global summon hotkey for that).
      if (key === 'escape' && !primary && !shift) {
        const handled = smartEsc()
        if (handled) {
          e.preventDefault()
          return
        }
      }

      // ─── Ctrl + Space — open command palette (Phase 0.5b) ───
      if (primary && !shift && !ctrlExtra && key === ' ') {
        e.preventDefault()
        useSessionStore.getState().toggleCommandPalette()
        return
      }

      // ─── Space — focus input when no editable has focus (Phase 0.5a) ───
      // Single keystroke shortcut so users can type without first reaching for
      // the mouse. Silenced when an editable element already owns focus so it
      // doesn't break normal typing.
      if (
        key === ' ' &&
        !primary &&
        !shift &&
        !ctrlExtra &&
        !e.altKey &&
        !isEditable
      ) {
        e.preventDefault()
        onFocusInput()
        return
      }

      // ─── primary + N — New tab (default directory) ───
      if (primary && !shift && !ctrlExtra && key === 'n') {
        e.preventDefault()
        useSessionStore.getState().createTab()
        return
      }

      // ─── primary + T — New tab in same folder ───
      if (primary && !shift && !ctrlExtra && key === 't') {
        e.preventDefault()
        useSessionStore.getState().createTabInSameFolder()
        return
      }

      // ─── primary + W — Close current tab ───
      if (primary && !shift && !ctrlExtra && key === 'w') {
        e.preventDefault()
        const { activeTabId } = useSessionStore.getState()
        useSessionStore.getState().closeTab(activeTabId)
        return
      }

      // ─── primary + M — Minimize (collapse) ───
      if (primary && !shift && !ctrlExtra && key === 'm') {
        e.preventDefault()
        const { isExpanded } = useSessionStore.getState()
        if (isExpanded) {
          useSessionStore.getState().toggleExpanded()
        }
        return
      }

      // ─── Ctrl + Tab / Ctrl + Shift + Tab — Cycle permission/run mode (Phase 0.5a) ───
      // Tab cycling moves to Ctrl+Shift+]/[ + Ctrl+1..9 (both already work).
      // Cycles through PERMISSION_MODE_CYCLE — currently 'ask' ↔ 'auto', will pick
      // up 'plan' and others when added in a follow-up phase.
      if (tabCycle && key === 'tab') {
        e.preventDefault()
        const current = useSessionStore.getState().permissionMode
        const next = cyclePermissionMode(current, !shift)
        useSessionStore.getState().setPermissionMode(next)
        useSessionStore.getState().addSystemMessage(`Permission mode: ${next}`)
        return
      }

      // ─── primary + Shift + T — Reopen most-recently closed tab (Phase 0.5) ───
      if (primary && shift && key === 't') {
        e.preventDefault()
        void useSessionStore.getState().reopenLastClosedTab()
        return
      }

      // ─── primary + Shift + ] — Next tab ───
      if (primary && shift && key === ']') {
        e.preventDefault()
        useSessionStore.getState().nextTab()
        return
      }

      // ─── primary + Shift + [ — Previous tab ───
      if (primary && shift && key === '[') {
        e.preventDefault()
        useSessionStore.getState().prevTab()
        return
      }

      // ─── primary + K — Clear conversation ───
      if (primary && !shift && !ctrlExtra && key === 'k') {
        e.preventDefault()
        useSessionStore.getState().clearTab()
        useSessionStore.getState().addSystemMessage('Conversation cleared.')
        return
      }

      // ─── primary + . — Stop/cancel active run ───
      if (primary && !shift && !ctrlExtra && key === '.') {
        e.preventDefault()
        useSessionStore.getState().stopActiveRun()
        return
      }

      // ─── primary + Shift + C — Copy last response ───
      if (primary && shift && key === 'c') {
        e.preventDefault()
        useSessionStore.getState().copyLastResponse()
        return
      }

      // ─── primary + E — Toggle expanded/collapsed view ───
      if (primary && !shift && !ctrlExtra && key === 'e') {
        e.preventDefault()
        useSessionStore.getState().toggleExpanded()
        return
      }

      // ─── primary + Shift + P — Open slash command palette ───
      if (primary && shift && key === 'p') {
        e.preventDefault()
        onOpenSlashMenu()
        return
      }

      // ─── primary + Shift + M — Toggle skills marketplace ───
      if (primary && shift && key === 'm') {
        e.preventDefault()
        useSessionStore.getState().toggleMarketplace()
        return
      }

      // ─── primary + Shift + F — Toggle search panel ───
      if (primary && shift && key === 'f') {
        e.preventDefault()
        useSessionStore.getState().toggleSearchPanel()
        return
      }

      // ─── primary + Shift + H — Toggle session history ───
      if (primary && shift && key === 'h') {
        e.preventDefault()
        useSessionStore.getState().toggleHistoryPicker()
        return
      }

      // ─── primary + Shift + A — Attach file ───
      if (primary && shift && key === 'a') {
        e.preventDefault()
        onAttachFile()
        return
      }

      // ─── primary + Shift + S — Take screenshot ───
      if (primary && shift && key === 's') {
        e.preventDefault()
        onScreenshot()
        return
      }

      // (Open in Terminal removed from Ctrl+Shift+T in Phase 0.5 — that
      //  shortcut now reopens the last-closed tab, matching browser
      //  convention. Use the "Open in CLI" pill button instead.)

      // ─── primary + Shift + V — Voice capture ───
      if (primary && shift && key === 'v') {
        e.preventDefault()
        onVoiceCapture()
        return
      }

      // ─── primary + L — Focus input field ───
      if (primary && !shift && !ctrlExtra && key === 'l') {
        e.preventDefault()
        onFocusInput()
        return
      }
    },
    [onAttachFile, onScreenshot, onFocusInput, onOpenSlashMenu, onVoiceCapture],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
