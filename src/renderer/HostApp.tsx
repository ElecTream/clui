import React, { useEffect } from 'react'
import { useColors } from './theme'
import { useThemeStore } from './theme'

/**
 * HostApp — Phase 0.1 placeholder.
 *
 * The host window is a real solid rectangular surface that holds non-pill
 * content (Conversation, Settings, Marketplace, Search). This commit only
 * stands the window up; the content migration happens in subsequent
 * commits, one feature at a time.
 *
 * Until then, render a holding screen so we can verify the window
 * actually opens, resizes, persists bounds, and pairs with the pill on
 * hide/show — without inheriting any of the in-pill content yet.
 */
export default function HostApp() {
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
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: colors.containerBg,
        color: colors.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        // Custom drag region — Phase 0.1 first commit just needs *some*
        // way to move the host so we can verify position persistence.
        // Top 36px is drag, the rest will become real UI.
      }}
    >
      <div
        style={{
          height: 36,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--clui-space-3)',
          borderBottom: `1px solid ${colors.containerBorder}`,
          fontSize: 12,
          fontWeight: 'var(--clui-font-weight-body, 450)' as unknown as number,
          color: colors.textTertiary,
          // The whole bar is draggable EXCEPT for explicit interactive
          // children (which set data-clui-no-drag="true"). Since this is
          // a placeholder there are no interactive children yet.
          // @ts-expect-error -- WebkitAppRegion isn't typed but Electron supports it
          WebkitAppRegion: 'drag',
        }}
      >
        <span>Clui — host window</span>
        <span style={{ fontSize: 11 }}>Phase 0.1 placeholder</span>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 'var(--clui-space-3)',
          padding: 'var(--clui-space-5)',
          textAlign: 'center',
          color: colors.textTertiary,
          fontSize: 13,
          lineHeight: 'var(--clui-line-height-prose, 1.55)' as unknown as number,
        }}
      >
        <div style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 600 }}>
          This window is the new home for the conversation, settings, and card
          board.
        </div>
        <div style={{ maxWidth: 420 }}>
          The pill stays as the always-on-top summon. Non-pill content moves
          here over the next few commits so its shadow + edges no longer bleed
          across the pill's transparent canvas.
        </div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>
          Resize me to any size — clui remembers. Press Ctrl+Alt+H to toggle.
        </div>
      </div>
    </div>
  )
}
