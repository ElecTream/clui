import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useColors } from './theme'
import { useThemeStore } from './theme'
import HubShell from './components/HubShell'
import { PopoverLayerProvider } from './components/PopoverLayer'
import { useClaudeEvents } from './hooks/useClaudeEvents'
import { useReceiveTabsSnapshot } from './hooks/useTabsSync'
import { useTabBackfill } from './hooks/useTabBackfill'
import { useSessionStore } from './stores/sessionStore'

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

  // Backfill the active tab's history when it changes. Without this the
  // hub would only see events fired after it opened — prior messages
  // would be missing from the conversation view.
  const activeTabId = useSessionStore((s) => s.activeTabId)
  useTabBackfill(activeTabId)

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
      <motion.div
        // Drag-from-anywhere: the entire host body is a drag region; CSS
        // opts out interactive children automatically. OS handles drag.
        data-clui-drag="true"
        // 120ms fade-in on mount so the OS-level window show doesn't flash.
        // Same vocabulary as the rest of the app — see Phase 5 spec.
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12, ease: [0.2, 0, 0.1, 1] }}
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
      </motion.div>
    </PopoverLayerProvider>
  )
}
