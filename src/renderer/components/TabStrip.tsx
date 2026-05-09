import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Minus, ArrowsClockwise } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { HistoryPicker } from './HistoryPicker'
import { SettingsPopover } from './SettingsPopover'
import { useColors, useThemeStore } from '../theme'
import type { TabStatus } from '../../shared/types'

function StatusDot({ status, hasUnread, hasPermission }: { status: TabStatus; hasUnread: boolean; hasPermission: boolean }) {
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
      className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${pulse ? 'animate-pulse-dot' : ''}`}
      style={{
        background: bg,
        ...(glow ? { boxShadow: `0 0 6px 2px ${colors.statusPermissionGlow}` } : {}),
      }}
    />
  )
}

function UpdateButton() {
  const colors = useColors()
  const updateReady = useThemeStore((s) => s.updateReady)
  const updateVersion = useThemeStore((s) => s.updateVersion)

  if (!updateVersion) return null

  return (
    <button
      data-clui-ui
      data-clui-no-drag="true"
      onClick={updateReady ? () => window.clui.installUpdate() : undefined}
      className="clui-icon-btn"
      style={{ color: colors.accent, cursor: updateReady ? 'pointer' : 'default' }}
      title={updateReady ? `Update to v${updateVersion} — click to restart` : `Downloading v${updateVersion}…`}
    >
      <ArrowsClockwise size={16} className={updateReady ? '' : 'animate-spin'} />
    </button>
  )
}

export function TabStrip() {
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const isExpanded = useSessionStore((s) => s.isExpanded)
  const selectTab = useSessionStore((s) => s.selectTab)
  const createTab = useSessionStore((s) => s.createTab)
  const closeTab = useSessionStore((s) => s.closeTab)
  const toggleExpanded = useSessionStore((s) => s.toggleExpanded)

  return (
    <div
      data-clui-ui
      className="flex items-center no-drag"
      style={{
        // Phase 0.0 spacing scale — was '8px 0' literal.
        padding: 'var(--clui-space-2) 0',
        gap: 'var(--clui-space-1)',
      }}
    >
      {/* Scrollable tabs area — clipped by master card edge */}
      <div className="relative min-w-0 flex-1">
        <div
          className="flex items-center overflow-x-auto min-w-0"
          style={{
            scrollbarWidth: 'none',
            gap: 'var(--clui-space-1)',
            paddingLeft: 'var(--clui-space-2)',
            // Extra right breathing room so clipped tabs fade out before the edge.
            paddingRight: 'var(--clui-space-4)',
            // Right-only content fade so the parent card's own animated background
            // shows through cleanly in both collapsed and expanded states.
            maskImage: 'linear-gradient(to right, black 0%, black calc(100% - 40px), transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, black 0%, black calc(100% - 40px), transparent 100%)',
          }}
        >
          <AnimatePresence mode="popLayout">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId
              return (
                <motion.button
                  key={tab.id}
                  layout
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.15, ease: [0.2, 0, 0.1, 1] }}
                  onClick={() => selectTab(tab.id)}
                  className="clui-tab-pill group"
                  data-active={isActive ? 'true' : 'false'}
                  data-clui-no-drag="true"
                  // Tooltip exposes the working dir alongside the truncated title —
                  // tabs share titles often (e.g. "main") across different repos.
                  title={tab.title}
                >
                  <StatusDot status={tab.status} hasUnread={tab.hasUnread} hasPermission={tab.permissionQueue.length > 0} />
                  <span className="truncate flex-1" style={{ minWidth: 0 }}>{tab.title}</span>
                  {tabs.length > 1 && (
                    <span
                      role="button"
                      aria-label="Close tab"
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                      className="flex-shrink-0 flex items-center justify-center"
                      style={{
                        width: 14,
                        height: 14,
                        marginRight: -2,
                        borderRadius: 4,
                        opacity: isActive ? 0.55 : 0,
                        color: 'var(--clui-text-secondary)',
                        transition: 'opacity var(--clui-state-duration) var(--clui-ease-out), background var(--clui-state-duration) var(--clui-ease-out)',
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLElement
                        el.style.opacity = '1'
                        el.style.background = 'var(--clui-surface-active)'
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLElement
                        el.style.opacity = isActive ? '0.55' : '0'
                        el.style.background = 'transparent'
                      }}
                    >
                      <X size={10} />
                    </span>
                  )}
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Pinned action buttons — always visible on the right */}
      <div
        className="flex items-center flex-shrink-0"
        style={{
          gap: 'var(--clui-space-1)',
          marginLeft: 'var(--clui-space-1)',
          paddingRight: 'var(--clui-space-2)',
        }}
      >
        <button
          onClick={() => createTab()}
          data-clui-no-drag="true"
          className="clui-icon-btn"
          title="New tab"
        >
          <Plus size={16} />
        </button>

        <HistoryPicker />

        <SettingsPopover />

        <UpdateButton />

        {isExpanded && (
          <button
            onClick={() => toggleExpanded()}
            data-clui-no-drag="true"
            className="clui-icon-btn"
            title="Minimize"
          >
            <Minus size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
