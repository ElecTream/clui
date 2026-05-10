import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Terminal, CaretDown, Check, ShieldCheck, Lightning } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { usePopoverLayer } from './PopoverLayer'
import { useColors, useThemeStore } from '../theme'
import type { PreferredTerminalId, TerminalInstallation } from '../../shared/types'

/* ─── Model Picker (inline — tightly coupled to StatusBar) ─── */

export function ModelPicker() {
  const preferredModel = useSessionStore((s) => s.preferredModel)
  const setPreferredModel = useSessionStore((s) => s.setPreferredModel)
  const allModels = useSessionStore((s) => s.availableModels)
  // Hide pinned point-releases — the user only ever wants to flip
  // between the (latest) alias of each family. Pinned variants are
  // still queryable via /model in the conversation if they need one.
  const availableModels = allModels.filter((m) => m.kind === 'alias')
  // Zustand v5 dropped the 2nd equality-fn arg; rely on default Object.is
  // reference equality. Tab object identity already changes only when the
  // array is mutated, which happens exactly when something changes.
  const tab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const popoverLayer = usePopoverLayer()
  const colors = useColors()
  const defaultModel = availableModels.find((m) => m.isDefault) ?? availableModels[0]

  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ bottom: 0, left: 0 })

  const isBusy = tab?.status === 'running' || tab?.status === 'connecting'

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      bottom: window.innerHeight - rect.top + 6,
      left: rect.left,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleToggle = () => {
    if (isBusy) return
    if (!open) updatePos()
    setOpen((o) => !o)
  }

  const activeLabel = (() => {
    if (preferredModel) {
      const m = availableModels.find((m) => m.id === preferredModel)
      return m?.label || preferredModel
    }
    if (tab?.sessionModel) {
      const m = availableModels.find((m) => m.id === tab.sessionModel)
      return m?.label || tab.sessionModel
    }
    return defaultModel?.label ?? 'Default'
  })()

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex items-center gap-0.5 text-[10px] rounded-full px-1.5 py-0.5 transition-colors whitespace-nowrap flex-shrink-0"
        style={{
          color: colors.textTertiary,
          cursor: isBusy ? 'not-allowed' : 'pointer',
          maxWidth: 140,
        }}
        title={isBusy ? 'Stop the task to change model' : `Switch model · ${activeLabel}`}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeLabel}</span>
        <CaretDown size={10} style={{ opacity: 0.6, flexShrink: 0 }} />
      </button>

      {popoverLayer && open && createPortal(
        <motion.div
          ref={popoverRef}
          data-clui-ui
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.12 }}
          className="rounded-xl"
          style={{
            position: 'fixed',
            bottom: pos.bottom,
            left: pos.left,
            width: 192,
            pointerEvents: 'auto',
            background: colors.popoverBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: colors.popoverShadow,
            border: `1px solid ${colors.popoverBorder}`,
          }}
        >
          <div className="py-1">
            {availableModels.map((m) => {
              const isSelected =
                preferredModel === m.id || (!preferredModel && m.id === defaultModel?.id)
              return (
                <button
                  key={m.id}
                  onClick={() => { setPreferredModel(m.id); setOpen(false) }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors"
                  style={{
                    color: isSelected ? colors.textPrimary : colors.textSecondary,
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {m.label}
                    {m.kind === 'alias' && (
                      <span
                        style={{
                          fontSize: 8,
                          padding: '1px 4px',
                          borderRadius: 3,
                          background: colors.accentLight,
                          color: colors.accent,
                          textTransform: 'uppercase',
                          letterSpacing: 'var(--clui-letter-spacing-label, 0.02em)',
                        }}
                      >
                        latest
                      </span>
                    )}
                  </span>
                  {isSelected && <Check size={12} style={{ color: colors.accent }} />}
                </button>
              )
            })}
          </div>
        </motion.div>,
        popoverLayer,
      )}
    </>
  )
}

/* ─── Permission Mode Picker (global — affects all tabs) ─── */

