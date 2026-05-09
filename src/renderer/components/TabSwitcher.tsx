import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CaretDown, X, Plus, FolderSimple } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'
import type { TabStatus } from '../../shared/types'
import { usePopoverLayer } from './PopoverLayer'

/**
 * TabSwitcher — Phase 0.1 stage 2b.
 *
 * Replaces the horizontal row of tiny tab pills (which the user described
 * as "too small, hard to close, hard to click into, hard to see") with a
 * single active-tab chip + a popover list. The chip lives where the tab
 * row used to be; clicking it opens a vertical list of every running
 * chat at proper hit-zone size (44px tall rows), with clear close
 * affordances and the working directory visible.
 *
 * Each tab is still rendered as its own button-target inside the popover,
 * so keyboard navigation and screen readers work the same. The pill row
 * itself becomes much quieter — one chip showing what's active, the rest
 * is on-demand.
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

interface SwitcherPopoverProps {
  anchorRect: DOMRect
  onClose: () => void
}

function SwitcherPopover({ anchorRect, onClose }: SwitcherPopoverProps) {
  const layer = usePopoverLayer()
  const colors = useColors()
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const selectTab = useSessionStore((s) => s.selectTab)
  const closeTab = useSessionStore((s) => s.closeTab)
  const createTab = useSessionStore((s) => s.createTab)
  const popoverRef = useRef<HTMLDivElement>(null)
  // Computed once on mount; the pill is unlikely to move while the popover
  // is open. Re-measure on window resize would be polish.
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null)

  // Position popover above the chip, left-aligned, with a small gap.
  // Falls back below the chip if there isn't room above (collapsed pill
  // sits flush with the bottom of the work area).
  useLayoutEffect(() => {
    const POPOVER_MIN_W = 280
    const POPOVER_MAX_W = 380
    const GAP = 8
    const desiredWidth = Math.max(POPOVER_MIN_W, Math.min(POPOVER_MAX_W, anchorRect.width * 1.4))
    const left = Math.max(8, anchorRect.left)
    // Estimate height for above/below decision; we'll re-clamp once
    // measured.
    const estimatedHeight = Math.min(48 + tabs.length * 44 + 44, 360)
    let top = anchorRect.top - estimatedHeight - GAP
    if (top < 8) top = anchorRect.bottom + GAP
    setPosition({ left, top, width: desiredWidth })
  }, [anchorRect.left, anchorRect.top, anchorRect.bottom, anchorRect.width, tabs.length])

  // Click-outside + Esc to close.
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // Defer so the click that opened the popover doesn't immediately close it.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDocMouseDown)
    }, 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!layer || !position) return null

  return createPortal(
    <motion.div
      ref={popoverRef}
      data-clui-ui
      data-clui-no-drag="true"
      initial={{ opacity: 0, y: 4, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.99 }}
      transition={{ duration: 0.16, ease: [0.2, 0, 0.1, 1] }}
      style={{
        position: 'absolute',
        left: position.left,
        top: position.top,
        width: position.width,
        pointerEvents: 'auto',
        background: colors.containerBg,
        border: `1px solid ${colors.containerBorder}`,
        borderRadius: 'var(--clui-radius-lg, 14px)',
        boxShadow: colors.popoverShadow,
        padding: 'var(--clui-space-1, 4px)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 360,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: 'var(--clui-space-2) var(--clui-space-3) var(--clui-space-1)',
          fontSize: 11,
          fontWeight: 'var(--clui-font-weight-emphasis, 600)' as unknown as number,
          letterSpacing: 'var(--clui-letter-spacing-label, 0.02em)',
          textTransform: 'uppercase',
          color: colors.textTertiary,
        }}
      >
        Open chats
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const cwd = tab.workingDirectory || ''
          const cwdShort = cwd ? cwd.replace(/^.*[\\/]/, '') : '~'
          return (
            <div
              key={tab.id}
              role="button"
              onClick={() => {
                selectTab(tab.id)
                onClose()
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--clui-space-3)',
                padding: 'var(--clui-space-2) var(--clui-space-3)',
                borderRadius: 'var(--clui-radius-sm, 6px)',
                background: isActive ? colors.surfaceHover : 'transparent',
                cursor: 'pointer',
                minHeight: 44,
                transition: 'background var(--clui-state-duration) var(--clui-ease-out)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = colors.surfaceHover
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              <StatusDot
                status={tab.status}
                hasUnread={tab.hasUnread}
                hasPermission={tab.permissionQueue.length > 0}
                size={8}
              />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 2 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: isActive ? 'var(--clui-font-weight-emphasis, 600)' : 'var(--clui-font-weight-body, 450)',
                    color: colors.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  } as React.CSSProperties}
                >
                  {tab.title || 'Untitled'}
                </div>
                {cwd && (
                  <div
                    style={{
                      fontSize: 11,
                      color: colors.textTertiary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <FolderSimple size={10} />
                    {cwdShort}
                  </div>
                )}
              </div>
              {tabs.length > 1 && (
                <button
                  data-clui-no-drag="true"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  className="clui-icon-btn"
                  style={{ width: 24, height: 24 }}
                  title="Close chat"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <div
        style={{
          borderTop: `1px solid ${colors.containerBorder}`,
          marginTop: 'var(--clui-space-1)',
          paddingTop: 'var(--clui-space-1)',
        }}
      >
        <button
          data-clui-no-drag="true"
          onClick={() => {
            createTab()
            onClose()
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--clui-space-2)',
            width: '100%',
            padding: 'var(--clui-space-2) var(--clui-space-3)',
            borderRadius: 'var(--clui-radius-sm, 6px)',
            background: 'transparent',
            border: 0,
            color: colors.textSecondary,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 'var(--clui-font-weight-body, 450)' as unknown as number,
            transition: 'background var(--clui-state-duration) var(--clui-ease-out), color var(--clui-state-duration) var(--clui-ease-out)',
            minHeight: 44,
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement
            el.style.background = colors.surfaceHover
            el.style.color = colors.textPrimary
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement
            el.style.background = 'transparent'
            el.style.color = colors.textSecondary
          }}
        >
          <Plus size={14} />
          New chat
        </button>
      </div>
    </motion.div>,
    layer,
  )
}

/**
 * SwitcherChip — what lives in the pill where the tab row used to be.
 * Shows the active tab's status + name + a "+N" indicator if there are
 * other open chats. Clicking opens the popover above.
 */
