/**
 * Clui Design Tokens — Dual theme (dark + light)
 * Colors derived from ChatCN oklch system and design-fixed.html reference.
 */
import { create } from 'zustand'
import type { PreferredTerminalId, TerminalId } from '../shared/types'

// ─── Color palettes ───

const darkColors = {
  // Container (glass surfaces)
  containerBg: '#242422',
  containerBgCollapsed: '#21211e',
  containerBorder: '#3b3b36',
  containerShadow: '0 8px 28px rgba(0, 0, 0, 0.35), 0 1px 6px rgba(0, 0, 0, 0.25)',
  cardShadow: '0 2px 8px rgba(0,0,0,0.35)',
  cardShadowCollapsed: '0 2px 6px rgba(0,0,0,0.4)',

  // Surface layers
  surfacePrimary: '#353530',
  surfaceSecondary: '#42423d',
  surfaceHover: 'rgba(255, 255, 255, 0.05)',
  surfaceActive: 'rgba(255, 255, 255, 0.08)',

  // Input
  inputBg: 'transparent',
  inputBorder: '#3b3b36',
  inputFocusBorder: 'rgba(217, 119, 87, 0.4)',
  inputPillBg: '#2a2a27',

  // Text
  textPrimary: '#ccc9c0',
  textSecondary: '#c0bdb2',
  textTertiary: '#76766e',
  textMuted: '#353530',

  // Accent — orange
  accent: '#d97757',
  accentLight: 'rgba(217, 119, 87, 0.1)',
  accentSoft: 'rgba(217, 119, 87, 0.15)',

  // Status dots
  statusIdle: '#8a8a80',
  statusRunning: '#d97757',
  statusRunningBg: 'rgba(217, 119, 87, 0.1)',
  statusComplete: '#7aac8c',
  statusCompleteBg: 'rgba(122, 172, 140, 0.1)',
  statusError: '#c47060',
  statusErrorBg: 'rgba(196, 112, 96, 0.08)',
  statusDead: '#c47060',
  statusPermission: '#d97757',
  statusPermissionGlow: 'rgba(217, 119, 87, 0.4)',

  // Tab
  tabActive: '#353530',
  tabActiveBorder: '#4a4a45',
  tabInactive: 'transparent',
  tabHover: 'rgba(255, 255, 255, 0.05)',

  // User message bubble
  userBubble: '#353530',
  userBubbleBorder: '#4a4a45',
  userBubbleText: '#ccc9c0',

  // Tool card
  toolBg: '#353530',
  toolBorder: '#4a4a45',
  toolRunningBorder: 'rgba(217, 119, 87, 0.3)',
  toolRunningBg: 'rgba(217, 119, 87, 0.05)',

  // Timeline
  timelineLine: '#353530',
  timelineNode: 'rgba(217, 119, 87, 0.2)',
  timelineNodeActive: '#d97757',

  // Scrollbar
  scrollThumb: 'rgba(255, 255, 255, 0.15)',
  scrollThumbHover: 'rgba(255, 255, 255, 0.25)',

  // Stop button
  stopBg: '#ef4444',
  stopHover: '#dc2626',

  // Send button
  sendBg: '#d97757',
  sendHover: '#c96442',
  sendDisabled: 'rgba(217, 119, 87, 0.3)',

  // Popover
  popoverBg: '#292927',
  popoverBorder: '#3b3b36',
  popoverShadow: '0 4px 20px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.2)',

  // Code block
  codeBg: '#1a1a18',

  // Mic button
  micBg: '#353530',
  micColor: '#c0bdb2',
  micDisabled: '#42423d',

  // Placeholder
  placeholder: '#6b6b60',

  // Disabled button color
  btnDisabled: '#42423d',

  // Text on accent backgrounds
  textOnAccent: '#ffffff',

  // Button hover (CSS-only stack buttons)
  btnHoverColor: '#c0bdb2',
  btnHoverBg: '#302f2d',

  // Accent border variants (replaces hex-alpha concatenation antipattern)
  accentBorder: 'rgba(217, 119, 87, 0.19)',
  accentBorderMedium: 'rgba(217, 119, 87, 0.25)',

  // Permission card (amber)
  permissionBorder: 'rgba(245, 158, 11, 0.3)',
  permissionShadow: '0 2px 12px rgba(245, 158, 11, 0.08)',
  permissionHeaderBg: 'rgba(245, 158, 11, 0.06)',
  permissionHeaderBorder: 'rgba(245, 158, 11, 0.12)',

  // Permission allow (green)
  permissionAllowBg: 'rgba(34, 197, 94, 0.1)',
  permissionAllowHoverBg: 'rgba(34, 197, 94, 0.22)',
  permissionAllowBorder: 'rgba(34, 197, 94, 0.25)',

  // Permission deny (red)
  permissionDenyBg: 'rgba(239, 68, 68, 0.08)',
  permissionDenyHoverBg: 'rgba(239, 68, 68, 0.18)',
  permissionDenyBorder: 'rgba(239, 68, 68, 0.22)',

  // Permission denied card
  permissionDeniedBorder: 'rgba(196, 112, 96, 0.3)',
  permissionDeniedHeaderBorder: 'rgba(196, 112, 96, 0.12)',

  // Diff (Edit tool inline diff)
  diffRemovedBg: 'rgba(248, 81, 73, 0.1)',
  diffAddedBg: 'rgba(63, 185, 80, 0.1)',
} as const

