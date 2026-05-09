import React, { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, Palette, FileCode, Info, SpinnerGap, FloppyDisk, Check, ArrowSquareOut } from '@phosphor-icons/react'
import { useColors, useThemeStore, type ThemeMode } from '../theme'
import { useSessionStore } from '../stores/sessionStore'

/**
 * SettingsPanel — Phase F.
 *
 * Separate from the Phase B bridge: this UI manages CLUI-specific config
 * (theme, sound, expanded mode, etc) and exposes the Claude CLI's settings
 * via the bridge as a viewer/editor. Distinct from the upstream `claude
 * config` flow because clui-specific knobs (UI density, themes, future
 * keybindings) shouldn't leak into ~/.claude/settings.json.
 *
 * Open via the Command Palette ("Open settings") — there's no dedicated
 * trigger button yet to keep the pill chrome uncluttered.
 */

type Section = 'appearance' | 'claude' | 'about'

export function SettingsPanel() {
  const open = useSessionStore((s) => s.settingsPanelOpen)
  const setOpen = useSessionStore((s) => s.setSettingsPanelOpen)
  const colors = useColors()
  const [section, setSection] = useState<Section>('appearance')

  if (!open) return null

  return (
    <motion.div
      data-clui-ui
      data-clui-no-drag="true"
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.99 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0.1, 1] }}
      className="glass-surface overflow-hidden"
      style={{
        background: colors.containerBg,
        border: `1px solid ${colors.containerBorder}`,
        borderRadius: 'var(--clui-radius-lg, 14px)',
        boxShadow: colors.containerShadow,
        display: 'flex',
        flexDirection: 'column',
        height: 460,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${colors.containerBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 500 }}>Settings</div>
        <button
          data-clui-no-drag="true"
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.textTertiary,
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body — sidebar + content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div
          style={{
            width: 150,
            borderRight: `1px solid ${colors.containerBorder}`,
            padding: '8px 6px',
            background: colors.surfacePrimary,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <SidebarItem
            active={section === 'appearance'}
            onClick={() => setSection('appearance')}
            colors={colors}
            icon={<Palette size={13} />}
            label="Appearance"
          />
          <SidebarItem
            active={section === 'claude'}
            onClick={() => setSection('claude')}
            colors={colors}
            icon={<FileCode size={13} />}
            label="Claude config"
          />
          <SidebarItem
            active={section === 'about'}
            onClick={() => setSection('about')}
            colors={colors}
            icon={<Info size={13} />}
            label="About"
          />
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 16,
            background: colors.containerBg,
          }}
        >
          {section === 'appearance' && <AppearanceSection />}
          {section === 'claude' && <ClaudeConfigSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </motion.div>
  )
}

