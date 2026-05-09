import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../stores/sessionStore'
import { useColors, useThemeStore, motion as motionTokens, type ThemeMode } from '../theme'
import { openInPreferredTerminal } from '../utils/terminal'

/**
 * CommandPalette — Phase 0.5b
 *
 * Fuzzy-find palette for any overlay action. Opens via Ctrl+Space (also
 * Ctrl+K — same handler since the existing K binding clears conversation;
 * we kept K for clear, Ctrl+Space is the dedicated palette key).
 *
 * Actions are pure data-driven — every entry has an id, label, hint
 * (description / hotkey), and run() function. To add a new action: append to
 * `useActions()`. The palette is the single source of truth for "what can the
 * overlay do" — future SettingsPanel keymap UI will read from this list too.
 */

interface PaletteAction {
  id: string
  label: string
  hint?: string
  group?: string
  run: () => void
}

/** Lightweight fuzzy match: returns score+highlights, or null if no match. */
function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  // Exact substring is best
  const idx = t.indexOf(q)
  if (idx >= 0) return 1000 - idx // earlier match scores higher
  // Subsequence match: every query char appears in order
  let ti = 0
  let qi = 0
  let lastMatch = -1
  let scattered = 0
  while (qi < q.length && ti < t.length) {
    if (q.charCodeAt(qi) === t.charCodeAt(ti)) {
      if (lastMatch >= 0) scattered += ti - lastMatch - 1
      lastMatch = ti
      qi++
    }
    ti++
  }
  if (qi < q.length) return null
  return 500 - scattered
}

