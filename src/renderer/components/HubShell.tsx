import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  House,
  ChatCircleText,
  ClockClockwise,
  Storefront,
  GearSix,
  Plus,
  FolderOpen,
  GlobeHemisphereWest,
  X as XIcon,
} from '@phosphor-icons/react'
import type { TabState } from '../../shared/types'
import { useColors } from '../theme'
import { useSessionStore } from '../stores/sessionStore'
import { SettingsPanel } from './SettingsPanel'
import { MarketplacePanel } from './MarketplacePanel'
import { PeerBrowser } from './PeerBrowser'
import { ChatTile } from './ChatTile'
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
 * Chat view — multi-chat workspace.
 *
 * The hub holds a sidebar listing every active session and a workspace
 * area that renders 1..N tiles simultaneously. Each tile is a window
 * into a tab — its own ConversationView + minimal input — so multiple
 * conversations can stream side-by-side. Click a session in the sidebar
 * to add it to the workspace. The focused tile syncs its tabId to the
 * pill's active tab so the pill's main input bar also targets it.
 *
 * Tab CRUD goes through the pill (canonical owner) via the
 * requestPillAction broker so every window stays in sync. Workspace
 * membership is hub-local React state — not persisted across hub close.
 */
function ChatView() {
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const [workspaceTabIds, setWorkspaceTabIds] = useState<string[]>([])
  const [focusedTileId, setFocusedTileId] = useState<string | null>(null)

  // Drop tiles whose tabs were closed in the pill. Keeps the workspace
  // honest without needing explicit close coordination.
  useEffect(() => {
    setWorkspaceTabIds((ids) => ids.filter((id) => tabs.some((t) => t.id === id)))
  }, [tabs])

  // Pill is canonical owner of activeTabId. When the user focuses a
  // tile here, tell the pill — its broadcast then mirrors the change to
  // every window. Without this round-trip the hub and pill drift apart.
  useEffect(() => {
    if (focusedTileId && activeTabId !== focusedTileId) {
      void window.clui.requestPillAction({ kind: 'select-tab', tabId: focusedTileId })
    }
  }, [focusedTileId, activeTabId])

  // If the user picks a different active tab elsewhere (e.g. the pill's
  // tab strip) and that tab is in our workspace, mirror the highlight.
  useEffect(() => {
    if (activeTabId && workspaceTabIds.includes(activeTabId) && focusedTileId !== activeTabId) {
      setFocusedTileId(activeTabId)
    }
  }, [activeTabId, workspaceTabIds, focusedTileId])

  const addToWorkspace = useCallback((tabId: string) => {
    setWorkspaceTabIds((ids) => (ids.includes(tabId) ? ids : [...ids, tabId]))
    setFocusedTileId(tabId)
  }, [])

  const removeFromWorkspace = useCallback((tabId: string) => {
    setWorkspaceTabIds((ids) => ids.filter((id) => id !== tabId))
    setFocusedTileId((prev) => (prev === tabId ? null : prev))
  }, [])

  const popoutTile = useCallback((tabId: string) => {
    void window.clui.popoutTab?.(tabId).catch(() => {})
    removeFromWorkspace(tabId)
  }, [removeFromWorkspace])

  const onNewChatHere = async (): Promise<void> => {
    const result = await window.clui.requestPillAction({ kind: 'create-tab' })
    if (result.ok && result.tabId) addToWorkspace(result.tabId)
  }
  const onNewChatInDir = async (): Promise<void> => {
    const dir = await window.clui.selectDirectory()
    if (!dir) return
    const result = await window.clui.requestPillAction({ kind: 'create-tab', workingDirectory: dir })
    if (result.ok && result.tabId) addToWorkspace(result.tabId)
  }

  const workspaceTabs = useMemo(
    () =>
      workspaceTabIds
        .map((id) => tabs.find((t) => t.id === id))
        .filter((t): t is TabState => Boolean(t)),
    [workspaceTabIds, tabs],
  )

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <SessionsList
        tabs={tabs}
        workspaceTabIds={workspaceTabIds}
        focusedTileId={focusedTileId}
        activeTabId={activeTabId}
        onSelect={addToWorkspace}
        onNewHere={onNewChatHere}
        onNewInDir={onNewChatInDir}
      />
      <Workspace
        tabs={workspaceTabs}
        focusedTileId={focusedTileId}
        onFocus={setFocusedTileId}
        onClose={removeFromWorkspace}
        onPopout={popoutTile}
        onNewChat={onNewChatHere}
      />
    </div>
  )
}

interface SessionsListProps {
  tabs: TabState[]
  workspaceTabIds: string[]
  focusedTileId: string | null
  activeTabId: string | null
  onSelect: (tabId: string) => void
  onNewHere: () => void
  onNewInDir: () => void
}