// Warm paper-dark — sepia-tinted dark theme. Reading-paper-at-night feel.
// Keys mirror darkColors exactly so the palette is type-compatible.
const darkWarmColors = {
  // Container (glass surfaces) — sepia paper-dark
  containerBg: '#1c1814',
  containerBgCollapsed: '#181410',
  containerBorder: '#332b22',
  containerShadow: '0 8px 28px rgba(0, 0, 0, 0.4), 0 1px 6px rgba(0, 0, 0, 0.3)',
  cardShadow: '0 2px 8px rgba(0,0,0,0.4)',
  cardShadowCollapsed: '0 2px 6px rgba(0,0,0,0.45)',

  // Surface layers
  surfacePrimary: '#2a221b',
  surfaceSecondary: '#382e25',
  surfaceHover: 'rgba(232, 220, 200, 0.05)',
  surfaceActive: 'rgba(232, 220, 200, 0.08)',

  // Input
  inputBg: 'transparent',
  inputBorder: '#332b22',
  inputFocusBorder: 'rgba(217, 119, 87, 0.45)',
  inputPillBg: '#221c16',

  // Text — warm paper
  textPrimary: '#e8dcc8',
  textSecondary: '#c9bba2',
  textTertiary: '#9b8d77',
  textMuted: '#5a4d3d',

  // Accent — warm orange (slightly more saturated for paper-dark)
  accent: '#e08560',
  accentLight: 'rgba(224, 133, 96, 0.1)',
  accentSoft: 'rgba(224, 133, 96, 0.18)',

  // Status dots
  statusIdle: '#9b8d77',
  statusRunning: '#e08560',
  statusRunningBg: 'rgba(224, 133, 96, 0.1)',
  statusComplete: '#85b894',
  statusCompleteBg: 'rgba(133, 184, 148, 0.1)',
  statusError: '#d18271',
  statusErrorBg: 'rgba(209, 130, 113, 0.08)',
  statusDead: '#d18271',
  statusPermission: '#e08560',
  statusPermissionGlow: 'rgba(224, 133, 96, 0.4)',

  // Tab
  tabActive: '#2a221b',
  tabActiveBorder: '#3d3128',
  tabInactive: 'transparent',
  tabHover: 'rgba(232, 220, 200, 0.05)',

  // User message bubble
  userBubble: '#2a221b',
  userBubbleBorder: '#3d3128',
  userBubbleText: '#e8dcc8',

  // Tool card
  toolBg: '#2a221b',
  toolBorder: '#3d3128',
  toolRunningBorder: 'rgba(224, 133, 96, 0.3)',
  toolRunningBg: 'rgba(224, 133, 96, 0.05)',

  // Timeline
  timelineLine: '#2a221b',
  timelineNode: 'rgba(224, 133, 96, 0.2)',
  timelineNodeActive: '#e08560',

  // Scrollbar
  scrollThumb: 'rgba(232, 220, 200, 0.15)',
  scrollThumbHover: 'rgba(232, 220, 200, 0.25)',

  // Stop button
  stopBg: '#ef4444',
  stopHover: '#dc2626',

  // Send button
  sendBg: '#e08560',
  sendHover: '#cc6f4a',
  sendDisabled: 'rgba(224, 133, 96, 0.3)',

  // Popover
  popoverBg: '#231d17',
  popoverBorder: '#332b22',
  popoverShadow: '0 4px 20px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.25)',

  // Code block
  codeBg: '#15110d',

  // Mic button
  micBg: '#2a221b',
  micColor: '#c9bba2',
  micDisabled: '#382e25',

  // Placeholder
  placeholder: '#7a6c5a',

  // Disabled button color
  btnDisabled: '#382e25',

  // Text on accent backgrounds
  textOnAccent: '#ffffff',

  // Button hover (CSS-only stack buttons)
  btnHoverColor: '#c9bba2',
  btnHoverBg: '#2e2620',

  // Accent border variants
  accentBorder: 'rgba(224, 133, 96, 0.19)',
  accentBorderMedium: 'rgba(224, 133, 96, 0.28)',

  // Permission card (amber)
  permissionBorder: 'rgba(245, 158, 11, 0.32)',
  permissionShadow: '0 2px 12px rgba(245, 158, 11, 0.1)',
  permissionHeaderBg: 'rgba(245, 158, 11, 0.07)',
  permissionHeaderBorder: 'rgba(245, 158, 11, 0.14)',

  // Permission allow (green)
  permissionAllowBg: 'rgba(34, 197, 94, 0.1)',
  permissionAllowHoverBg: 'rgba(34, 197, 94, 0.22)',
  permissionAllowBorder: 'rgba(34, 197, 94, 0.25)',

  // Permission deny (red)
  permissionDenyBg: 'rgba(239, 68, 68, 0.08)',
  permissionDenyHoverBg: 'rgba(239, 68, 68, 0.18)',
  permissionDenyBorder: 'rgba(239, 68, 68, 0.22)',

  // Permission denied card
  permissionDeniedBorder: 'rgba(209, 130, 113, 0.3)',
  permissionDeniedHeaderBorder: 'rgba(209, 130, 113, 0.12)',

  // Diff (Edit tool inline diff)
  diffRemovedBg: 'rgba(248, 81, 73, 0.1)',
  diffAddedBg: 'rgba(63, 185, 80, 0.1)',
} as const

