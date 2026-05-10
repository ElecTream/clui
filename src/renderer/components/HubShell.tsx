import React, { useEffect, useState } from 'react'
import {
  House,
  ChatCircleText,
  ClockClockwise,
  Storefront,
  GearSix,
  Plus,
  FolderOpen,
  GlobeHemisphereWest,
  ArrowsOutCardinal,
  ArrowLeft,
  X as XIcon,
} from '@phosphor-icons/react'
import type { TabState } from '../../shared/types'
import { useColors } from '../theme'
import { useSessionStore } from '../stores/sessionStore'
import { SettingsPanel } from './SettingsPanel'
import { MarketplacePanel } from './MarketplacePanel'
import { ConversationView } from './ConversationView'
import { PeerBrowser } from './PeerBrowser'
import type { SessionMeta } from '../../shared/types'
import { shortPath, timeAgo } from '../utils/format'

type HubView = 'chat' | 'home' | 'history' | 'marketplace' | 'peers' | 'settings'

export default function HubShell() {
  const colors = useColors()
  const [view, setView] = useState<HubView>('chat')

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        minHeight: 0,
        background: colors.containerBg,
      }}
    >
      <Sidebar view={view} setView={setView} />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: colors.containerBg,
        }}
      >
        {view === 'chat' && <ChatView />}
        {view === 'home' && <HomeView setView={setView} />}
        {view === 'history' && <HistoryView />}
        {view === 'marketplace' && <MarketplaceView />}
        {view === 'peers' && <PeerBrowser />}
        {view === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}