function useActions(closePalette: () => void): PaletteAction[] {
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const themeMode = useThemeStore((s) => s.themeMode)
  const setThemeMode = useThemeStore((s) => s.setThemeMode)
  const soundEnabled = useThemeStore((s) => s.soundEnabled)
  const setSoundEnabled = useThemeStore((s) => s.setSoundEnabled)
  const expandedUI = useThemeStore((s) => s.expandedUI)
  const setExpandedUI = useThemeStore((s) => s.setExpandedUI)
  const permissionMode = useSessionStore((s) => s.permissionMode)
  const preferredModel = useSessionStore((s) => s.preferredModel)
  const availableModels = useSessionStore((s) => s.availableModels)

  return useMemo(() => {
    const actions: PaletteAction[] = []
    const wrap = (run: () => void) => () => {
      try { run() } finally { closePalette() }
    }

    // ─── Tabs ───
    actions.push({
      id: 'tab-new-current-dir',
      label: 'New tab (current directory)',
      hint: 'Ctrl+T',
      group: 'Tabs',
      run: wrap(() => useSessionStore.getState().createTabInSameFolder()),
    })
    actions.push({
      id: 'tab-new-default',
      label: 'New tab (default directory)',
      hint: 'Ctrl+N',
      group: 'Tabs',
      run: wrap(() => useSessionStore.getState().createTab()),
    })
    actions.push({
      id: 'tab-close',
      label: 'Close current tab',
      hint: 'Ctrl+W',
      group: 'Tabs',
      run: wrap(() => useSessionStore.getState().closeTab(activeTabId)),
    })
    // Switch-to-tab entries — one per existing tab
    tabs.forEach((tab, i) => {
      const title = tab.title?.trim() || `Tab ${i + 1}`
      const cwd = tab.workingDirectory ? ` · ${tab.workingDirectory.split(/[\\/]/).slice(-1)[0]}` : ''
      actions.push({
        id: `tab-switch-${tab.id}`,
        label: `Switch to: ${title}`,
        hint: i < 9 ? `Ctrl+${i + 1}${cwd}` : cwd,
        group: 'Tabs',
        run: wrap(() => useSessionStore.getState().selectTab(tab.id)),
      })
    })

    // ─── Run control ───
    actions.push({
      id: 'run-stop',
      label: 'Stop active run',
      hint: 'Ctrl+.',
      group: 'Run',
      run: wrap(() => useSessionStore.getState().stopActiveRun()),
    })
    actions.push({
      id: 'run-clear',
      label: 'Clear conversation',
      hint: 'Ctrl+K',
      group: 'Run',
      run: wrap(() => {
        useSessionStore.getState().clearTab()
        useSessionStore.getState().addSystemMessage('Conversation cleared.')
      }),
    })
    actions.push({
      id: 'run-copy-last',
      label: 'Copy last response',
      hint: 'Ctrl+Shift+C',
      group: 'Run',
      run: wrap(() => useSessionStore.getState().copyLastResponse()),
    })

    // ─── Permission mode ───
    const otherMode = permissionMode === 'ask' ? 'auto' : 'ask'
    actions.push({
      id: 'mode-cycle',
      label: `Permission mode: switch to ${otherMode}`,
      hint: `Ctrl+Tab · current: ${permissionMode}`,
      group: 'Mode',
      run: wrap(() => useSessionStore.getState().setPermissionMode(otherMode)),
    })

    // ─── Models ───
    availableModels.forEach((m) => {
      const active = preferredModel === m.id
      actions.push({
        id: `model-${m.id}`,
        label: `${active ? '✓ ' : ''}Model: ${m.label}`,
        hint: m.kind === 'alias' ? `${m.id} · auto-tracks latest` : m.id,
        group: 'Model',
        run: wrap(() => useSessionStore.getState().setPreferredModel(m.id)),
      })
    })

    // ─── View ───
    actions.push({
      id: 'view-toggle-expanded',
      label: expandedUI ? 'Collapse expanded view' : 'Expand view',
      hint: 'Ctrl+E',
      group: 'View',
      run: wrap(() => setExpandedUI(!expandedUI)),
    })
    actions.push({
      id: 'view-marketplace',
      label: 'Open Skills & Plugins',
      hint: 'Ctrl+Shift+M',
      group: 'View',
      run: wrap(() => useSessionStore.getState().toggleMarketplace()),
    })
    actions.push({
      id: 'view-search',
      label: 'Open Search',
      hint: 'Ctrl+Shift+F',
      group: 'View',
      run: wrap(() => useSessionStore.getState().toggleSearchPanel()),
    })
    actions.push({
      id: 'view-history',
      label: 'Open Session History',
      hint: 'Ctrl+Shift+H',
      group: 'View',
      run: wrap(() => useSessionStore.getState().toggleHistoryPicker()),
    })
    actions.push({
      id: 'view-settings',
      label: 'Open Settings',
      hint: 'theme · sound · claude config',
      group: 'View',
      run: wrap(() => useSessionStore.getState().toggleSettingsPanel()),
    })

    // ─── Theme ───
    const themes: Array<{ id: ThemeMode; label: string }> = [
      { id: 'dark', label: 'Dark · near-black' },
      { id: 'dark-warm', label: 'Dark · warm paper (sepia)' },
      { id: 'light', label: 'Light · warm paper' },
      { id: 'system', label: 'Follow system' },
    ]
    themes.forEach((t) => {
      const active = themeMode === t.id
      actions.push({
        id: `theme-${t.id}`,
        label: `${active ? '✓ ' : ''}Theme: ${t.label}`,
        group: 'Theme',
        run: wrap(() => setThemeMode(t.id)),
      })
    })

    // ─── Settings ───
    actions.push({
      id: 'sound-toggle',
      label: soundEnabled ? 'Disable sound effects' : 'Enable sound effects',
      group: 'Settings',
      run: wrap(() => setSoundEnabled(!soundEnabled)),
    })

    // ─── Terminal ───
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (activeTab) {
      actions.push({
        id: 'terminal-open',
        label: 'Open in Terminal',
        hint: 'Ctrl+Shift+T',
        group: 'Terminal',
        run: wrap(() => openInPreferredTerminal(activeTab.claudeSessionId, activeTab.workingDirectory)),
      })
    }

    return actions
  }, [tabs, activeTabId, themeMode, soundEnabled, expandedUI, permissionMode, preferredModel, availableModels, setThemeMode, setSoundEnabled, setExpandedUI, closePalette])
}

