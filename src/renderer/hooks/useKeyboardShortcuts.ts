import { useEffect, useCallback } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useThemeStore } from '../theme'
import { BINDINGS, matchesBinding } from '../keybindings'
import type { PermissionModeKind } from '../../shared/types'

/**
 * Centralized keyboard-shortcut handler for clui — Phase 0.5b.
 *
 * Most bindings come from the data-driven registry in `keybindings.ts` and
 * are user-rebindable via SettingsPanel → Shortcuts. The handler iterates
 * the registry, matches against per-id user overrides (or each binding's
 * default), and dispatches.
 *
 * The bindings that stay hard-coded:
 *   - Esc       — cascading-dismiss logic doesn't fit a generic "run X" model
 *   - Space     — must be silenced when an editable element has focus
 *   - Ctrl+Tab  — directional cycling (Tab vs Shift+Tab) needs branching
 *
 * IS_MAC normalisation: on macOS, holding Cmd produces lowercase keys even
 * with Shift, so e.key.toLowerCase() is used for the few hard-coded checks.
 * The registry matcher lives in keybindings.ts and handles platform quirks
 * the same way.
 */

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

  // 2. Close command palette
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

  // 5. Close history picker
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

      const primary = IS_MAC ? e.metaKey : e.ctrlKey
      const ctrlExtra = IS_MAC ? e.ctrlKey : false
      const tabCycle = e.ctrlKey
      const shift = e.shiftKey
      const key = e.key.toLowerCase()

      const target = e.target as HTMLElement | null
      const isEditable =
        !!target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        )

      // ─── Locked: Esc cascade ───
      if (key === 'escape' && !primary && !shift) {
        const handled = smartEsc()
        if (handled) {
          e.preventDefault()
          return
        }
      }

      // ─── Locked: Space (focus input when no editable has focus) ───
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

      // ─── Locked: Ctrl+Tab / Ctrl+Shift+Tab — cycle permission mode ───
      if (tabCycle && key === 'tab') {
        e.preventDefault()
        const current = useSessionStore.getState().permissionMode
        const next = cyclePermissionMode(current, !shift)
        useSessionStore.getState().setPermissionMode(next)
        useSessionStore.getState().addSystemMessage(`Permission mode: ${next}`)
        return
      }

      // ─── Data-driven dispatch via registry ───
      // Iterate every binding, look up the user's override (or fall back to
      // the binding's default), test, dispatch first match.
      const overrides = useThemeStore.getState().keybindings
      const ctx = { onAttachFile, onScreenshot, onFocusInput, onOpenSlashMenu, onVoiceCapture }
      for (const binding of BINDINGS) {
        const active = overrides[binding.id] || binding.defaultKey
        if (!active) continue // user explicitly cleared this binding
        if (matchesBinding(e, active)) {
          e.preventDefault()
          binding.run(ctx)
          return
        }
      }
    },
    [onAttachFile, onScreenshot, onFocusInput, onOpenSlashMenu, onVoiceCapture],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