function Sidebar({
  view,
  setView,
}: {
  view: HubView
  setView: (v: HubView) => void
}) {
  const colors = useColors()
  return (
    <nav
      style={{
        width: 180,
        flexShrink: 0,
        borderRight: `1px solid ${colors.containerBorder}`,
        padding: 'var(--clui-space-2) var(--clui-space-2)',
        background: colors.surfacePrimary,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <NavItem
        active={view === 'chat'}
        onClick={() => setView('chat')}
        icon={<ChatCircleText size={14} />}
        label="Chat"
      />
      <NavItem
        active={view === 'home'}
        onClick={() => setView('home')}
        icon={<House size={14} />}
        label="Home"
      />
      <NavItem
        active={view === 'history'}
        onClick={() => setView('history')}
        icon={<ClockClockwise size={14} />}
        label="History"
      />
      <NavItem
        active={view === 'marketplace'}
        onClick={() => setView('marketplace')}
        icon={<Storefront size={14} />}
        label="Marketplace"
      />
      <NavItem
        active={view === 'peers'}
        onClick={() => setView('peers')}
        icon={<GlobeHemisphereWest size={14} />}
        label="Peers"
      />
      <NavItem
        active={view === 'settings'}
        onClick={() => setView('settings')}
        icon={<GearSix size={14} />}
        label="Settings"
      />
    </nav>
  )
}

function NavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  const colors = useColors()
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? colors.surfaceActive : 'transparent',
        color: active ? colors.textPrimary : colors.textSecondary,
        border: 'none',
        borderRadius: 'var(--clui-radius-sm, 6px)',
        padding: '8px 10px',
        fontSize: 12,
        fontWeight: active ? 500 : 400,
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        transition: 'background var(--clui-state-duration, 120ms) var(--clui-ease-out, ease-out)',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

/* ─── Chat ─── */

/**
 * Chat view — two modes:
 *
 * 1. Board (default): grid of cards, one per tab. New chat button on
 *    the toolbar starts a chat in a chosen directory, or in $HOME.
 *    Click a card → focus mode for that tab.
 * 2. Focus: full ConversationView for the selected card, with a back
 *    button to return to the board and a Pop-out button to spawn a
 *    dedicated window.
 *
 * The board reads from the host's local `tabs[]`, which is kept in sync
 * with the pill via Phase D's tabs-snapshot. Tab creation is round-tripped
 * through main → pill (the canonical owner) so a freshly-created tab
 * always lands in both stores.
 */
function ChatView() {
  const colors = useColors()
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const selectTab = useSessionStore((s) => s.selectTab)
  const closeTab = useSessionStore((s) => s.closeTab)
  // Local board ↔ focus mode. Independent of the pill's expanded state.
  const [focusedTabId, setFocusedTabId] = useState<string | null>(null)
  const focusedTab = tabs.find((t) => t.id === focusedTabId)

  // If we focus a tab, sync activeTabId so ConversationView renders it.
  useEffect(() => {
    if (focusedTabId && activeTabId !== focusedTabId) {
      selectTab(focusedTabId)
    }
  }, [focusedTabId, activeTabId, selectTab])

  // If the focused tab disappears (closed in pill), drop back to the board.
  useEffect(() => {
    if (focusedTabId && !tabs.some((t) => t.id === focusedTabId)) {
      setFocusedTabId(null)
    }
  }, [focusedTabId, tabs])

  if (focusedTab) {
    return <FocusedChat tab={focusedTab} onBack={() => setFocusedTabId(null)} />
  }

  return (
    <TabsBoard
      tabs={tabs}
      activeTabId={activeTabId}
      onOpen={(id) => setFocusedTabId(id)}
      onClose={(id) => closeTab(id)}
    />
  )
}

function TabsBoard({
  tabs,
  activeTabId,
  onOpen,
  onClose,
}: {
  tabs: TabState[]
  activeTabId: string | null
  onOpen: (tabId: string) => void
  onClose: (tabId: string) => void
}) {
  const colors = useColors()

  const onNewChatHere = async (): Promise<void> => {
    const result = await window.clui.requestCreateTab?.()
    if (result?.tabId) onOpen(result.tabId)
  }
  const onNewChatInDir = async (): Promise<void> => {
    const dir = await window.clui.selectDirectory()
    if (!dir) return
    const result = await window.clui.requestCreateTab?.(dir)
    if (result?.tabId) onOpen(result.tabId)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          flexShrink: 0,
          padding: 'var(--clui-space-3) var(--clui-space-4)',
          borderBottom: `1px solid ${colors.containerBorder}`,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--clui-space-2)',
          background: colors.containerBg,
        }}
      >
        <span style={{ flex: 1, color: colors.textPrimary, fontSize: 13, fontWeight: 500 }}>
          Chats {tabs.length > 0 && <span style={{ color: colors.textTertiary, fontWeight: 400 }}>· {tabs.length}</span>}
        </span>
        <ToolbarButton onClick={() => { void onNewChatHere() }} icon={<Plus size={11} />} label="New chat" />
        <ToolbarButton onClick={() => { void onNewChatInDir() }} icon={<FolderOpen size={11} />} label="In folder…" />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--clui-space-4)' }}>
        {tabs.length === 0 ? (
          <div style={{ color: colors.textTertiary, fontSize: 12, textAlign: 'center', padding: 'var(--clui-space-5)' }}>
            No chats yet. Click <strong>New chat</strong> or <strong>In folder…</strong> to start one.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 'var(--clui-space-3)',
            }}
          >
            {tabs.map((t) => (
              <TabCard
                key={t.id}
                tab={t}
                isActive={t.id === activeTabId}
                onOpen={() => onOpen(t.id)}
                onPopOut={() => { void window.clui.popoutTab?.(t.id).catch(() => {}) }}
                onClose={() => onClose(t.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TabCard({
  tab,
  isActive,
  onOpen,
  onPopOut,
  onClose,
}: {
  tab: TabState
  isActive: boolean
  onOpen: () => void
  onPopOut: () => void
  onClose: () => void
}) {
  const colors = useColors()
  const [hover, setHover] = useState(false)
  const lastMessage = tab.messages[tab.messages.length - 1]
  const preview = lastMessage
    ? extractPreview(lastMessage)
    : tab.hasChosenDirectory ? 'No messages yet — type to start.' : 'New chat'
  const statusInfo = describeStatus(tab.status)

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover || isActive ? colors.surfaceActive : colors.surfacePrimary,
        border: `1px solid ${isActive ? colors.accent : colors.containerBorder}`,
        borderRadius: 'var(--clui-radius-md, 10px)',
        padding: 'var(--clui-space-3) var(--clui-space-4)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative',
        transition: 'background var(--clui-state-duration, 120ms) var(--clui-ease-out, ease-out)',
        minHeight: 110,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            color: colors.textPrimary,
            fontSize: 13,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
        >
          {tab.title || 'Untitled'}
        </span>
        <span
          title={statusInfo.label}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: statusInfo.color(colors),
            flexShrink: 0,
            marginTop: 5,
          }}
        />
      </div>
      <div
        style={{
          color: colors.textTertiary,
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <FolderOpen size={11} />
        {shortPath(tab.workingDirectory)}
      </div>
      <div
        style={{
          color: colors.textSecondary,
          fontSize: 11,
          lineHeight: 1.4,
          flex: 1,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {preview}
      </div>
      {hover && (
        <div
          style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}
          onClick={(e) => e.stopPropagation()}
        >
          <CardIconButton
            onClick={onPopOut}
            title="Pop into its own window"
            icon={<ArrowsOutCardinal size={11} />}
          />
          <CardIconButton
            onClick={onClose}
            title="Close chat"
            icon={<XIcon size={11} />}
          />
        </div>
      )}
    </div>
  )
}

function CardIconButton({
  onClick,
  title,
  icon,
}: {
  onClick: () => void
  title: string
  icon: React.ReactNode
}) {
  const colors = useColors()
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: colors.surfacePrimary,
        border: `1px solid ${colors.containerBorder}`,
        color: colors.textTertiary,
        cursor: 'pointer',
        padding: 3,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {icon}
    </button>
  )
}

function ToolbarButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  const colors = useColors()
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? colors.surfaceActive : colors.surfacePrimary,
        border: `1px solid ${colors.containerBorder}`,
        color: colors.textPrimary,
        cursor: 'pointer',
        padding: '5px 10px',
        borderRadius: 'var(--clui-radius-sm, 6px)',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {icon}
      {label}
    </button>
  )
}

function FocusedChat({ tab, onBack }: { tab: TabState; onBack: () => void }) {
  const colors = useColors()
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: colors.containerBg,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 var(--clui-space-3)',
          borderBottom: `1px solid ${colors.containerBorder}`,
        }}
      >
        <button
          onClick={onBack}
          title="Back to chats"
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.textTertiary,
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: 'var(--clui-radius-sm, 6px)',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <ArrowLeft size={11} />
          Chats
        </button>
        <span
          style={{
            color: colors.textPrimary,
            fontSize: 12,
            fontWeight: 500,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {tab.title || 'Untitled'}
        </span>
        <button
          onClick={() => { void window.clui.popoutTab?.(tab.id).catch(() => {}) }}
          title="Pop this chat into its own window"
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.textTertiary,
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: 'var(--clui-radius-sm, 6px)',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <ArrowsOutCardinal size={11} />
          Pop out
        </button>
      </div>
      <ConversationView />
    </div>
  )
}

function describeStatus(status: TabState['status']): {
  label: string
  color: (c: ReturnType<typeof useColors>) => string
} {
  switch (status) {
    case 'running':
      return { label: 'Running', color: (c) => c.statusRunning }
    case 'connecting':
      return { label: 'Connecting', color: (c) => c.textTertiary }
    case 'failed':
      return { label: 'Failed', color: (c) => c.statusError }
    case 'background':
      return { label: 'Running in background', color: (c) => c.statusRunning }
    case 'completed':
    case 'dead':
    case 'idle':
    default:
      return { label: 'Idle', color: (c) => c.textTertiary }
  }
}

function extractPreview(message: TabState['messages'][number]): string {
  const m = message as { content?: unknown; text?: unknown; type?: unknown }
  const direct = typeof m.text === 'string' ? m.text : null
  if (direct) return collapse(direct)
  if (Array.isArray(m.content)) {
    for (const part of m.content as Array<{ type?: string; text?: string }>) {
      if (part?.type === 'text' && typeof part.text === 'string') return collapse(part.text)
    }
  }
  if (typeof m.content === 'string') return collapse(m.content)
  return collapse(`(${String(m.type ?? 'message')})`)
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, 200)
}