export function PermissionModePicker() {
  const permissionMode = useSessionStore((s) => s.permissionMode)
  const setPermissionMode = useSessionStore((s) => s.setPermissionMode)
  const popoverLayer = usePopoverLayer()
  const colors = useColors()

  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ bottom: 0, left: 0 })

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      bottom: window.innerHeight - rect.top + 6,
      left: rect.left,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleToggle = () => {
    if (!open) updatePos()
    setOpen((o) => !o)
  }

  const modeLabel = permissionMode === 'auto' ? 'Auto' : permissionMode === 'plan' ? 'Plan' : 'Ask'
  const modeIconWeight: 'fill' | 'regular' | 'duotone' =
    permissionMode === 'auto' ? 'fill' : permissionMode === 'plan' ? 'duotone' : 'regular'

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex items-center gap-1 text-[10px] rounded-full px-1.5 py-0.5 transition-colors whitespace-nowrap flex-shrink-0"
        style={{
          color: colors.textTertiary,
          cursor: 'pointer',
        }}
        title="Permission mode (global)"
      >
        <ShieldCheck size={11} weight={modeIconWeight} />
        {modeLabel}
        <CaretDown size={10} style={{ opacity: 0.6, flexShrink: 0 }} />
      </button>

      {popoverLayer && open && createPortal(
        <motion.div
          ref={popoverRef}
          data-clui-ui
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.12 }}
          className="rounded-xl"
          style={{
            position: 'fixed',
            bottom: pos.bottom,
            left: pos.left,
            width: 200,
            pointerEvents: 'auto',
            background: colors.popoverBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: colors.popoverShadow,
            border: `1px solid ${colors.popoverBorder}`,
          }}
        >
          <div className="py-1">
            <ModeRow
              active={permissionMode === 'ask'}
              onClick={() => { setPermissionMode('ask'); setOpen(false) }}
              colors={colors}
              icon={<ShieldCheck size={12} />}
              label="Ask"
              hint="Each tool call asks first"
            />
            <ModeRow
              active={permissionMode === 'auto'}
              onClick={() => { setPermissionMode('auto'); setOpen(false) }}
              colors={colors}
              icon={<ShieldCheck size={12} weight="fill" />}
              label="Auto"
              hint="Auto-approve every tool"
            />
            <ModeRow
              active={permissionMode === 'plan'}
              onClick={() => { setPermissionMode('plan'); setOpen(false) }}
              colors={colors}
              icon={<ShieldCheck size={12} weight="duotone" />}
              label="Plan"
              hint="Reason but don't execute"
            />
          </div>
        </motion.div>,
        popoverLayer,
      )}
    </>
  )
}

/* ─── Shared row used by Mode + Effort dropdowns ─── */

function ModeRow({
  active,
  onClick,
  colors,
  icon,
  label,
  hint,
}: {
  active: boolean
  onClick: () => void
  colors: ReturnType<typeof useColors>
  icon: React.ReactNode
  label: string
  hint?: string
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors"
      style={{
        color: active ? colors.textPrimary : colors.textSecondary,
        fontWeight: active ? 600 : 400,
      }}
    >
      <span className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
        {icon}
        <span>
          {label}
          {hint && (
            <span style={{ color: colors.textTertiary, fontWeight: 400, marginLeft: 6 }}>
              {hint}
            </span>
          )}
        </span>
      </span>
      {active && <Check size={12} style={{ color: colors.accent }} />}
    </button>
  )
}

/* ─── Effort Picker (global — affects all tabs) ─── */

const EFFORT_LABELS: Record<import('../../shared/types').EffortLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
}

export function EffortPicker() {
  const preferredEffort = useSessionStore((s) => s.preferredEffort)
  const setPreferredEffort = useSessionStore((s) => s.setPreferredEffort)
  const popoverLayer = usePopoverLayer()
  const colors = useColors()

  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ bottom: 0, left: 0 })

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      bottom: window.innerHeight - rect.top + 6,
      left: rect.left,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleToggle = () => {
    if (!open) updatePos()
    setOpen((o) => !o)
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex items-center gap-1 text-[10px] rounded-full px-1.5 py-0.5 transition-colors whitespace-nowrap flex-shrink-0"
        style={{ color: colors.textTertiary, cursor: 'pointer' }}
        title="Effort / thinking-budget hint"
      >
        <Lightning size={11} weight={preferredEffort === 'max' || preferredEffort === 'high' ? 'fill' : 'regular'} />
        {EFFORT_LABELS[preferredEffort]}
        <CaretDown size={10} style={{ opacity: 0.6, flexShrink: 0 }} />
      </button>

      {popoverLayer && open && createPortal(
        <motion.div
          ref={popoverRef}
          data-clui-ui
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.12 }}
          className="rounded-xl"
          style={{
            position: 'fixed',
            bottom: pos.bottom,
            left: pos.left,
            width: 200,
            pointerEvents: 'auto',
            background: colors.popoverBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: colors.popoverShadow,
            border: `1px solid ${colors.popoverBorder}`,
          }}
        >
          <div className="py-1">
            {(['low', 'medium', 'high', 'max'] as const).map((level) => (
              <ModeRow
                key={level}
                active={preferredEffort === level}
                onClick={() => { setPreferredEffort(level); setOpen(false) }}
                colors={colors}
                icon={<Lightning size={12} weight={level === 'max' || level === 'high' ? 'fill' : 'regular'} />}
                label={EFFORT_LABELS[level]}
              />
            ))}
          </div>
        </motion.div>,
        popoverLayer,
      )}
    </>
  )
}

/**
 * Open-in-CLI circle. Click launches the active tab's session in the
 * user's preferred terminal app; right-click opens the terminal picker.
 *
 * Pulls active-tab metadata from the store directly so callers don't
 * have to thread sessionId/projectPath props — the picker now lives
 * outside the per-tab strip (right-side circle next to the hub).
 */
