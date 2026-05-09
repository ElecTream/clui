import React, { useEffect, useState } from 'react'
import { Plus, Minus, ArrowsClockwise, Stack } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { HistoryPicker } from './HistoryPicker'
import { SettingsPopover } from './SettingsPopover'
import { SwitcherChip } from './TabSwitcher'
import { useColors, useThemeStore } from '../theme'

/**
 * Deck button — toggles the host window. Single source of truth for the
 * host's open/closed state lives in main process; this button just sends
 * an IPC and listens for the broadcast back. data-active drives the
 * accent-color styling when host is open.
 */
function DeckButton() {
  const colors = useColors()
  const [hostVisible, setHostVisible] = useState(false)

  useEffect(() => {
    // Seed from current state — covers the case where the host was
    // restored on pill summon before the renderer mounted.
    window.clui.getHostVisibility().then(setHostVisible).catch(() => {})
    const off = window.clui.onHostWindowVisibility((v) => setHostVisible(v))
    return off
  }, [])

  return (
    <button
      data-clui-no-drag="true"
      onClick={() => window.clui.toggleHostWindow()}
      className="clui-icon-btn"
      data-active={hostVisible ? 'true' : 'false'}
      style={{ color: hostVisible ? colors.accent : undefined }}
      title={hostVisible ? 'Close hub' : 'Open hub'}
    >
      <Stack size={16} />
    </button>
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
  const isExpanded = useSessionStore((s) => s.isExpanded)
  const createTab = useSessionStore((s) => s.createTab)
  const toggleExpanded = useSessionStore((s) => s.toggleExpanded)

  return (
    <div
      data-clui-ui
      className="flex items-center no-drag"
      style={{
        // Phase 0.0 spacing scale — was '8px 0' literal.
        padding: 'var(--clui-space-2) 0',
        gap: 'var(--clui-space-2)',
        paddingLeft: 'var(--clui-space-2)',
        paddingRight: 'var(--clui-space-2)',
      }}
    >
      {/* Active-tab chip + popover switcher — replaces the old horizontal
          tab-pill row. Stage 2b. */}
      <div className="flex-1 min-w-0 flex items-center" style={{ paddingLeft: 'var(--clui-space-1)' }}>
        <SwitcherChip />
      </div>

      {/* Pinned action buttons */}
      <div
        className="flex items-center flex-shrink-0"
        style={{ gap: 'var(--clui-space-1)' }}
      >
        <button
          onClick={() => createTab()}
          data-clui-no-drag="true"
          className="clui-icon-btn"
          title="New chat"
        >
          <Plus size={16} />
        </button>

        <HistoryPicker />

        <DeckButton />

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
