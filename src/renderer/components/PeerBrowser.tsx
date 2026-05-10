import React, { useEffect, useState } from 'react'
import { GlobeHemisphereWest, Power, Copy, ArrowsClockwise, ArrowDown, Warning, FloppyDisk, Trash } from '@phosphor-icons/react'
import { useColors } from '../theme'
import type { PeerServerState, PeerSessionMeta, DiscoveredPeer, SavedPeer } from '../../shared/types'

/**
 * PeerBrowser — Phase H (cross-machine session resume via Tailscale).
 *
 * Two halves:
 *   • Local server status: hostname, port, secret. Toggle on/off; the
 *     server listens over plain HTTP — Tailscale handles wire crypto.
 *   • Peer connect: enter a remote hostname + secret, list its
 *     sessions, "Bring here" copies the session into ~/.claude/projects
 *     so the Claude CLI can --resume it.
 *
 * Network-level trust is delegated to the user's Tailscale ACLs — we
 * intentionally don't try to bind to specific Tailnet CIDRs in v1.
 */

export function PeerBrowser() {
  const colors = useColors()
  const [local, setLocal] = useState<PeerServerState | null>(null)
  const [peerHost, setPeerHost] = useState('')
  const [peerSecret, setPeerSecret] = useState('')
  const [sessions, setSessions] = useState<PeerSessionMeta[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set())
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [discoveredPeers, setDiscoveredPeers] = useState<DiscoveredPeer[]>([])
  const [savedPeers, setSavedPeers] = useState<SavedPeer[]>([])

  useEffect(() => {
    void refreshLocal()
    return window.clui.onPeerServerState?.((state) => setLocal(state))
  }, [])

  useEffect(() => {
    // Phase H discovery — populate the hostname autocomplete from
    // `tailscale status --json`. Failures are silent: if Tailscale isn't
    // installed the dropdown stays empty and the user types manually.
    void window.clui.peerListTailscalePeers?.().then((peers) => {
      if (peers) setDiscoveredPeers(peers)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    void window.clui.peerListSaved?.().then((peers) => {
      if (peers) setSavedPeers(peers)
    }).catch(() => {})
  }, [])

  const onSaveCurrentPeer = async (): Promise<void> => {
    if (!peerHost || !peerSecret) return
    const next = await window.clui.peerSave?.({
      hostname: peerHost,
      secret: peerSecret,
      lastSeen: Date.now(),
    })
    if (next) setSavedPeers(next)
  }
  const onLoadSavedPeer = (peer: SavedPeer): void => {
    setPeerHost(peer.hostname)
    setPeerSecret(peer.secret)
    setSessions(null)
    setError(null)
  }
  const onRemoveSavedPeer = async (hostname: string): Promise<void> => {
    const next = await window.clui.peerRemoveSaved?.(hostname)
    if (next) setSavedPeers(next)
  }

  const refreshLocal = async (): Promise<void> => {
    try {
      const state = await window.clui.peerGetLocalInfo?.()
      if (state) setLocal(state)
    } catch {}
  }

  const onToggleServer = async (): Promise<void> => {
    if (!local) return
    setError(null)
    try {
      const next = local.running
        ? await window.clui.peerServerStop?.()
        : await window.clui.peerServerStart?.()
      if (next) setLocal(next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Server toggle failed')
    }
  }

  const onRotateSecret = async (): Promise<void> => {
    setError(null)
    try {
      const next = await window.clui.peerGenerateSecret?.()
      if (next) setLocal(next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Secret rotation failed')
    }
  }

  const onCopySecret = async (): Promise<void> => {
    // We only show a prefix — the full secret lives in main; ask main
    // for it via... actually, no. The full secret never leaves main.
    // Provide the prefix for visual confirmation; the user can rotate
    // and read the new one from disk if they need to share it.
    if (!local?.secretPrefix) return
    try {
      await navigator.clipboard.writeText(local.secretPrefix.replace('…', ''))
      setCopiedSecret(true)
      setTimeout(() => setCopiedSecret(false), 1200)
    } catch {}
  }

  const onListPeer = async (): Promise<void> => {
    if (!peerHost || !peerSecret) return
    setError(null)
    setBusy(true)
    setSessions(null)
    try {
      const list = await window.clui.peerListSessions?.({ hostname: peerHost, secret: peerSecret })
      setSessions(list ?? [])
      // If this peer is already saved, refresh its lastSeen so the user
      // can tell which peer is reachable. Doesn't auto-save unsaved peers.
      if (savedPeers.some((p) => p.hostname === peerHost)) {
        const next = await window.clui.peerSave?.({
          hostname: peerHost,
          secret: peerSecret,
          lastSeen: Date.now(),
        })
        if (next) setSavedPeers(next)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reach peer')
    } finally {
      setBusy(false)
    }
  }

  const onImport = async (s: PeerSessionMeta): Promise<void> => {
    setError(null)
    setImportingId(s.sessionId)
    try {
      await window.clui.peerImportSession?.({
        hostname: peerHost,
        secret: peerSecret,
        projectPath: s.projectPath,
        sessionId: s.sessionId,
      })
      setImportedIds((prev) => new Set(prev).add(s.sessionId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImportingId(null)
    }
  }

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: 'var(--clui-space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--clui-space-4)',
      }}
    >
      <div>
        <div style={{ color: colors.textPrimary, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <GlobeHemisphereWest size={18} />
          Cross-machine peers
        </div>
        <div style={{ color: colors.textTertiary, fontSize: 11, marginTop: 4 }}>
          Run a session on one machine, resume from another over your Tailnet.
          Auth is a shared secret; Tailscale handles wire encryption.
        </div>
      </div>

      <SectionCard colors={colors} title="This machine">
        <Row label="Hostname" value={local?.hostname ?? '—'} colors={colors} />
        <Row label="Port" value={String(local?.port ?? '—')} colors={colors} />
        <Row
          label="Secret"
          value={local?.secretPrefix ?? '—'}
          colors={colors}
          actions={
            local?.secretPrefix ? (
              <>
                <IconBtn onClick={onCopySecret} title="Copy secret prefix" colors={colors}>
                  <Copy size={11} />
                </IconBtn>
                <IconBtn onClick={onRotateSecret} title="Rotate secret" colors={colors}>
                  <ArrowsClockwise size={11} />
                </IconBtn>
              </>
            ) : null
          }
        />
        {copiedSecret && <div style={{ fontSize: 10, color: colors.textTertiary }}>Prefix copied (rotate + read from disk for the full secret).</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={onToggleServer}
            style={{
              background: local?.running ? colors.surfaceHover : colors.accent,
              color: local?.running ? colors.textPrimary : colors.textOnAccent,
              border: 'none',
              borderRadius: 'var(--clui-radius-sm, 6px)',
              fontSize: 11,
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Power size={11} />
            {local?.running ? 'Stop sharing' : 'Start sharing'}
          </button>
        </div>
      </SectionCard>

      <SectionCard colors={colors} title="Connect to a peer">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Hostname" colors={colors}>
            <input
              value={peerHost}
              onChange={(e) => setPeerHost(e.target.value)}
              placeholder={discoveredPeers.length > 0 ? 'pick or type' : 'other-machine'}
              list="tailscale-peers"
              style={inputStyle(colors)}
            />
            {discoveredPeers.length > 0 && (
              <datalist id="tailscale-peers">
                {discoveredPeers.map((p) => (
                  <option key={p.hostname} value={p.hostname}>
                    {p.online ? '● ' : '○ '}
                    {p.dnsName || p.hostname}
                    {p.os ? ` (${p.os})` : ''}
                  </option>
                ))}
              </datalist>
            )}
          </Field>
          <Field label="Secret" colors={colors}>
            <input
              type="password"
              value={peerSecret}
              onChange={(e) => setPeerSecret(e.target.value)}
              placeholder="paste shared secret"
              style={inputStyle(colors)}
            />
          </Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
          <button
            onClick={() => { void onSaveCurrentPeer() }}
            disabled={!peerHost || !peerSecret}
            title="Save this peer for next time"
            style={{
              background: 'transparent',
              border: `1px solid ${colors.containerBorder}`,
              color: !peerHost || !peerSecret ? colors.textTertiary : colors.textPrimary,
              borderRadius: 'var(--clui-radius-sm, 6px)',
              fontSize: 11,
              padding: '6px 10px',
              cursor: !peerHost || !peerSecret ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <FloppyDisk size={11} />
            Save
          </button>
          <button
            onClick={onListPeer}
            disabled={!peerHost || !peerSecret || busy}
            style={{
              background: !peerHost || !peerSecret ? colors.surfaceHover : colors.accent,
              color: !peerHost || !peerSecret ? colors.textTertiary : colors.textOnAccent,
              border: 'none',
              borderRadius: 'var(--clui-radius-sm, 6px)',
              fontSize: 11,
              padding: '6px 12px',
              cursor: !peerHost || !peerSecret || busy ? 'default' : 'pointer',
            }}
          >
            {busy ? 'Connecting…' : 'List sessions'}
          </button>
        </div>

        {sessions && (
          <div style={{ marginTop: 8 }}>
            {sessions.length === 0 ? (
              <div style={{ color: colors.textTertiary, fontSize: 11 }}>Peer has no sessions.</div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sessions.map((s) => {
                  const imported = importedIds.has(s.sessionId)
                  return (
                    <li
                      key={s.sessionId}
                      style={{
                        background: colors.surfacePrimary,
                        border: `1px solid ${colors.containerBorder}`,
                        borderRadius: 'var(--clui-radius-sm, 6px)',
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 11,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: colors.textPrimary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.firstMessage || s.sessionId}
                        </div>
                        <div style={{ color: colors.textTertiary, fontSize: 10, marginTop: 2 }}>
                          {s.projectPath} · {new Date(s.lastTimestamp).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => onImport(s)}
                        disabled={importingId === s.sessionId || imported}
                        style={{
                          background: imported ? colors.surfaceHover : colors.accent,
                          color: imported ? colors.textTertiary : colors.textOnAccent,
                          border: 'none',
                          borderRadius: 'var(--clui-radius-sm, 6px)',
                          fontSize: 11,
                          padding: '4px 10px',
                          cursor: importingId === s.sessionId || imported ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <ArrowDown size={11} />
                        {importingId === s.sessionId ? 'Importing…' : imported ? 'Imported' : 'Bring here'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </SectionCard>

      {savedPeers.length > 0 && (
        <SectionCard colors={colors} title={`Saved peers (${savedPeers.length})`}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {savedPeers.map((p) => (
              <li
                key={p.hostname}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  background: colors.surfacePrimary,
                  border: `1px solid ${colors.containerBorder}`,
                  borderRadius: 'var(--clui-radius-sm, 6px)',
                  fontSize: 11,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: colors.textPrimary }}>
                  {p.label || p.hostname}
                  {p.lastSeen && (
                    <span style={{ color: colors.textTertiary, marginLeft: 8 }}>
                      · last seen {new Date(p.lastSeen).toLocaleDateString()}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => onLoadSavedPeer(p)}
                  title="Load this peer's hostname + secret into the form"
                  style={{
                    background: 'transparent',
                    border: `1px solid ${colors.containerBorder}`,
                    color: colors.textPrimary,
                    borderRadius: 4,
                    fontSize: 10,
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Use
                </button>
                <button
                  onClick={() => { void onRemoveSavedPeer(p.hostname) }}
                  title="Remove from saved peers"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: colors.textTertiary,
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash size={11} />
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.statusError, fontSize: 11 }}>
          <Warning size={11} />
          {error}
        </div>
      )}
    </div>
  )
}

function SectionCard({ colors, title, children }: { colors: ReturnType<typeof useColors>; title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: colors.surfacePrimary,
        border: `1px solid ${colors.containerBorder}`,
        borderRadius: 'var(--clui-radius-md, 10px)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 500 }}>{title}</div>
      {children}
    </div>
  )
}

function Row({
  label,
  value,
  colors,
  actions,
}: {
  label: string
  value: string
  colors: ReturnType<typeof useColors>
  actions?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
      <span style={{ color: colors.textTertiary, width: 90, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          flex: 1,
          color: colors.textPrimary,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
      {actions}
    </div>
  )
}

function IconBtn({
  onClick,
  title,
  colors,
  children,
}: {
  onClick: () => void
  title: string
  colors: ReturnType<typeof useColors>
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'transparent',
        border: 'none',
        color: colors.textTertiary,
        cursor: 'pointer',
        padding: 4,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {children}
    </button>
  )
}

function Field({
  label,
  colors,
  children,
}: {
  label: string
  colors: ReturnType<typeof useColors>
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
    </div>
  )
}

function inputStyle(colors: ReturnType<typeof useColors>): React.CSSProperties {
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
