import React from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react'
import { ActiveTabChip } from './TabSwitcher'
import { ModelPicker, PermissionModePicker } from './StatusBar'
import { useColors, useThemeStore } from '../theme'

/**
 * Pill toolbar — the always-visible row above the input pill.
 *
 * Per the user's spec: pill carries the controls they reach for during
 * a chat. Everything else (history, marketplace, settings, directory
 * picker, "+ new chat") moves to the hub. The "Open in CLI" launcher
 * lives as a circle to the right of the hub circle (mirroring the
 * left-side action stack).
 *
 *   [active-tab indicator] [model] [mode] [optional update]
 */

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
  const colors = useColors()

  return (
    <div
      data-clui-ui
      className="flex items-center no-drag"
      style={{
        padding: 'var(--clui-space-2) var(--clui-space-3)',
        gap: 'var(--clui-space-3)',
        // Subtle separator from the input pill below; the surface contrast
        // does the rest of the work (per Phase 0.0 design language).
        borderBottom: `1px solid ${colors.containerBorder}`,
      }}
    >
      <ActiveTabChip />

      <div
        style={{
          height: 18,
          width: 1,
          background: colors.containerBorder,
          flexShrink: 0,
        }}
      />

      <div
        className="flex items-center min-w-0"
        style={{
          gap: 'var(--clui-space-3)',
          fontSize: 11,
          color: colors.textTertiary,
          flex: 1,
        }}
      >
        <ModelPicker />
        <span style={{ color: colors.textMuted, fontSize: 10 }}>|</span>
        <PermissionModePicker />
      </div>

      <div
        className="flex items-center flex-shrink-0"
        style={{ gap: 'var(--clui-space-2)' }}
      >
        <UpdateButton />
      </div>
    </div>
  )
}