const lightColors = {
  // Container (glass surfaces)
  containerBg: '#f9f8f5',
  containerBgCollapsed: '#f4f2ed',
  containerBorder: '#dddad2',
  containerShadow: '0 8px 28px rgba(0, 0, 0, 0.08), 0 1px 6px rgba(0, 0, 0, 0.04)',
  cardShadow: '0 2px 8px rgba(0,0,0,0.06)',
  cardShadowCollapsed: '0 2px 6px rgba(0,0,0,0.08)',

  // Surface layers
  surfacePrimary: '#edeae0',
  surfaceSecondary: '#dddad2',
  surfaceHover: 'rgba(0, 0, 0, 0.04)',
  surfaceActive: 'rgba(0, 0, 0, 0.06)',

  // Input
  inputBg: 'transparent',
  inputBorder: '#dddad2',
  inputFocusBorder: 'rgba(217, 119, 87, 0.4)',
  inputPillBg: '#ffffff',

  // Text
  textPrimary: '#3c3929',
  textSecondary: '#5a5749',
  textTertiary: '#8a8a80',
  textMuted: '#dddad2',

  // Accent — orange (same)
  accent: '#d97757',
  accentLight: 'rgba(217, 119, 87, 0.1)',
  accentSoft: 'rgba(217, 119, 87, 0.12)',

  // Status dots
  statusIdle: '#8a8a80',
  statusRunning: '#d97757',
  statusRunningBg: 'rgba(217, 119, 87, 0.1)',
  statusComplete: '#5a9e6f',
  statusCompleteBg: 'rgba(90, 158, 111, 0.1)',
  statusError: '#c47060',
  statusErrorBg: 'rgba(196, 112, 96, 0.06)',
  statusDead: '#c47060',
  statusPermission: '#d97757',
  statusPermissionGlow: 'rgba(217, 119, 87, 0.3)',

  // Tab
  tabActive: '#edeae0',
  tabActiveBorder: '#dddad2',
  tabInactive: 'transparent',
  tabHover: 'rgba(0, 0, 0, 0.04)',

  // User message bubble
  userBubble: '#edeae0',
  userBubbleBorder: '#dddad2',
  userBubbleText: '#3c3929',

  // Tool card
  toolBg: '#edeae0',
  toolBorder: '#dddad2',
  toolRunningBorder: 'rgba(217, 119, 87, 0.3)',
  toolRunningBg: 'rgba(217, 119, 87, 0.05)',

  // Timeline
  timelineLine: '#dddad2',
  timelineNode: 'rgba(217, 119, 87, 0.2)',
  timelineNodeActive: '#d97757',

  // Scrollbar
  scrollThumb: 'rgba(0, 0, 0, 0.1)',
  scrollThumbHover: 'rgba(0, 0, 0, 0.18)',

  // Stop button
  stopBg: '#ef4444',
  stopHover: '#dc2626',

  // Send button
  sendBg: '#d97757',
  sendHover: '#c96442',
  sendDisabled: 'rgba(217, 119, 87, 0.3)',

  // Popover
  popoverBg: '#f9f8f5',
  popoverBorder: '#dddad2',
  popoverShadow: '0 4px 20px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',

  // Code block
  codeBg: '#f0eee8',

  // Mic button
  micBg: '#edeae0',
  micColor: '#5a5749',
  micDisabled: '#c8c5bc',

  // Placeholder
  placeholder: '#b0ada4',

  // Disabled button color
  btnDisabled: '#c8c5bc',

  // Text on accent backgrounds
  textOnAccent: '#ffffff',

  // Button hover (CSS-only stack buttons)
  btnHoverColor: '#3c3929',
  btnHoverBg: '#edeae0',

  // Accent border variants (replaces hex-alpha concatenation antipattern)
  accentBorder: 'rgba(217, 119, 87, 0.19)',
  accentBorderMedium: 'rgba(217, 119, 87, 0.25)',

  // Permission card (amber)
  permissionBorder: 'rgba(245, 158, 11, 0.3)',
  permissionShadow: '0 2px 12px rgba(245, 158, 11, 0.08)',
  permissionHeaderBg: 'rgba(245, 158, 11, 0.06)',
  permissionHeaderBorder: 'rgba(245, 158, 11, 0.12)',

  // Permission allow (green)
  permissionAllowBg: 'rgba(34, 197, 94, 0.1)',
  permissionAllowHoverBg: 'rgba(34, 197, 94, 0.22)',
  permissionAllowBorder: 'rgba(34, 197, 94, 0.25)',

  // Permission deny (red)
  permissionDenyBg: 'rgba(239, 68, 68, 0.08)',
  permissionDenyHoverBg: 'rgba(239, 68, 68, 0.18)',
  permissionDenyBorder: 'rgba(239, 68, 68, 0.22)',

  // Permission denied card
  permissionDeniedBorder: 'rgba(196, 112, 96, 0.3)',
  permissionDeniedHeaderBorder: 'rgba(196, 112, 96, 0.12)',

  // Diff (Edit tool inline diff)
  diffRemovedBg: 'rgba(248, 81, 73, 0.15)',
  diffAddedBg: 'rgba(63, 185, 80, 0.15)',
} as const