export function TerminalLaunchControl() {
  const tab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const sessionId = tab?.claudeSessionId ?? null
  const projectPath = tab?.workingDirectory ?? '~'
  const preferredTerminalId = useThemeStore((s) => s.preferredTerminalId)
  const setPreferredTerminalId = useThemeStore((s) => s.setPreferredTerminalId)
  const popoverLayer = usePopoverLayer()
  const colors = useColors()

  const [open, setOpen] = useState(false)
  const [terminals, setTerminals] = useState<TerminalInstallation[]>([])
  const [terminalsLoading, setTerminalsLoading] = useState(false)
  const popoverId = 'terminal-launch-control-popover'
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ bottom: 0, right: 0 })

  const refreshTerminals = useCallback(async () => {
    setTerminalsLoading(true)
    try {
      const items = await window.clui.listInstalledTerminals()
      setTerminals(items)
    } catch {
      setTerminals([])
    } finally {
      setTerminalsLoading(false)
    }
  }, [])

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      bottom: window.innerHeight - rect.top + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    void refreshTerminals()

    const onResize = () => updatePos()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, refreshTerminals, updatePos])

  const selectedTerminal = preferredTerminalId === 'auto'
    ? null
    : terminals.find((terminal) => terminal.id === preferredTerminalId) ?? null
  const selectedTerminalValue: PreferredTerminalId = preferredTerminalId !== 'auto' && !terminalsLoading && !selectedTerminal
    ? 'auto'
    : preferredTerminalId

  const launchTerminal = (terminalId: PreferredTerminalId) => {
    void window.clui.openInTerminal(sessionId, projectPath, terminalId)
  }

  const handleMenuToggle = () => {
    if (!open) updatePos()
    setOpen((isOpen) => !isOpen)
  }

  const handlePick = (terminalId: PreferredTerminalId) => {
    setPreferredTerminalId(terminalId)
    setOpen(false)
    launchTerminal(terminalId)
  }

  const currentDescription = selectedTerminal
    ? `Launches in ${selectedTerminal.label}`
    : preferredTerminalId === 'auto'
      ? 'Launches in your default terminal app'
      : 'Launches in your saved terminal app'

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => launchTerminal(preferredTerminalId)}
        onContextMenu={(e) => {
          e.preventDefault()
          handleMenuToggle()
        }}
        data-clui-no-drag="true"
        className="stack-btn glass-surface"
        title={`${currentDescription} · right-click to pick terminal`}
        aria-expanded={open}
        aria-controls={popoverId}
      >
        <Terminal size={17} />
      </button>

      {popoverLayer && open && createPortal(
        <motion.div
          id={popoverId}
          ref={popoverRef}
          data-clui-ui
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.12 }}
          className="rounded-xl"
          style={{
            position: 'fixed',
            bottom: pos.bottom,
            right: pos.right,
            width: 244,
            pointerEvents: 'auto',
            background: colors.popoverBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: colors.popoverShadow,
            border: `1px solid ${colors.popoverBorder}`,
          }}
        >
          <div className="p-1.5">
            <div className="px-2.5 pt-1 pb-1.5">
              <div className="text-[11px]" style={{ color: colors.textPrimary }}>
                Open in CLI
              </div>
              <div className="text-[11px] leading-[1.4] mt-1" style={{ color: colors.textTertiary }}>
                Pick an installed terminal to save it as the launcher. Automatic uses the system default.
              </div>
            </div>

            <button
              onClick={() => handlePick('auto')}
              className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-[11px] text-left transition-colors"
              style={{
                color: selectedTerminalValue === 'auto' ? colors.textPrimary : colors.textSecondary,
                fontWeight: selectedTerminalValue === 'auto' ? 600 : 400,
              }}
            >
              <div className="min-w-0">
                <div className="truncate">Automatic</div>
                <div className="text-[11px] mt-0.5" style={{ color: colors.textTertiary }}>
                  Use the system default terminal app
                </div>
              </div>
              {selectedTerminalValue === 'auto' && <Check size={12} style={{ color: colors.accent }} />}
            </button>

            <div className="mx-1 my-1" style={{ height: 1, background: colors.popoverBorder }} />

            {terminalsLoading && (
              <div className="px-2.5 py-2 text-[11px]" style={{ color: colors.textTertiary }}>
                Detecting installed terminal apps…
              </div>
            )}

            {!terminalsLoading && terminals.length === 0 && (
              <div className="px-2.5 py-2 text-[11px] leading-[1.4]" style={{ color: colors.textTertiary }}>
                No individual terminal apps were detected. Automatic still uses whatever the system opens for terminal scripts.
              </div>
            )}

            {!terminalsLoading && terminals.map((terminal) => {
              const isSelected = terminal.id === selectedTerminalValue
              return (
                <button
                  key={terminal.id}
                  onClick={() => handlePick(terminal.id)}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-[11px] text-left transition-colors"
                  style={{
                    color: isSelected ? colors.textPrimary : colors.textSecondary,
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  <span className="truncate pr-2">{terminal.label}</span>
                  {isSelected && <Check size={12} style={{ color: colors.accent }} />}
                </button>
              )
            })}
          </div>
        </motion.div>,
        popoverLayer,
      )}
    </>
  )
}

