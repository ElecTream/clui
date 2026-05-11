import React, { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, Palette, FileCode, Info, SpinnerGap, FloppyDisk, Check, ArrowSquareOut, ArrowsClockwise, Copy, ArrowUpRight, Keyboard, Sliders } from '@phosphor-icons/react'
import { useColors, useThemeStore, type ThemeMode } from '../theme'
import { useSessionStore } from '../stores/sessionStore'
import type { ClaudeVersionInfo, EffortLevel, ModelInfo } from '../../shared/types'
import {
  BINDINGS,
  type BindingGroup,
  formatBinding,
  normalizeBinding,
  captureBinding,
} from '../keybindings'

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

type Section = 'appearance' | 'defaults' | 'claude' | 'shortcuts' | 'about'

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
            active={section === 'defaults'}
            onClick={() => setSection('defaults')}
            colors={colors}
            icon={<Sliders size={13} />}
            label="Defaults"
          />
          <SidebarItem
            active={section === 'claude'}
            onClick={() => setSection('claude')}
            colors={colors}
            icon={<FileCode size={13} />}
            label="Claude config"
          />
          <SidebarItem
            active={section === 'shortcuts'}
            onClick={() => setSection('shortcuts')}
            colors={colors}
            icon={<Keyboard size={13} />}
            label="Shortcuts"
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
          {section === 'defaults' && <DefaultsSection />}
          {section === 'claude' && <ClaudeConfigSection />}
          {section === 'shortcuts' && <ShortcutsSection />}
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

// ─── Defaults (model + effort) ───

const EFFORT_OPTIONS: ReadonlyArray<{ id: EffortLevel; label: string; hint: string }> = [
  { id: 'low', label: 'Low', hint: 'Quick replies, minimal extended thinking' },
  { id: 'medium', label: 'Medium', hint: 'Balanced — default' },
  { id: 'high', label: 'High', hint: 'Deeper extended thinking budget' },
  { id: 'xhigh', label: 'xHigh', hint: 'Aggressive thinking + edge-case verification' },
  { id: 'max', label: 'Max', hint: 'Reason exhaustively. Uncapped budget' },
]

function DefaultsSection() {
  const colors = useColors()
  const availableModels = useSessionStore((s) => s.availableModels)
  const preferredModel = useSessionStore((s) => s.preferredModel)
  const setPreferredModel = useSessionStore((s) => s.setPreferredModel)
  const preferredEffort = useSessionStore((s) => s.preferredEffort)
  const setPreferredEffort = useSessionStore((s) => s.setPreferredEffort)

  const cliDefault = availableModels.find((m) => m.isDefault) ?? null
  const groupedModels = useGroupedModels(availableModels)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeading colors={colors}>Default model</SectionHeading>
      <div style={{ color: colors.textTertiary, fontSize: 11, lineHeight: 1.5, marginTop: -12 }}>
        New chats and pill input start with this model. Per-tab pickers still override.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <ModelOption
          colors={colors}
          label="Use Claude CLI default"
          description={cliDefault ? `Currently: ${cliDefault.label}` : 'Whichever model the CLI picks'}
          active={preferredModel === null}
          onClick={() => setPreferredModel(null)}
        />
        {groupedModels.map(({ family, models }) => (
          <React.Fragment key={family}>
            <div
              style={{
                color: colors.textTertiary,
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginTop: 6,
                marginBottom: 2,
              }}
            >
              {family}
            </div>
            {models.map((m) => (
              <ModelOption
                key={m.id}
                colors={colors}
                label={m.label}
                description={m.kind === 'alias' ? 'Auto-tracks the latest release' : `Pinned to ${m.id}`}
                active={preferredModel === m.id}
                onClick={() => setPreferredModel(m.id)}
              />
            ))}
          </React.Fragment>
        ))}
      </div>

      <SectionHeading colors={colors}>Default effort</SectionHeading>
      <div style={{ color: colors.textTertiary, fontSize: 11, lineHeight: 1.5, marginTop: -12 }}>
        How aggressive Claude should be with extended thinking. xHigh and Max sit above High and Max for cases that need deep reasoning.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {EFFORT_OPTIONS.map((opt) => (
          <ModelOption
            key={opt.id}
            colors={colors}
            label={opt.label}
            description={opt.hint}
            active={preferredEffort === opt.id}
            onClick={() => setPreferredEffort(opt.id)}
          />
        ))}
      </div>
    </div>
  )
}