function SessionsList({
  tabs,
  workspaceTabIds,
  focusedTileId,
  activeTabId,
  onSelect,
  onNewHere,
  onNewInDir,
}: SessionsListProps) {
  const colors = useColors()
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        borderRight: `1px solid ${colors.containerBorder}`,
        background: colors.containerBg,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: 'var(--clui-space-2) var(--clui-space-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--clui-space-1)',
          borderBottom: `1px solid ${colors.containerBorder}`,
        }}
      >
        <span style={{ flex: 1, color: colors.textPrimary, fontSize: 12, fontWeight: 500 }}>
          Sessions {tabs.length > 0 && <span style={{ color: colors.textTertiary, fontWeight: 400 }}>· {tabs.length}</span>}
        </span>
        <button
          onClick={onNewHere}
          title="New chat in current directory"
          className="clui-icon-btn"
          style={{ width: 26, height: 26 }}
        >
          <Plus size={11} />
        </button>
        <button
          onClick={onNewInDir}
          title="New chat in folder…"
          className="clui-icon-btn"
          style={{ width: 26, height: 26 }}
        >
          <FolderOpen size={11} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--clui-space-1)' }}>
        {tabs.length === 0 ? (
          <div style={{ color: colors.textTertiary, fontSize: 11, padding: 'var(--clui-space-3)', textAlign: 'center' }}>
            No chats yet. Click the + above.
          </div>
        ) : (
          tabs.map((t) => (
            <SessionRow
              key={t.id}
              tab={t}
              inWorkspace={workspaceTabIds.includes(t.id)}
              isFocused={focusedTileId === t.id}
              isActive={activeTabId === t.id}
              onClick={() => onSelect(t.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ tabId: t.id, x: e.clientX, y: e.clientY })
              }}
            />
          ))
        )}
      </div>

      {contextMenu && (
        <TabContextMenu
          tabId={contextMenu.tabId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onFocus={onSelect}
        />
      )}
    </aside>
  )
}

interface SessionRowProps {
  tab: TabState
  inWorkspace: boolean
  isFocused: boolean
  isActive: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function SessionRow({ tab, inWorkspace, isFocused, isActive, onClick, onContextMenu }: SessionRowProps) {
  const colors = useColors()
  const [hover, setHover] = useState(false)
  const statusInfo = describeStatus(tab.status)

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        background: isFocused
          ? colors.surfaceActive
          : hover
            ? colors.surfacePrimary
            : 'transparent',
        border: 'none',
        borderLeft: `2px solid ${isFocused ? colors.accent : 'transparent'}`,
        color: colors.textPrimary,
        padding: '6px 8px 6px 10px',
        borderRadius: 'var(--clui-radius-sm, 6px)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        marginBottom: 2,
        opacity: inWorkspace ? 1 : 0.85,
        transition: 'background var(--clui-state-duration, 120ms) var(--clui-ease-out, ease-out)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          title={statusInfo.label}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            background: statusInfo.color(colors),
            flexShrink: 0,
          }}
        />
        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: isActive ? 500 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {tab.title || 'Untitled'}
        </span>
        {inWorkspace && (
          <span
            title="In workspace"
            style={{
              fontSize: 9,
              color: colors.textTertiary,
              border: `1px solid ${colors.containerBorder}`,
              borderRadius: 4,
              padding: '0 4px',
              lineHeight: '12px',
            }}
          >
            ●
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 10,
          color: colors.textTertiary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {shortPath(tab.workingDirectory)}
      </span>
    </button>
  )
}

interface WorkspaceProps {
  tabs: TabState[]
  focusedTileId: string | null
  onFocus: (tabId: string) => void
  onClose: (tabId: string) => void
  onPopout: (tabId: string) => void
  onNewChat: () => void
}