export function SwitcherChip() {
  const colors = useColors()
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const otherCount = Math.max(0, tabs.length - 1)

  const handleToggle = () => {
    if (!buttonRef.current) return
    if (!open) setAnchorRect(buttonRef.current.getBoundingClientRect())
    setOpen((v) => !v)
  }

  if (!activeTab) return null

  return (
    <>
      <button
        ref={buttonRef}
        data-clui-no-drag="true"
        onClick={handleToggle}
        className="clui-tab-pill"
        data-active={open ? 'true' : 'false'}
        title={`${activeTab.title}${otherCount > 0 ? ` — +${otherCount} more` : ''}`}
        style={{ maxWidth: 280, gap: 'var(--clui-space-2)' }}
      >
        <StatusDot
          status={activeTab.status}
          hasUnread={activeTab.hasUnread}
          hasPermission={activeTab.permissionQueue.length > 0}
        />
        <span
          className="truncate"
          style={{ minWidth: 0, color: colors.textPrimary, fontWeight: 'var(--clui-font-weight-emphasis, 600)' as unknown as number }}
        >
          {activeTab.title || 'Untitled'}
        </span>
        {otherCount > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 'var(--clui-font-weight-body, 450)' as unknown as number,
              color: colors.textTertiary,
              padding: '1px 6px',
              borderRadius: 9999,
              background: colors.surfaceHover,
              flexShrink: 0,
            }}
          >
            +{otherCount}
          </span>
        )}
        <CaretDown size={11} style={{ opacity: 0.6, flexShrink: 0 }} />
      </button>
      <AnimatePresence>
        {open && anchorRect && <SwitcherPopover anchorRect={anchorRect} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  )
}