export type ColorPalette = { [K in keyof typeof darkColors]: string }

// ─── Theme store ───

/**
 * Theme variants — three concrete palettes plus 'system' to follow OS.
 *  - 'dark'      → near-black grayscale with claude-orange accent (default)
 *  - 'dark-warm' → warm paper-dark (sepia-tinted) for a reading-paper-at-night feel
 *  - 'light'     → warm paper white (cream beige) for daytime
 *  - 'system'    → follow OS dark/light; resolves to 'dark' or 'light'
 */
export type ThemeMode = 'system' | 'light' | 'dark' | 'dark-warm'

function isTerminalId(value: unknown): value is TerminalId {
  return typeof value === 'string' && value.trim().length > 0
}

interface ThemeState {
  isDark: boolean
  themeMode: ThemeMode
  soundEnabled: boolean
  expandedUI: boolean
  preferredTerminalId: PreferredTerminalId
  /** OS-reported dark mode — used when themeMode is 'system' */
  _systemIsDark: boolean
  setIsDark: (isDark: boolean) => void
  setThemeMode: (mode: ThemeMode) => void
  setSoundEnabled: (enabled: boolean) => void
  setExpandedUI: (expanded: boolean) => void
  setPreferredTerminalId: (terminalId: PreferredTerminalId) => void
  /** Called by OS theme change listener — updates system value */
  setSystemTheme: (isDark: boolean) => void
  /** Auto-update state */
  updateVersion: string | null
  updateReady: boolean
  setUpdateAvailable: (version: string) => void
  setUpdateReady: (version: string) => void
}

/** Convert camelCase token name to --clui-kebab-case CSS custom property */
function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

