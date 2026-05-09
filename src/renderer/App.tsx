import React, { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Paperclip, Camera, HeadCircuit, Stack } from '@phosphor-icons/react'
import { TabStrip } from './components/TabStrip'
import { InputBar, type InputBarHandle } from './components/InputBar'
import { MarketplacePanel } from './components/MarketplacePanel'
import { SearchPanel } from './components/SearchPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { BtwBubble } from './components/BtwBubble'
import { CommandPalette } from './components/CommandPalette'
import { PopoverLayerProvider } from './components/PopoverLayer'
import { useClaudeEvents } from './hooks/useClaudeEvents'
import { useHealthReconciliation } from './hooks/useHealthReconciliation'
import { useSearchEvents } from './hooks/useSearchEvents'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useWindowDrag } from './hooks/useWindowDrag'
import { useSessionStore } from './stores/sessionStore'
import { useColors, useThemeStore, spacing } from './theme'
import { IS_WIN } from './utils/shortcuts'

const TRANSITION = { duration: 0.26, ease: [0.4, 0, 0.1, 1] as const }

/**
 * Hub-toggle circle that floats to the right of the input pill,
 * mirroring the screenshot / attach / skills circles on the left. Same
 * visual language as the left stack so they read as a pair flanking
 * the input. Active styling (accent color + filled bg) when the hub is
 * open.
 */
function HubCircleButton() {
  const colors = useColors()
  const [hostVisible, setHostVisible] = useState(false)

  useEffect(() => {
    window.clui.getHostVisibility().then(setHostVisible).catch(() => {})
    const off = window.clui.onHostWindowVisibility((v) => setHostVisible(v))
    return off
  }, [])

  return (
    <button
      className="stack-btn glass-surface"
      data-clui-no-drag="true"
      title={hostVisible ? 'Close hub' : 'Open hub'}
      onClick={() => window.clui.toggleHostWindow()}
      style={hostVisible ? { color: colors.accent } : undefined}
    >
      <Stack size={17} />
    </button>
  )
}

