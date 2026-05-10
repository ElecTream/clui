import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkle, ArrowRight, Check, X, ArrowSquareOut } from '@phosphor-icons/react'
import { useColors } from '../theme'

/**
 * OnboardingModal — Phase I (first-launch flow).
 *
 * Renders once on first run if the Claude CLI isn't detected. Offers
 * a one-click install via the same Phase G upgrade path (opens the
 * user's default terminal and runs `npm i -g @anthropic-ai/claude-code`).
 * "I'll set it up later" dismisses; "Install" launches the terminal.
 *
 * Persisted via localStorage — once dismissed (or skipped because the
 * CLI is already installed) this never shows again. Reset by clearing
 * `clui:onboarded` in localStorage.
 */

const STORAGE_KEY = 'clui:onboarded'

export function OnboardingModal() {
  const colors = useColors()
  const [show, setShow] = useState(false)
  const [step, setStep] = useState<'welcome' | 'install-claude' | 'launching'>('welcome')
  const [installError, setInstallError] = useState<string | null>(null)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return
    let alive = true

    void (async () => {
      try {
        const info = await window.clui.checkClaudeVersion?.()
        if (!alive) return
        if (info?.installed) {
          // Already set up — record and don't show.
          localStorage.setItem(STORAGE_KEY, '1')
          return
        }
        setShow(true)
      } catch {
        if (alive) setShow(true)
      }
    })()

    return () => { alive = false }
  }, [])

  const dismiss = (): void => {
    localStorage.setItem(STORAGE_KEY, '1')
    setShow(false)
  }

  const onInstall = async (): Promise<void> => {
    setInstallError(null)
    setStep('launching')
    try {
      await window.clui.upgradeClaudeCLI?.('npm install -g @anthropic-ai/claude-code')
      // Don't dismiss yet — let the user verify in the new terminal,
      // then they can close this themselves.
    } catch (err: unknown) {
      setInstallError(err instanceof Error ? err.message : 'Failed to launch installer')
      setStep('install-claude')
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          data-clui-ui
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            pointerEvents: 'auto',
          }}
        >
          <motion.div
            data-clui-no-drag="true"
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0.1, 1] }}
            style={{
              width: 460,
              maxWidth: 'calc(100vw - 32px)',
              background: colors.containerBg,
              border: `1px solid ${colors.containerBorder}`,
              borderRadius: 'var(--clui-radius-lg, 14px)',
              boxShadow: colors.containerShadow,
              padding: 22,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sparkle size={18} style={{ color: colors.accent }} weight="fill" />
              <div style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 600 }}>
                Welcome to clui
              </div>
              <button
                onClick={dismiss}
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: 'none',
                  color: colors.textTertiary,
                  cursor: 'pointer',
                  padding: 4,
                }}
                title="Skip"
              >
                <X size={14} />
              </button>
            </div>

            {step === 'welcome' && (
              <>
                <div style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 1.55 }}>
                  clui is an always-on-top overlay for Claude Code on Windows.
                  Hit <Kbd colors={colors}>Ctrl+Alt+C</Kbd> from anywhere to summon
                  the pill, or click the tray icon. Conversations live in the
                  hub (toggle with <Kbd colors={colors}>Ctrl+Alt+H</Kbd>).
                </div>
                <div style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 1.55 }}>
                  We didn't find the Claude CLI on your PATH. clui drives the
                  CLI behind the scenes — let's install it.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={dismiss}
                    style={secondaryBtnStyle(colors)}
                  >
                    I'll set it up later
                  </button>
                  <button
                    onClick={() => setStep('install-claude')}
                    style={primaryBtnStyle(colors)}
                  >
                    Continue
                    <ArrowRight size={11} />
                  </button>
                </div>
              </>
            )}

            {step === 'install-claude' && (
              <>
                <div style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 1.55 }}>
                  Click <strong>Install</strong> below — clui opens a terminal
                  window and runs:
                </div>
                <div
                  style={{
                    background: colors.codeBg,
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 12,
                    color: colors.textPrimary,
                  }}
                >
                  npm install -g @anthropic-ai/claude-code
                </div>
                <div style={{ color: colors.textTertiary, fontSize: 11, lineHeight: 1.55 }}>
                  Your default terminal app handles the install — you'll see
                  npm progress + any auth prompts. Close that window when it's
                  done; clui will pick up the CLI on next prompt.
                </div>
                {installError && (
                  <div style={{ fontSize: 11, color: colors.statusError }}>{installError}</div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
                  <button onClick={dismiss} style={secondaryBtnStyle(colors)}>
                    Skip
                  </button>
                  <button onClick={onInstall} style={primaryBtnStyle(colors)}>
                    <ArrowSquareOut size={11} />
                    Install
                  </button>
                </div>
              </>
            )}

            {step === 'launching' && (
              <>
                <div style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 1.55 }}>
                  <Check size={14} style={{ color: colors.accent, verticalAlign: 'middle', marginRight: 6 }} />
                  Installer launched in a terminal window. When it finishes,
                  you can close this and start using clui.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
                  <button onClick={dismiss} style={primaryBtnStyle(colors)}>
                    Done
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Kbd({ children, colors }: { children: React.ReactNode; colors: ReturnType<typeof useColors> }) {
  return (
    <span
      style={{
        background: colors.surfaceHover,
        border: `1px solid ${colors.containerBorder}`,
        borderRadius: 4,
        padding: '1px 5px',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 10,
        color: colors.textPrimary,
      }}
    >
      {children}
    </span>
  )
}

function primaryBtnStyle(colors: ReturnType<typeof useColors>): React.CSSProperties {
  return {
    background: colors.accent,
    color: colors.textOnAccent,
    border: 'none',
    borderRadius: 'var(--clui-radius-sm, 6px)',
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  }
}

function secondaryBtnStyle(colors: ReturnType<typeof useColors>): React.CSSProperties {
  return {
    background: 'transparent',
    color: colors.textSecondary,
    border: `1px solid ${colors.containerBorder}`,
    borderRadius: 'var(--clui-radius-sm, 6px)',
    padding: '6px 14px',
    fontSize: 12,
    cursor: 'pointer',
  }
}
