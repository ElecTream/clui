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
} from '@phosphor-icons/react'
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

function ChatView() {
  const colors = useColors()
  const tab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId))

  if (!tab) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: colors.textTertiary,
          fontSize: 12,
          padding: 'var(--clui-space-5)',
          textAlign: 'center',
        }}
      >
        No active conversation. Send a message from the pill to start one.
      </div>
    )
  }

  const onPopOut = (): void => {
    void window.clui.popoutTab?.(tab.id).catch(() => {})
  }

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
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 var(--clui-space-3)',
          borderBottom: `1px solid ${colors.containerBorder}`,
        }}
      >
        <button
          onClick={onPopOut}
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
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = colors.textPrimary }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = colors.textTertiary }}
        >
          <ArrowsOutCardinal size={11} />
          Pop out
        </button>
      </div>
      <ConversationView />
    </div>
  )
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
          subtitle="Spawn a new tab in the pill"
          onClick={async () => {
            await window.clui.createTab()
          }}
        />
        <ActionCard
          icon={<ChatCircleText size={18} />}
          title="Pick folder + new chat"
          subtitle="Choose a directory and start a session"
          onClick={async () => {
            const dir = await window.clui.selectDirectory()
            if (!dir) return
            await window.clui.createTab()
            // Folder gets attached on the next message; setting CWD via the
            // pill's tab-mutator would require a pill-side action.
          }}
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
