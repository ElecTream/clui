import React from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'
import type { TabStatus } from '../../shared/types'

/**
 * Active-tab indicator chip on the pill.
 *
 * Stage 2b briefly introduced a popover-style switcher; the user pointed
 * out that once cards-as-windows lands (stage 3), every chat is either
 * a visible window OR minimized into the hub — there's nothing for a
 * popover switcher to switch between. The hub becomes the deck, and
 * switching means either bringing a card window forward or restoring it
 * from the hub.
 *
 * So this is purely a label: status dot + active tab title. No dropdown,
 * no popover, no caret. Click does nothing here — interaction with cards
 * happens via the card windows themselves and the hub.
 */

function StatusDot({
  status,
  hasUnread,
  hasPermission,
  size = 6,
}: {
  status: TabStatus
  hasUnread: boolean
  hasPermission: boolean
  size?: number
}) {
  const colors = useColors()
  let bg: string = colors.statusIdle
  let pulse = false
  let glow = false

  if (status === 'dead' || status === 'failed') {
    bg = colors.statusError
  } else if (hasPermission) {
    bg = colors.statusPermission
    glow = true
  } else if (status === 'connecting' || status === 'running') {
    bg = colors.statusRunning
    pulse = true
  } else if (hasUnread) {
    bg = colors.statusComplete
  }

  return (
    <span
      className={`rounded-full flex-shrink-0 ${pulse ? 'animate-pulse-dot' : ''}`}
      style={{
        width: size,
        height: size,
        background: bg,
        ...(glow ? { boxShadow: `0 0 6px 2px ${colors.statusPermissionGlow}` } : {}),
      }}
    />
  )
}

export function ActiveTabChip() {
  const colors = useColors()
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const activeTab = tabs.find((t) => t.id === activeTabId)

  if (!activeTab) return null

  return (
    <div
      data-clui-ui
      data-clui-no-drag="true"
      title={activeTab.title || 'Untitled'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--clui-space-2)',
        height: 'var(--clui-hit-zone, 28px)',
        padding: '0 var(--clui-space-3, 12px)',
        background: colors.surfaceHover,
        border: `1px solid ${colors.containerBorder}`,
        borderRadius: 9999,
        color: colors.textPrimary,
        fontSize: 12,
        fontWeight: 'var(--clui-font-weight-emphasis, 600)' as unknown as number,
        letterSpacing: 'var(--clui-letter-spacing-body, -0.005em)',
        maxWidth: 240,
        flexShrink: 0,
      }}
    >
      <StatusDot
        status={activeTab.status}
        hasUnread={activeTab.hasUnread}
        hasPermission={activeTab.permissionQueue.length > 0}
      />
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {activeTab.title || 'Untitled'}
      </span>
    </div>
  )
}