/**
 * Static design-system tokens (Phase 0.0) — emitted once at startup.
 * These do NOT vary by theme; only color tokens swap on theme change.
 */
const STATIC_TOKENS: Record<string, string> = {
  // Spacing scale
  '--clui-space-1': '4px',
  '--clui-space-2': '8px',
  '--clui-space-3': '12px',
  '--clui-space-4': '16px',
  '--clui-space-5': '24px',
  '--clui-space-6': '32px',
  // Radius scale (buttons → panels → modals)
  '--clui-radius-sm': '6px',
  '--clui-radius-md': '10px',
  '--clui-radius-lg': '14px',
  // Hit-zone minimum (Phase 0.3)
  '--clui-hit-zone': '28px',
  // Typography — body weight 450 (between 400 default and 500 semibold)
  '--clui-font-weight-body': '450',
  '--clui-font-weight-emphasis': '600',
  '--clui-letter-spacing-body': '-0.005em',
  '--clui-letter-spacing-label': '0.02em',
  '--clui-line-height-prose': '1.55',
  '--clui-line-height-ui': '1.4',
  // Motion (locked timings)
  '--clui-ease-out': 'cubic-bezier(0.2, 0, 0.1, 1)',
  '--clui-state-duration': '120ms',
  '--clui-reveal-duration': '180ms',
  '--clui-dismiss-duration': '140ms',
  '--clui-tether-spring-stiffness': '220',
  '--clui-tether-spring-damping': '28',
}

let staticTokensApplied = false

function applyStaticTokens(): void {
  if (staticTokensApplied) return
  const style = document.documentElement.style
  for (const [key, value] of Object.entries(STATIC_TOKENS)) {
    style.setProperty(key, value)
  }
  staticTokensApplied = true
}

/** Sync all JS design tokens to CSS custom properties on :root */
function syncTokensToCss(tokens: ColorPalette): void {
  applyStaticTokens()
  const style = document.documentElement.style
  for (const [key, value] of Object.entries(tokens)) {
    style.setProperty(`--clui-${camelToKebab(key)}`, value)
  }
}

/**
 * Pick the active palette for a given resolved theme variant.
 * `variant` is the concrete variant ('dark' | 'dark-warm' | 'light'), already
 * resolved from 'system'.
 */
function paletteForVariant(variant: 'dark' | 'dark-warm' | 'light'): ColorPalette {
  if (variant === 'dark-warm') return darkWarmColors
  if (variant === 'light') return lightColors
  return darkColors
}

function applyTheme(variant: 'dark' | 'dark-warm' | 'light'): void {
  const isDark = variant !== 'light'
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.classList.toggle('light', !isDark)
  // Set data-theme attribute for fine-grained variant-aware CSS rules
  document.documentElement.setAttribute('data-theme', variant)
  syncTokensToCss(paletteForVariant(variant))
}

const SETTINGS_KEY = 'clui-settings'

function loadSettings(): { themeMode: ThemeMode; soundEnabled: boolean; expandedUI: boolean; preferredTerminalId: PreferredTerminalId } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        // Accept the full ThemeMode union; fall back to 'dark' for unknown values
        themeMode: ['system', 'light', 'dark', 'dark-warm'].includes(parsed.themeMode) ? parsed.themeMode : 'dark',
        soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
        expandedUI: typeof parsed.expandedUI === 'boolean' ? parsed.expandedUI : false,
        preferredTerminalId: parsed.preferredTerminalId === 'auto' || isTerminalId(parsed.preferredTerminalId)
          ? parsed.preferredTerminalId
          : 'auto',
      }
    }
  } catch {}
  return { themeMode: 'dark', soundEnabled: true, expandedUI: false, preferredTerminalId: 'auto' }
}

function saveSettings(s: { themeMode: ThemeMode; soundEnabled: boolean; expandedUI: boolean; preferredTerminalId: PreferredTerminalId }): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

const saved = loadSettings()

