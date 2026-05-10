import React, { useCallback, useEffect, useRef, useState } from 'react'
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
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const selectTab = useSessionStore((s) => s.selectTab)
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
    />
  )
}

function TabsBoard({
  tabs,
  activeTabId,
  onOpen,
}: {
  tabs: TabState[]
  activeTabId: string | null
  onOpen: (tabId: string) => void
}) {
  const colors = useColors()
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)

  const onNewChatHere = async (): Promise<void> => {
    const result = await window.clui.requestPillAction({ kind: 'create-tab' })
    if (result.ok && result.tabId) onOpen(result.tabId)
  }
  const onNewChatInDir = async (): Promise<void> => {
    const dir = await window.clui.selectDirectory()
    if (!dir) return
    const result = await window.clui.requestPillAction({ kind: 'create-tab', workingDirectory: dir })
    if (result.ok && result.tabId) onOpen(result.tabId)
  }

  const commitReorder = async (fromIdx: number, toIdx: number): Promise<void> => {
    if (fromIdx === toIdx) return
    await window.clui.requestPillAction({ kind: 'reorder-tabs', fromIdx, toIdx })
  }

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

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
            {tabs.map((t, idx) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => {
                  setDragFrom(idx)
                  e.dataTransfer.effectAllowed = 'move'
                  // setData() is required on Firefox for drag to start; the
                  // value is irrelevant since we read from React state.
                  e.dataTransfer.setData('text/plain', t.id)
                }}
                onDragEnd={() => {
                  setDragFrom(null)
                  setDragOver(null)
                }}
                onDragOver={(e) => {
                  if (dragFrom === null || dragFrom === idx) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOver !== idx) setDragOver(idx)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragFrom === null || dragFrom === idx) return
                  void commitReorder(dragFrom, idx)
                  setDragFrom(null)
                  setDragOver(null)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ tabId: t.id, x: e.clientX, y: e.clientY })
                }}
                style={{
                  position: 'relative',
                  opacity: dragFrom === idx ? 0.4 : 1,
                  transform: dragOver === idx && dragFrom !== null && dragFrom !== idx ? 'translateY(-2px)' : 'none',
                  transition: 'transform 120ms ease-out, opacity 120ms ease-out',
                }}
              >
                <TabCard
                  tab={t}
                  isActive={t.id === activeTabId}
                  onOpen={() => onOpen(t.id)}
                  onPopOut={() => { void window.clui.popoutTab?.(t.id).catch(() => {}) }}
                  onClose={() => { void window.clui.requestPillAction({ kind: 'close-tab', tabId: t.id }) }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {contextMenu && (
        <TabContextMenu
          tabId={contextMenu.tabId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onFocus={onOpen}
        />
      )}
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
  const preview = previewForTab(tab)
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
  // Uses .clui-icon-btn for the 28px hit zone (Phase 0.3 audit). The
  // visible icon is smaller; the hit-zone catches clicks slightly off
  // the icon. Background applied inline so it stands out from the card.
  const colors = useColors()
  return (
    <button
      onClick={onClick}
      title={title}
      className="clui-icon-btn"
      style={{
        background: colors.surfacePrimary,
        border: `1px solid ${colors.containerBorder}`,
        // Icon-btn defaults to 28×28; for in-card use a touch smaller
        // so the cluster doesn't overwhelm the card content.
        width: 24,
        height: 24,
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

/**
 * Card right-click context menu — Rename / Duplicate / Pop out / Close.
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
          className="clui-icon-btn"
          style={{
            // Wider than 28×28 because there's a label next to the icon.
            width: 'auto',
            paddingLeft: 8,
            paddingRight: 8,
            gap: 4,
            fontSize: 11,
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
          className="clui-icon-btn"
          style={{
            width: 'auto',
            paddingLeft: 8,
            paddingRight: 8,
            gap: 4,
            fontSize: 11,
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

/**
 * Build a one-line card preview for a tab.
 *
 * Skips system/tool messages and walks back through the history looking
 * for the latest meaningful exchange, prefixing with "You: " / "Claude: "
 * so the user can tell who said what at a glance. Falls back to
 * working-directory-based copy for empty tabs.
 */
function previewForTab(tab: TabState): string {
  for (let i = tab.messages.length - 1; i >= 0; i--) {
    const m = tab.messages[i]
    if (m.role === 'assistant' && m.content?.trim()) {
      return `Claude: ${collapse(m.content)}`
    }
    if (m.role === 'user' && m.content?.trim()) {
      return `You: ${collapse(m.content)}`
    }
    // Skip tool / system / empty messages — they're noise in a card.
  }
  if (tab.currentActivity) return tab.currentActivity
  return tab.hasChosenDirectory ? 'No messages yet — type to start.' : 'New chat'
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, 160)
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