export default function App() {
  useClaudeEvents()
  useHealthReconciliation()
  useSearchEvents()

  const activeTabStatus = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.status)
  const addAttachments = useSessionStore((s) => s.addAttachments)
  const colors = useColors()
  const setSystemTheme = useThemeStore((s) => s.setSystemTheme)
  const expandedUI = useThemeStore((s) => s.expandedUI)

  // ─── Theme initialization ───
  useEffect(() => {
    // Get initial OS theme — setSystemTheme respects themeMode (system/light/dark)
    window.clui.getTheme().then(({ isDark }) => {
      setSystemTheme(isDark)
    }).catch(() => {})

    // Listen for OS theme changes
    const unsubTheme = window.clui.onThemeChange((isDark) => {
      setSystemTheme(isDark)
    })

    // Listen for auto-update events
    const unsubUpdateAvail = window.clui.onUpdateAvailable(({ version }) => {
      useThemeStore.getState().setUpdateAvailable(version)
    })
    const unsubUpdateReady = window.clui.onUpdateDownloaded(({ version }) => {
      useThemeStore.getState().setUpdateReady(version)
    })

    return () => {
      unsubTheme()
      unsubUpdateAvail()
      unsubUpdateReady()
    }
  }, [setSystemTheme])

  useEffect(() => {
    useSessionStore.getState().initStaticInfo().then(() => {
      const homeDir = useSessionStore.getState().staticInfo?.homePath || '~'
      const tab = useSessionStore.getState().tabs[0]
      if (tab) {
        // Set working directory to home by default (user hasn't chosen yet)
        useSessionStore.setState((s) => ({
          tabs: s.tabs.map((t, i) => (i === 0 ? { ...t, workingDirectory: homeDir, hasChosenDirectory: false } : t)),
        }))
        window.clui.createTab().then(({ tabId }) => {
          useSessionStore.setState((s) => ({
            tabs: s.tabs.map((t, i) => (i === 0 ? { ...t, id: tabId } : t)),
            activeTabId: tabId,
          }))
        }).catch(() => {})
      }
    })
  }, [])

  // OS-level click-through (RAF-throttled to avoid per-pixel IPC)
  useEffect(() => {
    if (!window.clui?.setIgnoreMouseEvents) return
    let lastIgnored: boolean | null = null

    const onMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const isUI = !!(el && el.closest('[data-clui-ui]'))
      const shouldIgnore = !isUI
      if (shouldIgnore !== lastIgnored) {
        lastIgnored = shouldIgnore
        if (shouldIgnore) {
          window.clui.setIgnoreMouseEvents(true, { forward: true })
        } else {
          window.clui.setIgnoreMouseEvents(false)
        }
      }
    }

    const onMouseLeave = () => {
      if (lastIgnored !== true) {
        lastIgnored = true
        window.clui.setIgnoreMouseEvents(true, { forward: true })
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  const isExpanded = useSessionStore((s) => s.isExpanded)
  const marketplaceOpen = useSessionStore((s) => s.marketplaceOpen)
  const searchPanelOpen = useSessionStore((s) => s.searchPanelOpen)
  const settingsPanelOpen = useSessionStore((s) => s.settingsPanelOpen)
  const isRunning = activeTabStatus === 'running' || activeTabStatus === 'connecting'
  const inputBarRef = useRef<InputBarHandle>(null)

  // Phase 0.2 — drag-from-anywhere on the pill. Two refs because the pill is
  // visually two stacked surfaces (the conversation shell and the input row);
  // both should be drag-active. Children opt out via data-clui-no-drag="true".
  const shellDragRef = useRef<HTMLDivElement>(null)
  const inputDragRef = useRef<HTMLDivElement>(null)
  useWindowDrag(shellDragRef)
  useWindowDrag(inputDragRef)

  // Layout dimensions — expandedUI widens and heightens the panel
  const contentWidth = expandedUI ? 700 : spacing.contentWidth
  const cardExpandedWidth = expandedUI ? 700 : 460
  const cardCollapsedWidth = expandedUI ? 670 : 430
  const cardCollapsedMargin = expandedUI ? 15 : 15
  const bodyMaxHeight = expandedUI ? 520 : 400

  const handleScreenshot = useCallback(
    async (mode?: 'region' | 'fullscreen') => {
      const result = await window.clui.takeScreenshot(mode)
      if (!result) return
      addAttachments([result])
    },
    [addAttachments],
  )

  const handleAttachFile = useCallback(async () => {
    const files = await window.clui.attachFiles()
    if (!files || files.length === 0) return
    addAttachments(files)
  }, [addAttachments])

  useKeyboardShortcuts({
    onAttachFile: handleAttachFile,
    onScreenshot: handleScreenshot,
    onFocusInput: useCallback(() => inputBarRef.current?.focus(), []),
    onOpenSlashMenu: useCallback(() => inputBarRef.current?.openSlashMenu(), []),
    onVoiceCapture: useCallback(() => inputBarRef.current?.toggleVoice(), []),
  })

  // Listen for global per-tab hotkeys (Ctrl+Alt+1..9 / Cmd+Alt+1..9). Main process
  // shows the pill and broadcasts the tab index; we map index → tab ID and
  // delegate to selectTab() so all the existing read/expand behavior fires.
  useEffect(() => {
    const off = window.clui.onActivateTabByIndex((index: number) => {
      const { tabs, selectTab } = useSessionStore.getState()
      if (index >= 0 && index < tabs.length) {
        selectTab(tabs[index].id)
      }
    })
    return off
  }, [])

  return (
    <PopoverLayerProvider>
      <div className="flex flex-col justify-end h-full" style={{ background: 'transparent' }}>

        {/* ─── 460px content column, centered. Circles overflow left. ─── */}
        <div style={{ width: contentWidth, position: 'relative', margin: '0 auto', transition: 'width 0.26s cubic-bezier(0.4, 0, 0.1, 1)', transform: 'translateY(var(--clui-card-y, 0px))' }}>

          <AnimatePresence initial={false}>
            {marketplaceOpen && (
              <div
                data-clui-ui
                style={{
                  width: 720,
                  maxWidth: 720,
                  marginLeft: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 14,
                  position: 'relative',
                  zIndex: 30,
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.985 }}
                  transition={TRANSITION}
                >
                  <div
                    data-clui-ui
                    className="glass-surface overflow-hidden no-drag"
                    style={{
                      borderRadius: 24,
                      maxHeight: 470,
                    }}
                  >
                    <MarketplacePanel />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {searchPanelOpen && (
              <div
                data-clui-ui
                style={{
                  width: 720,
                  maxWidth: 720,
                  marginLeft: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 14,
                  position: 'relative',
                  zIndex: 30,
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.985 }}
                  transition={TRANSITION}
                >
                  <div
                    data-clui-ui
                    className="glass-surface overflow-hidden no-drag"
                    style={{
                      borderRadius: 24,
                      maxHeight: 470,
                    }}
                  >
                    <SearchPanel />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Phase F — Settings panel. Same anchored-overlay pattern as
              MarketplacePanel / SearchPanel. */}
          <AnimatePresence initial={false}>
            {settingsPanelOpen && (
              <div
                data-clui-ui
                style={{
                  width: 640,
                  maxWidth: 640,
                  marginLeft: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 14,
                  position: 'relative',
                  zIndex: 30,
                }}
              >
                <SettingsPanel />
              </div>
            )}
          </AnimatePresence>

          {/*
            ─── Tabs / message shell ───
            This always remains the chat shell. The marketplace is a separate
            panel rendered above it, never inside it.
          */}
          {/*
            Pill toolbar shell — fixed-size, no expand/minimize. The
            ConversationView used to live in this shell behind an
            expandedUI flag; with cards-as-windows (stage 3) coming, the
            conversation lives in its own card window. The pill is now
            just the always-visible control row + input below.
          */}
          <motion.div
            ref={shellDragRef as unknown as React.Ref<HTMLDivElement>}
            data-clui-ui
            data-clui-drag="true"
            className="overflow-hidden flex flex-col no-drag"
            style={{
              width: cardCollapsedWidth,
              marginBottom: -14,
              marginLeft: cardCollapsedMargin,
              marginRight: cardCollapsedMargin,
              background: colors.containerBgCollapsed,
              borderColor: colors.containerBorder,
              boxShadow: colors.cardShadowCollapsed,
              borderWidth: 1,
              borderStyle: 'solid',
              borderRadius: 20,
              position: 'relative',
              zIndex: 10,
            }}
          >
            <TabStrip />
          </motion.div>

          {/* ─── BTW side question bubble ─── */}
          <BtwBubble />

          {/* ─── Input row — circles float outside left ─── */}
          {/* marginBottom: shadow buffer so the glass-surface drop shadow isn't clipped at the native window edge */}
          <div data-clui-ui className="relative" style={{ minHeight: 46, zIndex: 15, marginBottom: 10 }}>
            {/* Stacked circle buttons — expand on hover */}
            <div
              data-clui-ui
              className="circles-out"
            >
              <div className="btn-stack">
                {/* btn-1: Attach (front, rightmost) */}
                <button
                  className="stack-btn stack-btn-1 glass-surface"
                  title="Attach file"
                  onClick={handleAttachFile}
                  disabled={isRunning}
                >
                  <Paperclip size={17} />
                </button>
                {/* btn-2: Screenshot — region by default on Windows; Shift+Click for full screen.
                    On macOS the OS already gives an interactive selection via screencapture -i. */}
                <button
                  className="stack-btn stack-btn-2 glass-surface"
                  title={IS_WIN ? 'Snip a region · Shift+Click: full screen' : 'Take screenshot'}
                  onClick={(e) => handleScreenshot(IS_WIN && e.shiftKey ? 'fullscreen' : undefined)}
                  disabled={isRunning}
                >
                  <Camera size={17} />
                </button>
                {/* btn-3: Skills (back, leftmost) */}
                <button
                  className="stack-btn stack-btn-3 glass-surface"
                  title="Skills & Plugins"
                  onClick={() => useSessionStore.getState().toggleMarketplace()}
                  disabled={isRunning}
                >
                  <HeadCircuit size={17} />
                </button>
              </div>
            </div>

            {/* Hub-toggle floating circle on the RIGHT — mirrors the
                screenshot/attach/skills circles on the left. Lives outside
                the input pill so the pill chrome stays uncluttered. */}
            <div data-clui-ui className="circles-out-right">
              <HubCircleButton />
            </div>

            {/* Input pill — chrome around the InputBar is drag-active. The
                InputBar itself contains a textarea + buttons that opt out via
                the useWindowDrag bail-out (textareas / buttons / inputs are
                excluded from the drag walk). */}
            <div
              ref={inputDragRef}
              data-clui-ui
              data-clui-drag="true"
              className="glass-surface w-full"
              style={{ minHeight: 50, borderRadius: 25, padding: '0 6px 0 16px', background: colors.inputPillBg }}
            >
              <InputBar ref={inputBarRef} />
            </div>
          </div>

        </div>
      </div>
      {/* Phase 0.5b — Command Palette (Ctrl+Space). Rendered via portal so it
          floats above the pill regardless of expanded/collapsed state. */}
      <CommandPalette />
    </PopoverLayerProvider>
  )
}