function useGroupedModels(models: ModelInfo[]): Array<{ family: string; models: ModelInfo[] }> {
  const families = ['opus', 'sonnet', 'haiku']
  return families
    .map((family) => ({
      family,
      models: models.filter((m) => m.family === family),
    }))
    .filter((g) => g.models.length > 0)
}

function ModelOption({
  colors,
  label,
  description,
  active,
  onClick,
}: {
  colors: ReturnType<typeof useColors>
  label: string
  description: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      data-clui-no-drag="true"
      onClick={onClick}
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
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 500 }}>{label}</div>
        <div
          style={{
            color: colors.textTertiary,
            fontSize: 10,
            marginTop: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {description}
        </div>
      </div>
      {active && <Check size={12} style={{ color: colors.accent, flexShrink: 0 }} />}
    </button>
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

// ─── Shortcuts ───

/**
 * Interactive keybinding viewer + remapper (Phase 0.5b).
 *
 * Bindings are sourced from the registry in src/renderer/keybindings.ts;
 * user overrides live in useThemeStore.keybindings (localStorage). The
 * row's "Edit" button enters capture mode — next non-Esc keypress is
 * normalized via captureBinding() and saved. Esc cancels capture; Reset
 * removes the override so the default applies.
 *
 * Locked bindings (Esc cascade, Space-to-focus, Ctrl+Tab cycling) live
 * in useKeyboardShortcuts.ts and are listed at the bottom for discovery
 * but can't be remapped (their semantics don't fit the generic dispatch).
 */
function ShortcutsSection() {
  const colors = useColors()
  const overrides = useThemeStore((s) => s.keybindings)
  const setKeybinding = useThemeStore((s) => s.setKeybinding)
  const resetKeybinding = useThemeStore((s) => s.resetKeybinding)
  const resetAll = useThemeStore((s) => s.resetAllKeybindings)
  const [capturingId, setCapturingId] = useState<string | null>(null)

  const groupOrder: Array<{ key: BindingGroup; heading: string }> = [
    { key: 'tabs', heading: 'Tabs' },
    { key: 'conversation', heading: 'Conversation' },
    { key: 'overlay', heading: 'Overlay' },
    { key: 'tools', heading: 'Tools & input' },
  ]
  const groups = groupOrder.map((g) => ({
    ...g,
    bindings: BINDINGS.filter((b) => b.group === g.key),
  }))

  // Resolve the active key for a binding (override → default).
  const activeKey = useCallback(
    (id: string): string => overrides[id] || BINDINGS.find((b) => b.id === id)?.defaultKey || '',
    [overrides],
  )

  // Find the binding (if any) currently using this key — for conflict warnings.
  const findConflict = (key: string, ignoreId: string): string | null => {
    if (!key) return null
    for (const b of BINDINGS) {
      if (b.id === ignoreId) continue
      const k = overrides[b.id] || b.defaultKey
      if (normalizeBinding(k) === normalizeBinding(key)) return b.label
    }
    return null
  }

  // Global capture: while a binding is being edited, the next valid keydown
  // saves the new combo. Esc cancels.
  useEffect(() => {
    if (!capturingId) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturingId(null)
        return
      }
      const captured = captureBinding(e)
      if (!captured) return
      // If another binding already uses this combo, clear the conflicting
      // one so the user always sees one source of truth per key.
      for (const b of BINDINGS) {
        if (b.id === capturingId) continue
        const existing = overrides[b.id] || b.defaultKey
        if (normalizeBinding(existing) === captured) {
          // Empty string === "user explicitly cleared this binding".
          setKeybinding(b.id, '')
        }
      }
      setKeybinding(capturingId, captured)
      setCapturingId(null)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [capturingId, overrides, setKeybinding])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 500 }}>Shortcuts</div>
          <div style={{ color: colors.textTertiary, fontSize: 11, marginTop: 3, lineHeight: 1.5 }}>
            Click <strong>Edit</strong> next to any row, then press a new combo.
            Press Esc to cancel. Reset returns a binding to its default.
          </div>
        </div>
        <button
          onClick={resetAll}
          title="Reset every binding to its default"
          style={{
            background: 'transparent',
            border: `1px solid ${colors.containerBorder}`,
            color: colors.textSecondary,
            borderRadius: 'var(--clui-radius-sm, 6px)',
            padding: '5px 10px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Reset all
        </button>
      </div>

      {groups.map((group) => (
        <div key={group.key}>
          <div
            style={{
              color: colors.textTertiary,
              fontSize: 10,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 6,
            }}
          >
            {group.heading}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {group.bindings.map((b) => {
              const current = activeKey(b.id)
              const isCapturing = capturingId === b.id
              const isOverridden = !!overrides[b.id] && overrides[b.id] !== b.defaultKey
              const conflict = isCapturing ? null : findConflict(current, b.id)
              return (
                <div
                  key={b.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: `1px solid ${colors.containerBorder}`,
                    fontSize: 12,
                    gap: 8,
                  }}
                >
                  <span style={{ color: colors.textPrimary, flex: 1, minWidth: 0 }}>
                    {b.label}
                    {conflict && (
                      <span style={{ color: colors.statusError, marginLeft: 8, fontSize: 10 }}>
                        · conflicts with “{conflict}”
                      </span>
                    )}
                  </span>
                  <KbdCapture
                    binding={current}
                    capturing={isCapturing}
                    overridden={isOverridden}
                    cleared={overrides[b.id] === ''}
                    colors={colors}
                  />
                  {isCapturing ? (
                    <button
                      onClick={() => setCapturingId(null)}
                      title="Cancel"
                      style={miniBtn(colors)}
                    >
                      Cancel
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setCapturingId(b.id)}
                        title="Set a new combo"
                        style={miniBtn(colors)}
                      >
                        Edit
                      </button>
                      {isOverridden || overrides[b.id] === '' ? (
                        <button
                          onClick={() => resetKeybinding(b.id)}
                          title="Reset to default"
                          style={miniBtn(colors)}
                        >
                          Reset
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <LockedBindingsList colors={colors} />
    </div>
  )
}

function KbdCapture({
  binding,
  capturing,
  overridden,
  cleared,
  colors,
}: {
  binding: string
  capturing: boolean
  overridden: boolean
  cleared: boolean
  colors: ReturnType<typeof useColors>
}) {
  if (capturing) {
    return (
      <kbd
        style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 11,
          background: colors.accentLight,
          color: colors.accent,
          border: `1px dashed ${colors.accent}`,
          borderRadius: 'var(--clui-radius-sm, 6px)',
          padding: '2px 8px',
          minWidth: 80,
          textAlign: 'center',
        }}
      >
        Press a combo…
      </kbd>
    )
  }
  if (cleared) {
    return (
      <kbd
        style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 11,
          background: 'transparent',
          color: colors.textTertiary,
          border: `1px dashed ${colors.containerBorder}`,
          borderRadius: 'var(--clui-radius-sm, 6px)',
          padding: '2px 8px',
        }}
      >
        unbound
      </kbd>
    )
  }
  return (
    <kbd
      style={{
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 11,
        background: colors.surfaceActive,
        color: overridden ? colors.accent : colors.textSecondary,
        border: `1px solid ${overridden ? colors.accent : colors.containerBorder}`,
        borderRadius: 'var(--clui-radius-sm, 6px)',
        padding: '2px 8px',
      }}
    >
      {formatBinding(binding) || '—'}
    </kbd>
  )
}

function miniBtn(colors: ReturnType<typeof useColors>): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${colors.containerBorder}`,
    color: colors.textSecondary,
    borderRadius: 'var(--clui-radius-sm, 6px)',
    padding: '3px 8px',
    fontSize: 10,
    cursor: 'pointer',
  }
}

function LockedBindingsList({ colors }: { colors: ReturnType<typeof useColors> }) {
  const rows: Array<[string, string]> = [
    ['Esc', 'Cascading dismiss (cancel run → close palette → ...)'],
    ['Space', 'Focus input (when nothing else has focus)'],
    ['Tab', 'Disabled — no focus ring jumps in the pill'],
    ['Shift+Tab', 'Cycle permission mode (ask → auto → plan → ask)'],
  ]
  return (
    <div>
      <div
        style={{
          color: colors.textTertiary,
          fontSize: 10,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 6,
        }}
      >
        Locked
      </div>
      <div style={{ color: colors.textTertiary, fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>
        These have special semantics (focus-aware, cascading, directional) and aren't user-rebindable.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map(([keys, label]) => (
          <div
            key={keys}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '5px 0',
              borderBottom: `1px solid ${colors.containerBorder}`,
              fontSize: 12,
            }}
          >
            <span style={{ color: colors.textPrimary }}>{label}</span>
            <kbd
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 11,
                background: colors.surfaceActive,
                color: colors.textTertiary,
                border: `1px solid ${colors.containerBorder}`,
                borderRadius: 'var(--clui-radius-sm, 6px)',
                padding: '2px 7px',
              }}
            >
              {keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── About ───

function AboutSection() {
  const colors = useColors()
  const staticInfo = useSessionStore((s) => s.staticInfo)
  const cliVersion = useSessionStore((s) => s.cliVersion)
  const availableModels = useSessionStore((s) => s.availableModels)

  // Phase G — fetch installed vs latest CLI version on mount.
  const [versionInfo, setVersionInfo] = useState<ClaudeVersionInfo | null>(null)
  const [versionLoading, setVersionLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)

  const refreshVersion = useCallback(async (force = false) => {
    setVersionLoading(true)
    try {
      const info = await window.clui.checkClaudeVersion?.(force)
      setVersionInfo(info ?? null)
    } catch {
      setVersionInfo(null)
    } finally {
      setVersionLoading(false)
    }
  }, [])

  const onRunUpgrade = useCallback(async () => {
    if (!versionInfo) return
    setUpgradeError(null)
    setUpgrading(true)
    try {
      await window.clui.upgradeClaudeCLI?.(versionInfo.upgradeCommand)
      // Re-check after a short delay so the banner reflects the new
      // version once the install completes. The terminal window
      // continues to run independently — we just refresh our cached
      // value.
      setTimeout(() => refreshVersion(true), 12_000)
    } catch (err: unknown) {
      setUpgradeError(err instanceof Error ? err.message : 'Failed to launch upgrade')
    } finally {
      setUpgrading(false)
    }
  }, [versionInfo, refreshVersion])

  useEffect(() => {
    refreshVersion()
  }, [refreshVersion])

  const onCopyUpgrade = (): void => {
    if (!versionInfo) return
    try {
      navigator.clipboard.writeText(versionInfo.upgradeCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading colors={colors}>clui</SectionHeading>
      <InfoRow colors={colors} label="Version" value={staticInfo?.version || '—'} />
      <InfoRow colors={colors} label="Account" value={staticInfo?.email || 'Not signed in'} />
      <InfoRow colors={colors} label="Subscription" value={staticInfo?.subscriptionType || '—'} />

      <SectionHeading colors={colors}>Claude CLI</SectionHeading>
      <InfoRow colors={colors} label="Detected version" value={cliVersion || versionInfo?.installed || 'Not detected'} />
      <InfoRow
        colors={colors}
        label="Latest on npm"
        value={versionLoading ? 'Checking…' : versionInfo?.latest || 'Unknown'}
      />

      {/* Update available banner */}
      {versionInfo?.updateAvailable && versionInfo.installed && versionInfo.latest && (
        <div
          style={{
            background: colors.accentSoft,
            border: `1px solid ${colors.accentBorder}`,
            borderRadius: 'var(--clui-radius-sm, 6px)',
            padding: 10,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <ArrowUpRight size={14} style={{ color: colors.accent, marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: colors.textPrimary, fontSize: 11, fontWeight: 500 }}>
              Claude CLI update available
            </div>
            <div style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>
              {versionInfo.installed} → {versionInfo.latest}. Update now or run manually:
            </div>
            <div
              style={{
                marginTop: 6,
                background: colors.codeBg,
                borderRadius: 4,
                padding: '4px 8px',
                fontFamily: "'JetBrains Mono', 'Cascadia Mono', ui-monospace, monospace",
                fontSize: 11,
                color: colors.textPrimary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {versionInfo.upgradeCommand}
              </span>
              <button
                data-clui-no-drag="true"
                onClick={onCopyUpgrade}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: colors.accent,
                  cursor: 'pointer',
                  padding: 2,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Copy command"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
              </button>
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                data-clui-no-drag="true"
                onClick={onRunUpgrade}
                disabled={upgrading}
                style={{
                  background: colors.accent,
                  color: colors.textOnAccent,
                  border: 'none',
                  borderRadius: 'var(--clui-radius-sm, 6px)',
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '5px 10px',
                  cursor: upgrading ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
                title="Open a terminal and run the upgrade command"
              >
                <ArrowUpRight size={11} weight="bold" />
                {upgrading ? 'Launching…' : 'Update now'}
              </button>
              {upgradeError && (
                <span style={{ fontSize: 10, color: colors.statusError }}>{upgradeError}</span>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        data-clui-no-drag="true"
        onClick={() => refreshVersion(true)}
        disabled={versionLoading}
        style={{
          alignSelf: 'flex-start',
          background: 'transparent',
          color: colors.textTertiary,
          border: 'none',
          fontSize: 10,
          padding: 0,
          marginTop: -8,
          cursor: versionLoading ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <ArrowsClockwise size={10} className={versionLoading ? 'animate-spin' : undefined} />
        Check again
      </button>

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
