import React from 'react'
import { Archive, Warning } from '@phosphor-icons/react'
import type { ColorPalette } from '../theme'
import { useSessionStore } from '../stores/sessionStore'

/**
 * CompactConfirmCard — Phase C (native /compact UI).
 *
 * Shows current token usage from the most recent run + a "Compact now" button
 * that sends "/compact" through the normal message channel (the CLI handles
 * the actual compaction). Dismissed if user clicks elsewhere; the card stays
 * static in conversation history.
 */
interface CompactData {
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheCreate: number
  totalCostUsd: number | null
  turns: number
  hasData: boolean
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

export function CompactConfirmCard({ data, colors }: { data: CompactData; colors: ColorPalette }) {
  const sendMessage = useSessionStore((s) => s.sendMessage)

  const onCompact = (): void => {
    // Pass /compact through to the CLI as a normal user message.
    sendMessage('/compact')
  }

  // Approximate context fill from output tokens since the last full run.
  // Most Claude models are 200k context; we're generous and assume that as
  // the denominator until ContextEvent gives us the real cap.
  const ASSUMED_CONTEXT = 200_000
  const used = data.inputTokens + data.outputTokens + data.cacheRead + data.cacheCreate
  const pctRaw = data.hasData ? Math.min(100, Math.round((used / ASSUMED_CONTEXT) * 100)) : 0

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
        <Archive size={14} style={{ color: colors.textSecondary }} />
        <span style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 500 }}>Compact conversation?</span>
      </div>

      <div style={{ padding: 12 }}>
        {data.hasData ? (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                fontSize: 11,
                marginBottom: 10,
              }}
            >
              <Stat label="Input" value={fmt(data.inputTokens)} colors={colors} />
              <Stat label="Output" value={fmt(data.outputTokens)} colors={colors} />
              <Stat label="Cache read" value={fmt(data.cacheRead)} colors={colors} />
              <Stat label="Cache create" value={fmt(data.cacheCreate)} colors={colors} />
              <Stat label="Turns" value={String(data.turns)} colors={colors} />
              <Stat
                label="Cost"
                value={data.totalCostUsd !== null ? `$${data.totalCostUsd.toFixed(4)}` : '—'}
                colors={colors}
              />
            </div>

            {/* Context usage bar */}
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  color: colors.textTertiary,
                  marginBottom: 4,
                }}
              >
                <span>Context (~{ASSUMED_CONTEXT.toLocaleString()} budget)</span>
                <span>{pctRaw}%</span>
              </div>
              <div
                style={{
                  height: 4,
                  background: colors.surfaceHover,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pctRaw}%`,
                    background: pctRaw > 80 ? colors.statusError : pctRaw > 50 ? colors.accent : colors.statusComplete,
                    transition: 'width 200ms var(--clui-ease-out, ease-out)',
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: colors.textTertiary,
              padding: '4px 0 10px',
            }}
          >
            <Warning size={12} />
            No usage data yet for this session.
          </div>
        )}

        <div style={{ fontSize: 10, color: colors.textTertiary, lineHeight: 1.5, marginBottom: 10 }}>
          Compacting summarizes earlier turns into a compact context, freeing room for more.
          You won't lose history — Claude keeps the summary.
        </div>

        <button
          onClick={onCompact}
          data-clui-no-drag="true"
          style={{
            background: colors.accent,
            color: colors.textOnAccent,
            border: 'none',
            borderRadius: 'var(--clui-radius-sm, 6px)',
            padding: '6px 14px',
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'background var(--clui-state-duration, 120ms) var(--clui-ease-out, ease-out)',
          }}
        >
          <Archive size={11} />
          Compact now
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, colors }: { label: string; value: string; colors: ColorPalette }) {
  return (
    <div>
      <div style={{ color: colors.textTertiary, fontSize: 10 }}>{label}</div>
      <div style={{ color: colors.textPrimary, fontSize: 12, fontFeatureSettings: '"tnum"' }}>{value}</div>
    </div>
  )
}
