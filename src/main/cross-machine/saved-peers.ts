/**
 * Saved peers — Phase H follow-up.
 *
 * Persists hostname + secret pairs to `userData/peers.json` so the user
 * doesn't paste the shared secret on every reconnect. Atomic writes
 * (tmp + rename) keep the file valid across crashes.
 *
 * Trust model: this file is treated as sensitive (secrets in plaintext).
 * It lives in `app.getPath('userData')` which is per-user, so the OS
 * filesystem ACLs are the only barrier. Acceptable for v1 — same trust
 * model as ~/.claude/credentials. If the user requests OS keychain
 * integration later, this file is the migration point.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import type { SavedPeer } from '../../shared/types'

function peersPath(): string {
  return path.join(app.getPath('userData'), 'peers.json')
}

export function listSavedPeers(): SavedPeer[] {
  try {
    if (!fs.existsSync(peersPath())) return []
    const raw = JSON.parse(fs.readFileSync(peersPath(), 'utf8'))
    if (!Array.isArray(raw)) return []
    return raw.filter((p): p is SavedPeer =>
      typeof p === 'object' && p && typeof p.hostname === 'string' && typeof p.secret === 'string',
    )
  } catch {
    return []
  }
}

function writeSaved(peers: SavedPeer[]): void {
  const tmp = peersPath() + '.tmp'
  try {
    fs.writeFileSync(tmp, JSON.stringify(peers, null, 2), { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(tmp, peersPath())
  } catch {
    // best effort
  }
}

/** Save a peer; updates the existing entry by hostname or appends. */
export function saveSavedPeer(peer: SavedPeer): SavedPeer[] {
  const peers = listSavedPeers()
  const idx = peers.findIndex((p) => p.hostname === peer.hostname)
  if (idx === -1) peers.push(peer)
  else peers[idx] = { ...peers[idx], ...peer }
  writeSaved(peers)
  return peers
}

export function removeSavedPeer(hostname: string): SavedPeer[] {
  const peers = listSavedPeers().filter((p) => p.hostname !== hostname)
  writeSaved(peers)
  return peers
}