export function CommandPalette() {
  const open = useSessionStore((s) => s.commandPaletteOpen)
  const setOpen = useSessionStore((s) => s.setCommandPaletteOpen)
  const colors = useColors()

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [setOpen])
  const actions = useActions(close)

  // Reset query + selection on each open; focus input
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      // Focus after the open animation begins so the input is in the DOM
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Filter + rank
  const filtered = useMemo(() => {
    if (!query.trim()) {
      return actions.map((a) => ({ action: a, score: 0 }))
    }
    const q = query.trim()
    const scored: Array<{ action: PaletteAction; score: number }> = []
    for (const action of actions) {
      const labelScore = fuzzyScore(q, action.label)
      const groupScore = action.group ? fuzzyScore(q, action.group) : null
      const hintScore = action.hint ? fuzzyScore(q, action.hint) : null
      const best = Math.max(
        labelScore ?? -Infinity,
        groupScore !== null ? groupScore - 100 : -Infinity,
        hintScore !== null ? hintScore - 200 : -Infinity,
      )
      if (best > -Infinity) scored.push({ action, score: best })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored
  }, [actions, query])

  // Clamp selection on filter change
  useEffect(() => {
    if (selected >= filtered.length) setSelected(Math.max(0, filtered.length - 1))
  }, [filtered, selected])

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-palette-idx="${selected}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(filtered.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = filtered[selected]?.action
      if (target) target.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        data-clui-ui
        data-clui-no-drag="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={motionTokens.state}
        onMouseDown={(e) => {
          // Click on backdrop closes
          if (e.target === e.currentTarget) close()
        }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.32)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '12vh',
          zIndex: 100,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4 }}
          transition={motionTokens.reveal}
          style={{
            width: 540,
            maxWidth: 'calc(100vw - 48px)',
            maxHeight: 'min(70vh, 480px)',
            display: 'flex',
            flexDirection: 'column',
            background: colors.popoverBg,
            border: `1px solid ${colors.popoverBorder}`,
            borderRadius: 'var(--clui-radius-lg, 14px)',
            boxShadow: colors.popoverShadow,
            overflow: 'hidden',
          }}
        >
          {/* Search input */}
          <div
            style={{
              padding: '12px 14px',
              borderBottom: `1px solid ${colors.containerBorder}`,
            }}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search commands…"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: colors.textPrimary,
                fontSize: 14,
                fontWeight: 'var(--clui-font-weight-body, 450)' as unknown as number,
                letterSpacing: 'var(--clui-letter-spacing-body, -0.005em)',
              }}
            />
          </div>

          {/* Results list */}
          <div
            ref={listRef}
            style={{
              overflowY: 'auto',
              padding: '6px 0',
              flex: 1,
            }}
          >
            {filtered.length === 0 && (
              <div style={{ padding: '20px 14px', color: colors.textTertiary, fontSize: 12, textAlign: 'center' }}>
                No matching commands
              </div>
            )}
            {filtered.map(({ action }, i) => {
              const isSelected = i === selected
              return (
                <div
                  key={action.id}
                  data-palette-idx={i}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => action.run()}
                  style={{
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    cursor: 'pointer',
                    background: isSelected ? colors.surfaceHover : 'transparent',
                    transition: `background var(--clui-state-duration, 120ms) var(--clui-ease-out, ease-out)`,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div
                      style={{
                        color: colors.textPrimary,
                        fontSize: 13,
                        fontWeight: 'var(--clui-font-weight-body, 450)' as unknown as number,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {action.label}
                    </div>
                    {action.group && (
                      <div style={{ color: colors.textTertiary, fontSize: 10, marginTop: 1 }}>
                        {action.group}
                      </div>
                    )}
                  </div>
                  {action.hint && (
                    <div
                      style={{
                        color: colors.textTertiary,
                        fontSize: 11,
                        flexShrink: 0,
                        fontFeatureSettings: '"tnum"',
                        textAlign: 'right',
                      }}
                    >
                      {action.hint}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer hint */}
          <div
            style={{
              padding: '8px 14px',
              borderTop: `1px solid ${colors.containerBorder}`,
              fontSize: 10,
              color: colors.textTertiary,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>↑↓ navigate · Enter run · Esc close</span>
            <span>{filtered.length} command{filtered.length === 1 ? '' : 's'}</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