function SidebarItem({
  active,
  onClick,
  colors,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  colors: ReturnType<typeof useColors>
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      data-clui-no-drag="true"
      onClick={onClick}
      style={{
        background: active ? colors.surfaceActive : 'transparent',
        color: active ? colors.textPrimary : colors.textSecondary,
        border: 'none',
        borderRadius: 'var(--clui-radius-sm, 6px)',
        padding: '7px 10px',
        fontSize: 12,
        fontWeight: active ? 500 : 400,
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'background var(--clui-state-duration, 120ms) var(--clui-ease-out, ease-out)',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Appearance ───

function AppearanceSection() {
  const colors = useColors()
  const themeMode = useThemeStore((s) => s.themeMode)
  const setThemeMode = useThemeStore((s) => s.setThemeMode)
  const soundEnabled = useThemeStore((s) => s.soundEnabled)
  const setSoundEnabled = useThemeStore((s) => s.setSoundEnabled)
  const expandedUI = useThemeStore((s) => s.expandedUI)
  const setExpandedUI = useThemeStore((s) => s.setExpandedUI)

  const themes: Array<{ id: ThemeMode; label: string; description: string }> = [
    { id: 'dark', label: 'Dark', description: 'Near-black grayscale with claude-orange accent' },
    { id: 'dark-warm', label: 'Dark · warm', description: 'Sepia paper-dark · reading-paper-at-night feel' },
    { id: 'light', label: 'Light', description: 'Warm paper white with claude-orange accent' },
    { id: 'system', label: 'System', description: 'Follow OS dark / light preference' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeading colors={colors}>Theme</SectionHeading>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {themes.map((t) => {
          const active = themeMode === t.id
          return (
            <button
              key={t.id}
              data-clui-no-drag="true"
              onClick={() => setThemeMode(t.id)}
              style={{
                background: active ? colors.surfaceActive : 'transparent',
                border: `1px solid ${active ? colors.accent : colors.containerBorder}`,
                borderRadius: 'var(--clui-radius-sm, 6px)',
                padding: '8px 12px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                transition: 'border-color var(--clui-state-duration, 120ms), background var(--clui-state-duration, 120ms)',
              }}
            >
              <div>
                <div style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 500 }}>{t.label}</div>
                <div style={{ color: colors.textTertiary, fontSize: 10, marginTop: 1 }}>{t.description}</div>
              </div>
              {active && <Check size={12} style={{ color: colors.accent }} />}
            </button>
          )
        })}
      </div>

      <SectionHeading colors={colors}>Behavior</SectionHeading>
      <ToggleRow
        colors={colors}
        label="Sound effects"
        description="Play a soft chime on completion notifications"
        value={soundEnabled}
        onChange={setSoundEnabled}
      />
      <ToggleRow
        colors={colors}
        label="Expanded view"
        description="Default the pill to expanded — Ctrl+E to toggle anytime"
        value={expandedUI}
        onChange={setExpandedUI}
      />
    </div>
  )
}

// ─── Claude config (Phase B bridge viewer) ───

function ClaudeConfigSection() {
  const colors = useColors()
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [draft, setDraft] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await window.clui.readClaudeSettings?.()
      if (s) {
        setSettings(s)
        setDraft(JSON.stringify(s, null, 2))
      } else {
        setSettings({})
        setDraft('{\n}')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Read failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Subscribe to external file changes (Claude CLI editing in another window)
    const off = window.clui.onClaudeSettingsChanged?.((kind) => {
      if (kind === 'settings') load()
    })
    return off
  }, [load])

  const onSave = async () => {
    setError(null)
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(draft)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Settings must be a JSON object')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
      return
    }
    setSaving(true)
    try {
      // writeClaudeSettings does merge-into-existing internally. We pass the
      // full object as the "patch" — anything not in `parsed` will still be
      // dropped because merge with parsed wins. To replace cleanly we'd need
      // the bridge to support a "replace mode" — left for future when the
      // schema is published. For now, treat the textarea as the canonical
      // truth: pre-load includes all existing keys, so saving is round-trip
      // safe.
      const merged = await window.clui.writeClaudeSettings?.(parsed)
      if (merged) setSettings(merged)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const dirty = settings !== null && draft !== JSON.stringify(settings, null, 2)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div>
        <SectionHeading colors={colors}>~/.claude/settings.json</SectionHeading>
        <div style={{ fontSize: 10, color: colors.textTertiary, marginTop: 4, lineHeight: 1.5 }}>
          Direct viewer/editor for the Claude CLI's user settings. Changes round-trip:
          edits here propagate to the CLI; edits the CLI makes show up here within a second.
        </div>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textTertiary, fontSize: 11, gap: 6 }}>
          <SpinnerGap size={12} className="animate-spin" />
          Loading settings…
        </div>
      ) : (
        <>
          <textarea
            data-clui-no-drag="true"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null) }}
            spellCheck={false}
            style={{
              flex: 1,
              background: colors.codeBg,
              color: colors.textPrimary,
              border: `1px solid ${colors.containerBorder}`,
              borderRadius: 'var(--clui-radius-sm, 6px)',
              padding: 10,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', 'Cascadia Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              lineHeight: 1.55,
              resize: 'none',
              outline: 'none',
              minHeight: 200,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 10, color: error ? colors.statusError : colors.textTertiary, flex: 1 }}>
              {error || (saved ? 'Saved.' : dirty ? 'Unsaved changes' : 'In sync')}
            </div>
            <button
              data-clui-no-drag="true"
              onClick={load}
              style={{
                background: 'transparent',
                color: colors.textTertiary,
                border: 'none',
                fontSize: 10,
                padding: '4px 8px',
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
            <button
              data-clui-no-drag="true"
              onClick={onSave}
              disabled={!dirty || saving}
              style={{
                background: dirty ? colors.accent : colors.surfaceHover,
                color: dirty ? colors.textOnAccent : colors.textTertiary,
                border: 'none',
                borderRadius: 'var(--clui-radius-sm, 6px)',
                padding: '5px 12px',
                fontSize: 11,
                cursor: dirty && !saving ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {saved ? <Check size={11} /> : <FloppyDisk size={11} />}
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── About ───

function AboutSection() {
  const colors = useColors()
  const staticInfo = useSessionStore((s) => s.staticInfo)
  const cliVersion = useSessionStore((s) => s.cliVersion)
  const availableModels = useSessionStore((s) => s.availableModels)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading colors={colors}>clui</SectionHeading>
      <InfoRow colors={colors} label="Version" value={staticInfo?.version || '—'} />
      <InfoRow colors={colors} label="Account" value={staticInfo?.email || 'Not signed in'} />
      <InfoRow colors={colors} label="Subscription" value={staticInfo?.subscriptionType || '—'} />

      <SectionHeading colors={colors}>Claude CLI</SectionHeading>
      <InfoRow colors={colors} label="Detected version" value={cliVersion || 'Not detected'} />
      <InfoRow colors={colors} label="Models available" value={`${availableModels.length} (${availableModels.filter((m) => m.kind === 'alias').length} aliases, ${availableModels.filter((m) => m.kind === 'pinned').length} pinned)`} />

      <SectionHeading colors={colors}>Paths</SectionHeading>
      <InfoRow colors={colors} label="Home" value={staticInfo?.homePath || '—'} mono />
      <InfoRow colors={colors} label="Project" value={staticInfo?.projectPath || '—'} mono />

      <a
        href="https://github.com/ElecTream/clui"
        onClick={(e) => {
          e.preventDefault()
          window.clui.openExternal?.('https://github.com/ElecTream/clui')
        }}
        style={{
          color: colors.accent,
          fontSize: 11,
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 8,
          cursor: 'pointer',
        }}
      >
        Source on GitHub <ArrowSquareOut size={11} />
      </a>
    </div>
  )
}

function SectionHeading({ children, colors }: { children: React.ReactNode; colors: ReturnType<typeof useColors> }) {
  return (
    <div
      style={{
        color: colors.textTertiary,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 'var(--clui-letter-spacing-label, 0.02em)',
      }}
    >
      {children}
    </div>
  )
}

function InfoRow({ label, value, colors, mono = false }: { label: string; value: string; colors: ReturnType<typeof useColors>; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, gap: 8 }}>
      <span style={{ color: colors.textTertiary }}>{label}</span>
      <span
        style={{
          color: colors.textPrimary,
          fontFamily: mono ? "'JetBrains Mono', 'Cascadia Mono', ui-monospace, monospace" : undefined,
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '60%',
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

function ToggleRow({
  colors,
  label,
  description,
  value,
  onChange,
}: {
  colors: ReturnType<typeof useColors>
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      data-clui-no-drag="true"
      onClick={() => onChange(!value)}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
        textAlign: 'left',
      }}
    >
      <div>
        <div style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 500 }}>{label}</div>
        <div style={{ color: colors.textTertiary, fontSize: 10, marginTop: 1 }}>{description}</div>
      </div>
      <div
        style={{
          width: 32,
          height: 18,
          background: value ? colors.accent : colors.surfaceHover,
          borderRadius: 9,
          padding: 2,
          display: 'flex',
          justifyContent: value ? 'flex-end' : 'flex-start',
          transition: 'background var(--clui-state-duration, 120ms), justify-content var(--clui-state-duration, 120ms)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            background: '#fff',
            borderRadius: '50%',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            transition: 'all var(--clui-state-duration, 120ms)',
          }}
        />
      </div>
    </button>
  )
}
