import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Check, FloppyDisk, X, FolderOpen, House } from '@phosphor-icons/react'
import type { ColorPalette } from '../theme'

/**
 * MemoryCard — Phase C (native /memory UI).
 *
 * Renders an in-conversation card showing the global ~/.claude/CLAUDE.md
 * and project-local <cwd>/CLAUDE.md side by side as tabs. Edit, save back via
 * the Phase B settings-bridge (window.clui.writeGlobalCLAUDEMd /
 * writeProjectCLAUDEMd).
 *
 * Triggered by `/memory` typed in InputBar — see InputBar.tsx where the
 * __MEMORY_DATA__ sentinel is emitted with both file contents pre-loaded so
 * the card renders synchronously without flashing a loading state.
 */
interface MemoryData {
  global: string
  project: string
  projectPath: string
}

export function MemoryCard({ data, colors }: { data: MemoryData; colors: ColorPalette }) {
  const [tab, setTab] = useState<'global' | 'project'>(
    data.project ? 'project' : 'global',
  )
  const [globalDraft, setGlobalDraft] = useState(data.global)
  const [projectDraft, setProjectDraft] = useState(data.project)
  const [savingTab, setSavingTab] = useState<'global' | 'project' | null>(null)
  const [savedTab, setSavedTab] = useState<'global' | 'project' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // If new data comes in (re-fired /memory or external file change via the
  // Phase B watcher), reset drafts to fresh contents.
  useEffect(() => {
    setGlobalDraft(data.global)
    setProjectDraft(data.project)
  }, [data.global, data.project])

  const dirty =
    (tab === 'global' && globalDraft !== data.global) ||
    (tab === 'project' && projectDraft !== data.project)

  const onSave = async (): Promise<void> => {
    setError(null)
    setSavingTab(tab)
    try {
      if (tab === 'global') {
        await window.clui.writeGlobalCLAUDEMd?.(globalDraft)
      } else {
        if (!data.projectPath) {
          throw new Error('No project working directory')
        }
        await window.clui.writeProjectCLAUDEMd?.(data.projectPath, projectDraft)
      }
      setSavedTab(tab)
      setTimeout(() => setSavedTab(null), 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingTab(null)
    }
  }

  const onRevert = (): void => {
    if (tab === 'global') setGlobalDraft(data.global)
    else setProjectDraft(data.project)
    setError(null)
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
        <BookOpen size={14} style={{ color: colors.textSecondary }} />
        <span style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 500 }}>Memory</span>
        <span style={{ color: colors.textTertiary, fontSize: 10, marginLeft: 'auto' }}>
          CLAUDE.md
        </span>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${colors.containerBorder}`,
        }}
      >
        <TabBtn active={tab === 'global'} onClick={() => setTab('global')} colors={colors}>
          <House size={11} />
          Global
        </TabBtn>
        <TabBtn
          active={tab === 'project'}
          onClick={() => setTab('project')}
          colors={colors}
          disabled={!data.projectPath}
        >
          <FolderOpen size={11} />
          Project
          {data.projectPath && (
            <span
              style={{
                color: colors.textTertiary,
                fontSize: 9,
                marginLeft: 4,
                fontFamily: 'monospace',
              }}
            >
              {data.projectPath.split(/[\\/]/).slice(-1)[0]}
            </span>
          )}
        </TabBtn>
      </div>

      {/* Editor */}
      <div style={{ padding: 8 }}>
        <textarea
          value={tab === 'global' ? globalDraft : projectDraft}
          onChange={(e) => {
            if (tab === 'global') setGlobalDraft(e.target.value)
            else setProjectDraft(e.target.value)
            setError(null)
          }}
          placeholder={
            tab === 'global'
              ? '# Global instructions for all projects\n\nWrite anything Claude should remember across every session.'
              : data.projectPath
                ? `# Project instructions for ${data.projectPath.split(/[\\/]/).slice(-1)[0]}\n\nWrite anything Claude should remember in this directory.`
                : 'No working directory set for this tab.'
          }
          disabled={tab === 'project' && !data.projectPath}
          spellCheck={false}
          rows={Math.min(
            Math.max(6, (tab === 'global' ? globalDraft : projectDraft).split('\n').length),
            18,
          )}
          style={{
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
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </div>

      {/* Footer actions */}
      <div
        style={{
          padding: '6px 12px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, fontSize: 10, color: error ? colors.statusError : colors.textTertiary }}>
          {error
            ? error
            : savedTab === tab
              ? 'Saved.'
              : dirty
                ? 'Unsaved changes'
                : tab === 'global'
                  ? '~/.claude/CLAUDE.md'
                  : data.projectPath
                    ? `${data.projectPath}/CLAUDE.md`
                    : 'No project path'}
        </div>
        {dirty && (
          <button
            onClick={onRevert}
            data-clui-no-drag="true"
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
          >
            <X size={10} />
            Revert
          </button>
        )}
        <button
          onClick={onSave}
          data-clui-no-drag="true"
          disabled={!dirty || savingTab === tab || (tab === 'project' && !data.projectPath)}
          style={{
            background: dirty ? colors.accent : colors.surfaceHover,
            color: dirty ? colors.textOnAccent : colors.textTertiary,
            border: 'none',
            borderRadius: 'var(--clui-radius-sm, 6px)',
            fontSize: 11,
            padding: '5px 12px',
            cursor: dirty && savingTab !== tab ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'background var(--clui-state-duration, 120ms) var(--clui-ease-out, ease-out)',
          }}
        >
          {savedTab === tab ? <Check size={11} /> : <FloppyDisk size={11} />}
          {savingTab === tab ? 'Saving…' : savedTab === tab ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  colors,
  children,
  disabled = false,
}: {
  active: boolean
  onClick: () => void
  colors: ColorPalette
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      data-clui-no-drag="true"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        background: active ? colors.surfacePrimary : 'transparent',
        color: disabled ? colors.textMuted : active ? colors.textPrimary : colors.textSecondary,
        border: 'none',
        borderBottom: active ? `2px solid ${colors.accent}` : '2px solid transparent',
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: active ? 500 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        justifyContent: 'center',
        transition:
          'color var(--clui-state-duration, 120ms) var(--clui-ease-out, ease-out), background var(--clui-state-duration, 120ms) var(--clui-ease-out, ease-out)',
      }}
    >
      {children}
    </button>
  )
}
