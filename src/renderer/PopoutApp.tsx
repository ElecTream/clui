import React, { useEffect, useMemo } from 'react'
import { useColors, useThemeStore } from './theme'
import { ConversationView } from './components/ConversationView'
import { PopoverLayerProvider } from './components/PopoverLayer'
import { useClaudeEvents } from './hooks/useClaudeEvents'
import { useReceiveTabsSnapshot } from './hooks/useTabsSync'
import { useSessionStore } from './stores/sessionStore'
import type { TabState } from '../shared/types'
import { ArrowsOutCardinal, X } from '@phosphor-icons/react'

/**
 * PopoutApp — viewport for a single conversation.
 *
 * The pop-out's role is purely projection: state lives in main, the
 * pill / host edit it, this window streams the same events and renders
 * one tab's worth of UI. Closing this window doesn't affect the tab —
 * main keeps it running, the hub's Chat view still shows it, and the
 * pill's tab strip is unchanged.
 *
 * Pop-outs are forced into a "single-tab" view: the URL fixes which
 * conversation is shown, regardless of what the user activates in the
 * pill. This is the trade-off that makes the viewport pattern usable —
 * if the pop-out followed activeTab, you could never have pill + pop-out
 * showing different chats simultaneously, which is the whole point.
 */
export default function PopoutApp() {
  // Same event/snapshot subscriptions every other window has — these
  // populate `tabs[]` and stream live messages into our local store.
  useClaudeEvents()
  useReceiveTabsSnapshot()

  const colors = useColors()
  const setSystemTheme = useThemeStore((s) => s.setSystemTheme)

  useEffect(() => {
    window.clui.getTheme().then(({ isDark }) => setSystemTheme(isDark)).catch(() => {})
    const off = window.clui.onThemeChange((isDark) => setSystemTheme(isDark))
    return off
  }, [setSystemTheme])

  // Resolve the URL-passed tabId on mount. Override our local activeTabId
  // so ConversationView (which reads from the store) renders that tab.
  const lockedTabId = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('tabId') ?? ''
  }, [])

  const tab = useSessionStore((s) => s.tabs.find((t) => t.id === lockedTabId))
  const setActiveTabId = useSessionStore((s) => s.selectTab)

  useEffect(() => {
    // Lock our window's activeTabId to the URL-passed id whenever the
    // tabs list arrives or changes. The pill / host can switch their own
    // active tab freely; this window is pinned.
    if (lockedTabId && tab) {
      setActiveTabId(lockedTabId)
    }
  }, [lockedTabId, tab, setActiveTabId])

  // ─── First-load history replay ───
  // The popout's local store starts empty; the live event stream only
  // covers what fires *after* this window opens. To get the conversation
  // up to the current point we ask the pill for a one-shot replay of the
  // tab including its message history, then merge that into our store.
  useEffect(() => {
    if (!lockedTabId) return
    let cancelled = false
    void window.clui.requestTabReplay?.(lockedTabId).then((reply) => {
      if (cancelled || !reply) return
      const replayed = reply as TabState
      useSessionStore.setState((s) => {
        const idx = s.tabs.findIndex((t) => t.id === lockedTabId)
        if (idx === -1) {
          return { tabs: [...s.tabs, replayed], activeTabId: lockedTabId }
        }
        // Merge: trust the replay for messages + session metadata; keep
        // our id alignment. The receiver hook may overwrite the metadata
        // bits later via tabs-snapshot — that's fine.
        const existing = s.tabs[idx]
        const merged = { ...existing, ...replayed, id: existing.id }
        const next = [...s.tabs]
        next[idx] = merged
        return { tabs: next, activeTabId: lockedTabId }
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [lockedTabId])

  // ─── Loading / missing-tab states ───
  if (!lockedTabId) {
    return (
      <PopoverLayerProvider>
        <ErrorShell colors={colors}>This pop-out has no tab id.</ErrorShell>
      </PopoverLayerProvider>
    )
  }
  if (!tab) {
    return (
      <PopoverLayerProvider>
        <Shell colors={colors} title="Loading…">
          <div style={{ padding: 24, color: colors.textTertiary, fontSize: 12 }}>
            Waiting for tab data… (if this stays here, the tab may have been closed.)
          </div>
        </Shell>
      </PopoverLayerProvider>
    )
  }

  return (
    <PopoverLayerProvider>
      <Shell colors={colors} title={tab.title || 'Untitled'}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ConversationView />
        </div>
      </Shell>
    </PopoverLayerProvider>
  )
}

function Shell({
  colors,
  title,
  children,
}: {
  colors: ReturnType<typeof useColors>
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      data-clui-drag="true"
      style={{
        width: '100vw',
        height: '100vh',
        background: colors.containerBg,
        color: colors.textPrimary,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          height: 32,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 var(--clui-space-3)',
          borderBottom: `1px solid ${colors.containerBorder}`,
          fontSize: 11,
          color: colors.textTertiary,
          letterSpacing: '0.02em',
        }}
      >
        <ArrowsOutCardinal size={11} weight="bold" />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        <button
          data-clui-no-drag="true"
          onClick={() => window.clui.closePopout?.().catch(() => {})}
          title="Close pop-out"
          className="clui-icon-btn"
          style={{ width: 24, height: 24 }}
        >
          <X size={12} />
        </button>
      </header>
      {children}
    </div>
  )
}

function ErrorShell({
  colors,
  children,
}: {
  colors: ReturnType<typeof useColors>
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: colors.containerBg,
        color: colors.textTertiary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        padding: 24,
      }}
    >
      {children}
    </div>
  )
}