/* ─── Home ─── */

function HomeView({ setView }: { setView: (v: HubView) => void }) {
  const colors = useColors()
  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: 'var(--clui-space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--clui-space-5)',
      }}
    >
      <div>
        <div style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 600 }}>
          Welcome to clui
        </div>
        <div style={{ color: colors.textTertiary, fontSize: 12, marginTop: 4 }}>
          Hub home — start a chat, browse history, manage plugins, or change settings.
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--clui-space-3)',
        }}
      >
        <ActionCard
          icon={<Plus size={18} />}
          title="New chat"
          subtitle="Start a chat in your home folder"
          onClick={async () => {
            const result = await window.clui.requestCreateTab?.()
            if (result?.tabId) setView('chat')
          }}
        />
        <ActionCard
          icon={<ChatCircleText size={18} />}
          title="Pick folder + new chat"
          subtitle="Choose a directory and start a session"
          onClick={async () => {
            const dir = await window.clui.selectDirectory()
            if (!dir) return
            const result = await window.clui.requestCreateTab?.(dir)
            if (result?.tabId) setView('chat')
          }}
        />
        <ActionCard
          icon={<ChatCircleText size={18} />}
          title="View chats"
          subtitle="Open chats board"
          onClick={() => setView('chat')}
        />
        <ActionCard
          icon={<ClockClockwise size={18} />}
          title="History"
          subtitle="Resume a past session"
          onClick={() => setView('history')}
        />
        <ActionCard
          icon={<Storefront size={18} />}
          title="Marketplace"
          subtitle="Browse plugins and skills"
          onClick={() => setView('marketplace')}
        />
        <ActionCard
          icon={<GearSix size={18} />}
          title="Settings"
          subtitle="Theme, Claude config, about"
          onClick={() => setView('settings')}
        />
      </div>
    </div>
  )
}

function ActionCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
}) {
  const colors = useColors()
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? colors.surfaceActive : colors.surfacePrimary,
        border: `1px solid ${colors.containerBorder}`,
        borderRadius: 'var(--clui-radius-md, 10px)',
        padding: 'var(--clui-space-3) var(--clui-space-4)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--clui-space-3)',
        textAlign: 'left',
        cursor: 'pointer',
        color: colors.textPrimary,
        transition: 'background var(--clui-state-duration, 120ms) var(--clui-ease-out, ease-out)',
      }}
    >
      <span style={{ color: colors.accent, marginTop: 2 }}>{icon}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
        <span style={{ fontSize: 11, color: colors.textTertiary, lineHeight: 1.4 }}>
          {subtitle}
        </span>
      </span>
    </button>
  )
}

/* ─── History ─── */

function HistoryView() {
  const colors = useColors()
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resumeSession = useSessionStore((s) => s.resumeSession)

  useEffect(() => {
    let alive = true
    window.clui
      .listAllSessions()
      .then((list) => {
        if (!alive) return
        setSessions(list)
      })
      .catch((e) => {
        if (!alive) return
        setError(String(e?.message ?? e))
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: 'var(--clui-space-5)',
      }}
    >
      <div style={{ color: colors.textPrimary, fontSize: 16, fontWeight: 600, marginBottom: 'var(--clui-space-3)' }}>
        History
      </div>
      {error && (
        <div style={{ color: colors.textTertiary, fontSize: 12 }}>
          Couldn't load sessions: {error}
        </div>
      )}
      {!sessions && !error && (
        <div style={{ color: colors.textTertiary, fontSize: 12 }}>Loading…</div>
      )}
      {sessions && sessions.length === 0 && (
        <div style={{ color: colors.textTertiary, fontSize: 12 }}>
          No sessions yet — start a new chat from Home.
        </div>
      )}
      {sessions && sessions.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {sessions.map((s) => {
            const title = s.slug || s.firstMessage || '(no preview)'
            return (
              <li key={s.sessionId}>
                <button
                  onClick={async () => {
                    try {
                      await resumeSession(s.sessionId, title, s.projectPath)
                    } catch {
                      // Resumption errors surface via the pill's normal flow.
                    }
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    color: colors.textPrimary,
                    border: `1px solid ${colors.containerBorder}`,
                    borderRadius: 'var(--clui-radius-sm, 6px)',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    fontSize: 12,
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {title}
                    </span>
                    <span style={{ color: colors.textTertiary, fontSize: 11, flexShrink: 0 }}>
                      {timeAgo(s.lastTimestamp)}
                    </span>
                  </span>
                  <span style={{ color: colors.textTertiary, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FolderOpen size={11} />
                    {s.projectPath ? shortPath(s.projectPath) : '(unknown)'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/* ─── Marketplace ─── */

function MarketplaceView() {
  const colors = useColors()
  const setMarketplaceOpen = useSessionStore((s) => s.toggleMarketplace)
  const marketplaceOpen = useSessionStore((s) => s.marketplaceOpen)

  // MarketplacePanel guards on `marketplaceOpen`; force it true while this
  // section is mounted, restore when leaving.
  useEffect(() => {
    if (!marketplaceOpen) setMarketplaceOpen()
    return () => {
      if (useSessionStore.getState().marketplaceOpen) {
        useSessionStore.getState().closeMarketplace()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: colors.containerBg,
      }}
    >
      <MarketplacePanel />
    </div>
  )
}

/* ─── Settings ─── */

function SettingsView() {
  const colors = useColors()
  const setOpen = useSessionStore((s) => s.setSettingsPanelOpen)
  const open = useSessionStore((s) => s.settingsPanelOpen)

  useEffect(() => {
    if (!open) setOpen(true)
    return () => {
      if (useSessionStore.getState().settingsPanelOpen) {
        useSessionStore.getState().setSettingsPanelOpen(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: 'var(--clui-space-5)',
        display: 'flex',
        justifyContent: 'center',
        background: colors.containerBg,
      }}
    >
      <div style={{ width: '100%', maxWidth: 720 }}>
        <SettingsPanel />
      </div>
    </div>
  )
}
