import React, { useEffect } from 'react'
import { useColors } from './theme'
import { useThemeStore } from './theme'
import HubShell from './components/HubShell'
import { PopoverLayerProvider } from './components/PopoverLayer'
import { useClaudeEvents } from './hooks/useClaudeEvents'
import { useReceiveTabsSnapshot } from './hooks/useTabsSync'

/**
 * HostApp — the host window's React root. Holds the Hub: Home, History,
 * Marketplace, Settings. The pill stays as the always-on-top summon; the
 * "menu" content the user removed from the pill in stage 2c lives here.
 */
export default function HostApp() {
  // Subscribe to the same Claude event stream the pill uses. Combined
  // with the tabs-snapshot receiver below, the host's session store
  // mirrors the pill's tabs/messages well enough to render
  // ConversationView in the hub.
  useClaudeEvents()
  useReceiveTabsSnapshot()

  const colors = useColors()
  const setSystemTheme = useThemeStore((s) => s.setSystemTheme)

  // Theme bootstrap mirrors the pill's. Without this the host renders
  // with default (dark) tokens until the user's preference loads.
  useEffect(() => {
    window.clui.getTheme().then(({ isDark }) => {
      setSystemTheme(isDark)
    }).catch(() => {})
    const off = window.clui.onThemeChange((isDark) => setSystemTheme(isDark))
    return off
  }, [setSystemTheme])

  return (
    <PopoverLayerProvider>
      <div
        // Drag-from-anywhere: the entire host body is a drag region; CSS
        // opts out interactive children automatically. OS handles drag.
        data-clui-drag="true"
        style={{
          width: '100vw',
          height: '100vh',
          background: colors.containerBg,
          color: colors.textPrimary,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            height: 32,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            padding: '0 var(--clui-space-3)',
            borderBottom: `1px solid ${colors.containerBorder}`,
            fontSize: 11,
            color: colors.textTertiary,
            letterSpacing: '0.02em',
          }}
        >
          clui · hub
        </header>
        <HubShell />
      </div>
    </PopoverLayerProvider>
  )
}
