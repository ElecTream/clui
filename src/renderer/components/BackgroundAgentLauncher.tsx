import React, { useState } from 'react'
import { Robot, Play, Warning } from '@phosphor-icons/react'
import type { ColorPalette } from '../theme'
import type { BackgroundAgentRecord } from '../../shared/types'

/**
 * BackgroundAgentLauncher — Phase E (goal-driven autonomous work).
 *
 * Renders an in-conversation card with goal + budget inputs. On submit,
 * calls window.clui.startBackgroundAgent which sets the tab status to
 * 'background' and runs the goal in the background with a wall-clock
 * watchdog enforcing the budget.
 *
 * The card is triggered by `/background` typed in InputBar — see
 * InputBar.tsx where the __BACKGROUND_LAUNCHER__ sentinel is emitted.
 */

interface LauncherData {
  tabId: string | null
  projectPath: string
}

const DEFAULT_MAX_TURNS = 25
const DEFAULT_MAX_WALL_CLOCK_MIN = 30

export function BackgroundAgentLauncher({ data, colors }: { data: LauncherData; colors: ColorPalette }) {
  const [goal, setGoal] = useState('')
  const [maxTurns, setMaxTurns] = useState(DEFAULT_MAX_TURNS)
  const [maxWallClockMin, setMaxWallClockMin] = useState(DEFAULT_MAX_WALL_CLOCK_MIN)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BackgroundAgentRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !!goal.trim() && maxTurns > 0 && maxWallClockMin > 0 && !!data.tabId && !busy

  const onLaunch = async (): Promise<void> => {
    if (!data.tabId) {
      setError('No active tab — start a chat first.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const record = await window.clui.startBackgroundAgent?.({
        tabId: data.tabId,
        goal: goal.trim(),
        maxTurns,
        maxWallClockMs: maxWallClockMin * 60_000,
        projectPath: data.projectPath || '~',
      })
      if (!record) throw new Error('Background-agent bridge not available')
      setResult(record)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Launch failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-clui-no-drag="true"
      style={{
        background: colors.surfacePrimary,
        border: `1px solid ${colors.containerBorder}`,
        borderRadius: 'var(--clui-radius-md, 10px)',
        overflow: 'hidden',
        margin: '4px 0',
        maxWidth: '100%',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${colors.containerBorder}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: colors.surfaceHover,
        }}
      >
        <Robot size={14} style={{ color: colors.textSecondary }} />
        <span style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 500 }}>Background agent</span>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {result ? (
          <div style={{ fontSize: 12, color: colors.textPrimary }}>
            Started — running in the background. Status:{' '}
            <strong>{result.status}</strong>. Watch the tab status pill or this card for completion.
          </div>
        ) : (
          <>
            <Field label="Goal" colors={colors} hint="What should the agent do? Be specific.">
              <textarea
                data-clui-no-drag="true"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Refactor src/components/Foo.tsx to use the new hooks layer."
                rows={3}
                spellCheck={false}
                style={textareaStyle(colors)}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Max turns" colors={colors} hint="Hard cap on agent iterations.">
                <input
                  data-clui-no-drag="true"
                  type="number"
                  min={1}
                  max={500}
                  value={maxTurns}
                  onChange={(e) => setMaxTurns(Number(e.target.value) || DEFAULT_MAX_TURNS)}
                  style={inputStyle(colors)}
                />
              </Field>
              <Field label="Wall-clock cap (min)" colors={colors} hint="Watchdog kills run if exceeded.">
                <input
                  data-clui-no-drag="true"
                  type="number"
                  min={1}
                  max={360}
                  value={maxWallClockMin}
                  onChange={(e) => setMaxWallClockMin(Number(e.target.value) || DEFAULT_MAX_WALL_CLOCK_MIN)}
                  style={inputStyle(colors)}
                />
              </Field>
            </div>

            {error && (
              <div style={{ fontSize: 11, color: colors.statusError, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Warning size={11} />
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                data-clui-no-drag="true"
                onClick={onLaunch}
                disabled={!canSubmit}
                style={{
                  background: canSubmit ? colors.accent : colors.surfaceHover,
                  color: canSubmit ? colors.textOnAccent : colors.textTertiary,
                  border: 'none',
                  borderRadius: 'var(--clui-radius-sm, 6px)',
                  fontSize: 11,
                  padding: '6px 14px',
                  cursor: canSubmit ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Play size={11} weight="fill" />
                {busy ? 'Launching…' : 'Launch'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  colors,
  children,
}: {
  label: string
  hint?: string
  colors: ColorPalette
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: colors.textTertiary,
          marginBottom: 3,
        }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>{hint}</span>
      )}
    </div>
  )
}

function inputStyle(colors: ColorPalette): React.CSSProperties {
  return {
    background: colors.inputPillBg,
    color: colors.textPrimary,
    border: `1px solid ${colors.containerBorder}`,
    borderRadius: 'var(--clui-radius-sm, 6px)',
    padding: '5px 8px',
    fontSize: 12,
    outline: 'none',
  }
}

function textareaStyle(colors: ColorPalette): React.CSSProperties {
  return {
    ...inputStyle(colors),
    fontFamily:
      "'JetBrains Mono', 'Cascadia Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    lineHeight: 1.55,
    resize: 'vertical',
  }
}
