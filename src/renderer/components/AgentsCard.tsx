import React, { useState, useEffect } from 'react'
import { UsersThree, FloppyDisk, Trash, Plus, Check, X } from '@phosphor-icons/react'
import type { ColorPalette } from '../theme'
import type { AgentMeta } from '../../shared/types'

/**
 * AgentsCard — Phase C (native /agents UI).
 *
 * Renders an in-conversation card listing the subagents stored in
 * ~/.claude/agents/<name>.md. The user can:
 *   • Click an agent to inspect / edit its description, tools list,
 *     and system prompt body.
 *   • Save (writes back to disk via the agents bridge)
 *   • Delete (removes the .md file)
 *   • Create a new agent (prompts for a name, then opens the editor
 *     with empty fields)
 *
 * Triggered by `/agents` typed in InputBar — see InputBar.tsx where
 * the __AGENTS_DATA__ sentinel is emitted with the pre-loaded agent
 * list. This card refreshes from disk after every save/delete so the
 * displayed list stays in sync with what's actually on the
 * filesystem (handles the case where the user has Claude Code open
 * elsewhere editing the same agents).
 */

interface AgentsData {
  agents: AgentMeta[]
}

export function AgentsCard({ data, colors }: { data: AgentsData; colors: ColorPalette }) {
  const [agents, setAgents] = useState<AgentMeta[]>(data.agents)
  const [selectedPath, setSelectedPath] = useState<string | null>(
    data.agents[0]?.filePath ?? null,
  )
  const [draft, setDraft] = useState<AgentMeta | null>(
    data.agents[0] ? { ...data.agents[0] } : null,
  )
  const [savingPath, setSavingPath] = useState<string | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // If the source data updates (re-fired /agents, external watcher in
  // a future commit), refresh the local list and re-pick the same
  // agent if it still exists.
  useEffect(() => {
    setAgents(data.agents)
    if (selectedPath) {
      const next = data.agents.find((a) => a.filePath === selectedPath)
      if (next) {
        setDraft({ ...next })
      } else {
        const first = data.agents[0]
        setSelectedPath(first?.filePath ?? null)
        setDraft(first ? { ...first } : null)
      }
    }
  }, [data.agents])

  const refresh = async (): Promise<void> => {
    try {
      const next = await window.clui.listAgents?.()
      if (next) setAgents(next)
    } catch {
      // ignored — display whatever we have
    }
  }

  const selected = selectedPath ? agents.find((a) => a.filePath === selectedPath) ?? null : null
  const dirty = !!draft && !!selected && (
    draft.name !== selected.name ||
    draft.description !== selected.description ||
    draft.tools !== selected.tools ||
    draft.body !== selected.body
  )

  const onSelect = (path: string): void => {
    const a = agents.find((x) => x.filePath === path)
    if (!a) return
    setSelectedPath(path)
    setDraft({ ...a })
    setError(null)
    setConfirmDelete(null)
  }

  const onSave = async (): Promise<void> => {
    if (!draft) return
    setError(null)
    setSavingPath(draft.filePath)
    try {
      await window.clui.writeAgent?.(draft)
      setSavedPath(draft.filePath)
      setTimeout(() => setSavedPath(null), 1500)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingPath(null)
    }
  }

  const onCreate = async (): Promise<void> => {
    const rawName = window.prompt('New agent name (lowercase letters, digits, hyphens):')
    if (!rawName) return
    const name = rawName.trim()
    if (!name) return
    try {
      const filePath = await window.clui.pathForNewAgent?.(name)
      if (!filePath) throw new Error('Agents bridge not available')
      const fresh: AgentMeta = {
        name,
        description: '',
        tools: null,
        body: '\nDescribe when this agent should be used and how it should approach the problem.\n',
        filePath,
      }
      await window.clui.writeAgent?.(fresh)
      await refresh()
      setSelectedPath(filePath)
      setDraft(fresh)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Create failed')
    }
  }

  const onDelete = async (): Promise<void> => {
    if (!selected) return
    setError(null)
    try {
      await window.clui.deleteAgent?.(selected.filePath)
      await refresh()
      setConfirmDelete(null)
      const remaining = agents.filter((a) => a.filePath !== selected.filePath)
      const next = remaining[0] ?? null
      setSelectedPath(next?.filePath ?? null)
      setDraft(next ? { ...next } : null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
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
      {/* Header */}
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
        <UsersThree size={14} style={{ color: colors.textSecondary }} />
        <span style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 500 }}>Agents</span>
        <span style={{ color: colors.textTertiary, fontSize: 10, marginLeft: 'auto' }}>
          ~/.claude/agents
        </span>
      </div>

      {/* Body — list + editor side by side */}
      <div style={{ display: 'flex', minHeight: 200, maxHeight: 460 }}>
        {/* Left: agent list */}
        <div
          style={{
            width: 180,
            flexShrink: 0,
            borderRight: `1px solid ${colors.containerBorder}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {agents.length === 0 ? (
              <div style={{ padding: '12px 12px', fontSize: 11, color: colors.textTertiary }}>
                No agents yet.
              </div>
            ) : (
              agents.map((a) => {
                const active = a.filePath === selectedPath
                return (
                  <button
                    key={a.filePath}
                    data-clui-no-drag="true"
                    onClick={() => onSelect(a.filePath)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: active ? colors.surfaceActive : 'transparent',
                      color: active ? colors.textPrimary : colors.textSecondary,
                      border: 'none',
                      padding: '6px 10px',
                      fontSize: 11,
                      fontWeight: active ? 500 : 400,
                      cursor: 'pointer',
                      borderLeft: active ? `2px solid ${colors.accent}` : '2px solid transparent',
                    }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name}
                    </div>
                    {a.description && (
                      <div
                        style={{
                          fontSize: 10,
                          color: colors.textTertiary,
                          marginTop: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {a.description}
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>
          <button
            data-clui-no-drag="true"
            onClick={onCreate}
            style={{
              borderTop: `1px solid ${colors.containerBorder}`,
              background: 'transparent',
              color: colors.accent,
              padding: '8px 10px',
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              textAlign: 'left',
            }}
          >
            <Plus size={11} />
            New agent…
          </button>
        </div>

        {/* Right: editor */}
        <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          {!draft ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: colors.textTertiary,
                fontSize: 11,
              }}
            >
              {agents.length === 0 ? 'Click "New agent" to create your first one.' : 'Pick an agent to edit.'}
            </div>
          ) : (
            <>
              <Field
                label="Name"
                value={draft.name}
                onChange={(v) => setDraft({ ...draft, name: v })}
                colors={colors}
                hint="Used as the agent identifier when invoked."
              />
              <Field
                label="Description"
                value={draft.description}
                onChange={(v) => setDraft({ ...draft, description: v })}
                colors={colors}
                hint="When this agent should be invoked."
              />
              <Field
                label="Tools"
                value={draft.tools ?? ''}
                onChange={(v) => setDraft({ ...draft, tools: v.trim() ? v : null })}
                colors={colors}
                hint='Comma-separated list, or empty for "all tools available".'
                placeholder="Read, Edit, Bash"
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 80 }}>
                <Label colors={colors}>System prompt</Label>
                <textarea
                  data-clui-no-drag="true"
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  spellCheck={false}
                  style={{
                    flex: 1,
                    width: '100%',
                    background: colors.inputPillBg,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.containerBorder}`,
                    borderRadius: 'var(--clui-radius-sm, 6px)',
                    padding: 8,
                    fontSize: 12,
                    fontFamily:
                      "'JetBrains Mono', 'Cascadia Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    lineHeight: 1.55,
                    resize: 'none',
                    outline: 'none',
                    minHeight: 100,
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer actions */}
      {draft && (
        <div
          style={{
            padding: '6px 12px 10px',
            borderTop: `1px solid ${colors.containerBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ flex: 1, fontSize: 10, color: error ? colors.statusError : colors.textTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {error
              ? error
              : savedPath === draft.filePath
                ? 'Saved.'
                : dirty
                  ? 'Unsaved changes'
                  : draft.filePath}
          </div>

          {confirmDelete === draft.filePath ? (
            <>
              <span style={{ fontSize: 10, color: colors.statusError }}>Delete?</span>
              <button
                data-clui-no-drag="true"
                onClick={() => setConfirmDelete(null)}
                style={{
                  background: 'transparent',
                  color: colors.textTertiary,
                  border: 'none',
                  fontSize: 10,
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                data-clui-no-drag="true"
                onClick={onDelete}
                style={{
                  background: colors.statusError,
                  color: colors.textOnAccent,
                  border: 'none',
                  borderRadius: 'var(--clui-radius-sm, 6px)',
                  fontSize: 11,
                  padding: '5px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Trash size={11} />
                Confirm
              </button>
            </>
          ) : (
            <button
              data-clui-no-drag="true"
              onClick={() => setConfirmDelete(draft.filePath)}
              style={{
                background: 'transparent',
                color: colors.textTertiary,
                border: 'none',
                fontSize: 10,
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Delete agent"
            >
              <Trash size={11} />
              Delete
            </button>
          )}

          <button
            data-clui-no-drag="true"
            onClick={onSave}
            disabled={!dirty || savingPath === draft.filePath}
            style={{
              background: dirty ? colors.accent : colors.surfaceHover,
              color: dirty ? colors.textOnAccent : colors.textTertiary,
              border: 'none',
              borderRadius: 'var(--clui-radius-sm, 6px)',
              fontSize: 11,
              padding: '5px 12px',
              cursor: dirty && savingPath !== draft.filePath ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'background var(--clui-state-duration, 120ms) var(--clui-ease-out, ease-out)',
            }}
          >
            {savedPath === draft.filePath ? <Check size={11} /> : <FloppyDisk size={11} />}
            {savingPath === draft.filePath ? 'Saving…' : savedPath === draft.filePath ? 'Saved' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

function Label({ colors, children }: { colors: ColorPalette; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: colors.textTertiary,
        marginBottom: 3,
      }}
    >
      {children}
    </span>
  )
}

function Field({
  label,
  value,
  onChange,
  colors,
  hint,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  colors: ColorPalette
  hint?: string
  placeholder?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Label colors={colors}>{label}</Label>
      <input
        data-clui-no-drag="true"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: colors.inputPillBg,
          color: colors.textPrimary,
          border: `1px solid ${colors.containerBorder}`,
          borderRadius: 'var(--clui-radius-sm, 6px)',
          padding: '5px 8px',
          fontSize: 12,
          outline: 'none',
        }}
      />
      {hint && (
        <span style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>{hint}</span>
      )}
    </div>
  )
}