function Workspace({ tabs, focusedTileId, onFocus, onClose, onPopout, onNewChat }: WorkspaceProps) {
  const colors = useColors()

  if (tabs.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--clui-space-5)',
        }}
      >
        <div style={{ textAlign: 'center', color: colors.textTertiary, fontSize: 12, maxWidth: 360 }}>
          <ChatCircleText size={28} weight="duotone" style={{ color: colors.textTertiary, marginBottom: 12 }} />
          <div style={{ marginBottom: 6, fontSize: 13, color: colors.textSecondary }}>
            Workspace is empty
          </div>
          <div style={{ marginBottom: 14 }}>
            Pick a session from the sidebar to drop it in here, or start a new chat.
          </div>
          <button
            onClick={onNewChat}
            className="clui-icon-btn"
            style={{
              width: 'auto',
              padding: '6px 12px',
              gap: 6,
              fontSize: 12,
              border: `1px solid ${colors.containerBorder}`,
              borderRadius: 'var(--clui-radius-sm, 6px)',
              color: colors.textPrimary,
            }}
          >
            <Plus size={11} />
            New chat
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: 'auto',
        padding: 'var(--clui-space-3)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 'var(--clui-space-3)',
          alignContent: 'start',
        }}
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((t) => (
            <ChatTile
              key={t.id}
              tab={t}
              isFocused={focusedTileId === t.id}
              onFocus={() => onFocus(t.id)}
              onPopout={() => onPopout(t.id)}
              onClose={() => onClose(t.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

/**
 * Right-click context menu for a session row — Rename / Duplicate /
 * Pop out / Close.
 * Floating panel anchored to click coords; clicks outside or Esc dismiss.
 * All mutations go through the pill-action broker so the pill (canonical
 * tab owner) stays the single source of truth.
 */
function TabContextMenu({
  tabId,
  x,
  y,
  onClose,
  onFocus,
}: {
  tabId: string
  x: number
  y: number
  onClose: () => void
  onFocus: (tabId: string) => void
}) {
  const colors = useColors()
  const ref = useRef<HTMLDivElement>(null)
  const [renaming, setRenaming] = useState(false)
  const tab = useSessionStore((s) => s.tabs.find((t) => t.id === tabId))

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!tab) {
    onClose()
    return null
  }

  if (renaming) {
    return <RenameTabDialog tab={tab} onClose={onClose} />
  }

  // Clamp inside viewport so the menu doesn't escape the right or bottom edge.
  const MENU_W = 180
  const MENU_H = 160
  const px = Math.min(x, window.innerWidth - MENU_W - 8)
  const py = Math.min(y, window.innerHeight - MENU_H - 8)

  const items: Array<{ label: string; onClick: () => void; danger?: boolean }> = [
    { label: 'Open chat', onClick: () => { onFocus(tabId); onClose() } },
    { label: 'Pop out', onClick: () => { void window.clui.popoutTab?.(tabId); onClose() } },
    { label: 'Rename…', onClick: () => setRenaming(true) },
    {
      label: 'Duplicate',
      onClick: async () => {
        const result = await window.clui.requestPillAction({ kind: 'duplicate-tab', tabId })
        onClose()
        if (result.ok && result.tabId) onFocus(result.tabId)
      },
    },
    {
      label: 'Close',
      danger: true,
      onClick: async () => {
        await window.clui.requestPillAction({ kind: 'close-tab', tabId })
        onClose()
      },
    },
  ]

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: py,
        left: px,
        width: MENU_W,
        background: colors.surfacePrimary,
        border: `1px solid ${colors.containerBorder}`,
        borderRadius: 'var(--clui-radius-md, 10px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        padding: 4,
        zIndex: 1000,
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => { void item.onClick() }}
          style={{
            display: 'block',
            width: '100%',
            background: 'transparent',
            border: 'none',
            color: item.danger ? colors.statusError : colors.textPrimary,
            textAlign: 'left',
            padding: '6px 10px',
            fontSize: 12,
            cursor: 'pointer',
            borderRadius: 'var(--clui-radius-sm, 6px)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.surfaceActive }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

/** Inline rename modal for the context menu — autofocuses the input. */
function RenameTabDialog({ tab, onClose }: { tab: TabState; onClose: () => void }) {
  const colors = useColors()
  const [value, setValue] = useState(tab.title || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  const submit = async (): Promise<void> => {
    const next = value.trim()
    if (!next || next === tab.title) { onClose(); return }
    await window.clui.requestPillAction({ kind: 'rename-tab', tabId: tab.id, title: next })
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surfacePrimary,
          border: `1px solid ${colors.containerBorder}`,
          borderRadius: 'var(--clui-radius-md, 10px)',
          padding: 16,
          minWidth: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <span style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 500 }}>Rename chat</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
            if (e.key === 'Escape') onClose()
          }}
          style={{
            background: colors.inputPillBg,
            color: colors.textPrimary,
            border: `1px solid ${colors.containerBorder}`,
            borderRadius: 'var(--clui-radius-sm, 6px)',
            padding: '6px 10px',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button
            onClick={onClose}
            style={{
              background: colors.surfaceActive,
              color: colors.textPrimary,
              border: 'none',
              borderRadius: 'var(--clui-radius-sm, 6px)',
              fontSize: 11,
              padding: '5px 10px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { void submit() }}
            style={{
              background: colors.accent,
              color: colors.textOnAccent,
              border: 'none',
              borderRadius: 'var(--clui-radius-sm, 6px)',
              fontSize: 11,
              padding: '5px 10px',
              cursor: 'pointer',
            }}
          >
            Rename
          </button>
        </div>
      </div>
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
