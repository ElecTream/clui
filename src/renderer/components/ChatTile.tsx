import React, { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowsOutCardinal, X as XIcon, PaperPlaneTilt } from '@phosphor-icons/react'
import type { TabState } from '../../shared/types'
import { useColors } from '../theme'
import { useSessionStore } from '../stores/sessionStore'
import { useTabBackfill } from '../hooks/useTabBackfill'
import { ConversationView } from './ConversationView'
import { shortPath } from '../utils/format'

interface ChatTileProps {
  tab: TabState
  isFocused: boolean
  onFocus: () => void
  onPopout: () => void
  onClose: () => void
}

/**
 * ChatTile — one window-into-a-tab inside the hub workspace.
 *
 * Multiple tiles live side-by-side. Each tile renders ConversationView
 * for its own tabId (Phase 1d prop refactor) so messages don't cross
 * over. Click anywhere on the tile to focus it; the focused tile syncs
 * its tabId to the pill's active tab so the pill's main input bar also
 * targets it. The tile also has its own minimal input footer for quick
 * sends without leaving the hub.
 *
 * The tile owns:
 *  - header: title, status pill, popout, close
 *  - body:   the conversation view bound to its tabId
 *  - footer: a stripped-down input — textarea + send (no slash menus,
 *            mentions, attachments — pop out for the full kit).
 */
export function ChatTile({ tab, isFocused, onFocus, onPopout, onClose }: ChatTileProps) {
  const colors = useColors()
  useTabBackfill(tab.id)

  const statusInfo = describeStatus(tab.status)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 4 }}
      transition={{ duration: 0.15, ease: [0.2, 0, 0.1, 1] }}
      onMouseDown={onFocus}
      style={{
        background: colors.surfacePrimary,
        border: `1px solid ${isFocused ? colors.accent : colors.containerBorder}`,
        borderRadius: 'var(--clui-radius-md, 10px)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
        boxShadow: isFocused ? '0 0 0 1px ' + colors.accent : 'none',
        transition: 'box-shadow var(--clui-state-duration, 120ms) var(--clui-ease-out, ease-out)',
      }}
    >
      <header
        style={{
          flexShrink: 0,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 var(--clui-space-2)',
          borderBottom: `1px solid ${colors.containerBorder}`,
          background: colors.surfacePrimary,
        }}
      >
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
            minWidth: 0,
            color: colors.textPrimary,
            fontSize: 12,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={tab.workingDirectory ? `${tab.title || 'Untitled'} · ${shortPath(tab.workingDirectory)}` : tab.title}
        >
          {tab.title || 'Untitled'}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onPopout() }}
          title="Pop into its own window"
          className="clui-icon-btn"
          style={{ width: 24, height: 24 }}
        >
          <ArrowsOutCardinal size={11} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
          title="Remove from workspace"
          className="clui-icon-btn"
          style={{ width: 24, height: 24 }}
        >
          <XIcon size={11} />
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ConversationView tabId={tab.id} />
      </div>

      <TileInput tabId={tab.id} disabled={tab.status === 'connecting'} />
    </motion.div>
  )
}

interface TileInputProps {
  tabId: string
  disabled?: boolean
}

function TileInput({ tabId, disabled }: TileInputProps) {
  const colors = useColors()
  const [text, setText] = useState('')
  const sendMessage = useSessionStore((s) => s.sendMessage)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    sendMessage(trimmed, undefined, tabId)
    setText('')
  }, [text, sendMessage, tabId])

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        flexShrink: 0,
        borderTop: `1px solid ${colors.containerBorder}`,
        background: colors.surfacePrimary,
        padding: 'var(--clui-space-2)',
        display: 'flex',
        gap: 6,
        alignItems: 'flex-end',
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
        placeholder="Type a message…  (Enter to send, Shift+Enter for newline)"
        rows={1}
        disabled={disabled}
        style={{
          flex: 1,
          minHeight: 28,
          maxHeight: 120,
          resize: 'none',
          padding: '6px 8px',
          fontFamily: 'inherit',
          fontSize: 12,
          lineHeight: 1.4,
          color: colors.textPrimary,
          background: colors.inputPillBg,
          border: `1px solid ${colors.containerBorder}`,
          borderRadius: 'var(--clui-radius-sm, 6px)',
          outline: 'none',
        }}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        title="Send (Enter)"
        className="clui-icon-btn"
        style={{
          width: 28,
          height: 28,
          opacity: disabled || !text.trim() ? 0.4 : 1,
          cursor: disabled || !text.trim() ? 'default' : 'pointer',
        }}
      >
        <PaperPlaneTilt size={12} weight="fill" />
      </button>
    </div>
  )
}

// ─── Status helpers (mirrors HubShell.describeStatus) ───

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