/** Resolve a ThemeMode (which may be 'system') to a concrete variant. */
function resolveVariant(mode: ThemeMode, systemIsDark: boolean): 'dark' | 'dark-warm' | 'light' {
  if (mode === 'system') return systemIsDark ? 'dark' : 'light'
  if (mode === 'dark-warm') return 'dark-warm'
  if (mode === 'light') return 'light'
  return 'dark'
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: saved.themeMode !== 'light',
  themeMode: saved.themeMode,
  soundEnabled: saved.soundEnabled,
  expandedUI: saved.expandedUI,
  preferredTerminalId: saved.preferredTerminalId,
  _systemIsDark: true,
  setIsDark: (isDark) => {
    // Legacy two-way toggle — maps to dark/light variants only.
    set({ isDark })
    applyTheme(isDark ? 'dark' : 'light')
  },
  setThemeMode: (mode) => {
    const variant = resolveVariant(mode, get()._systemIsDark)
    const isDark = variant !== 'light'
    set({ themeMode: mode, isDark })
    applyTheme(variant)
    saveSettings({ themeMode: mode, soundEnabled: get().soundEnabled, expandedUI: get().expandedUI, preferredTerminalId: get().preferredTerminalId })
  },
  setSoundEnabled: (enabled) => {
    set({ soundEnabled: enabled })
    saveSettings({ themeMode: get().themeMode, soundEnabled: enabled, expandedUI: get().expandedUI, preferredTerminalId: get().preferredTerminalId })
  },
  setExpandedUI: (expanded) => {
    set({ expandedUI: expanded })
    saveSettings({ themeMode: get().themeMode, soundEnabled: get().soundEnabled, expandedUI: expanded, preferredTerminalId: get().preferredTerminalId })
  },
  setPreferredTerminalId: (terminalId) => {
    set({ preferredTerminalId: terminalId })
    saveSettings({ themeMode: get().themeMode, soundEnabled: get().soundEnabled, expandedUI: get().expandedUI, preferredTerminalId: terminalId })
  },
  setSystemTheme: (isDark) => {
    set({ _systemIsDark: isDark })
    // Only apply if following system
    if (get().themeMode === 'system') {
      set({ isDark })
      applyTheme(isDark ? 'dark' : 'light')
    }
  },
  updateVersion: null,
  updateReady: false,
  setUpdateAvailable: (version) => set({ updateVersion: version }),
  setUpdateReady: (version) => set({ updateVersion: version, updateReady: true }),
}))

// Initialize CSS vars with saved theme — resolve 'system' lazily after OS reports.
const initialVariant: 'dark' | 'dark-warm' | 'light' =
  saved.themeMode === 'light' ? 'light'
  : saved.themeMode === 'dark-warm' ? 'dark-warm'
  : 'dark'
applyTheme(initialVariant)

/** Reactive hook — returns the active color palette based on themeMode + system dark. */
export function useColors(): ColorPalette {
  const themeMode = useThemeStore((s) => s.themeMode)
  const systemIsDark = useThemeStore((s) => s._systemIsDark)
  const variant = resolveVariant(themeMode, systemIsDark)
  return paletteForVariant(variant)
}

/** Non-reactive getter — use outside React components */
export function getColors(isDark: boolean): ColorPalette {
  return isDark ? darkColors : lightColors
}

// ─── Backward compatibility ───
// Legacy static export — components being migrated should use useColors() instead
export const colors = darkColors

// ─── Spacing ───

export const spacing = {
  contentWidth: 460,
  containerRadius: 20,
  containerPadding: 12,
  tabHeight: 32,
  inputMinHeight: 44,
  inputMaxHeight: 160,
  conversationMaxHeight: 380,
  pillRadius: 9999,
  circleSize: 36,
  circleGap: 8,
} as const

// ─── Animation ───
// Locked timings from Phase 0.0 design language. Use these everywhere instead
// of ad-hoc duration/easing literals so motion stays coherent across the app.

export const motion = {
  /** Tethered-panel spring (Phase 0.1). Settles ~250ms with no overshoot. */
  spring: { type: 'spring' as const, stiffness: 220, damping: 28, mass: 1 },
  /** Legacy fast spring — kept for back-compat with existing call sites that don't want overshoot. */
  springFast: { type: 'spring' as const, stiffness: 500, damping: 30 },
  /** State transitions: hover, focus, color, opacity. */
  state: { duration: 0.12, ease: [0.2, 0, 0.1, 1] as const },
  /** Reveal/dismiss: palettes, modals, settings. Subtle 4px Y-translate from below. */
  reveal: { duration: 0.18, ease: [0.2, 0, 0.1, 1] as const },
  dismiss: { duration: 0.14, ease: [0.2, 0, 0.1, 1] as const },
  /** Standard ease-out for ad-hoc animations. */
  easeOut: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const },
  /** Fade-in preset for AnimatePresence children. */
  fadeIn: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    transition: { duration: 0.15 },
  },
} as const
