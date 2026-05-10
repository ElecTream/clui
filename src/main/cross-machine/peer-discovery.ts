/**
 * Peer auto-discovery — Phase H follow-up.
 *
 * Shells `tailscale status --json` and returns the user's online Tailnet
 * peers so the PeerBrowser hostname field can autocomplete instead of
 * forcing the user to type `other-machine` from memory.
 *
 * Failure modes — all silent, all return []:
 *   • tailscale binary not on PATH (tailscaled not installed)
 *   • user not logged in / no Tailnet (output shape varies)
 *   • non-zero exit (e.g. permission denied on Linux without sudo)
 *
 * We never throw — discovery is a UX nice-to-have and the manual
 * hostname input still works without it.
 */
import { spawn } from 'node:child_process'

export interface DiscoveredPeer {
  hostname: string
  dnsName: string
  online: boolean
  os: string
}

interface TailscalePeer {
  HostName?: string
  DNSName?: string
  Online?: boolean
  OS?: string
}

interface TailscaleStatus {
  Self?: TailscalePeer
  Peer?: Record<string, TailscalePeer>
}

/**
 * Parse `tailscale status --json`. Returns an empty array on any failure;
 * resolved within ~1.5s so the UI never stalls waiting for a missing
 * binary.
 */
export async function listTailscalePeers(): Promise<DiscoveredPeer[]> {
  const json = await runTailscaleStatusJson()
  if (!json) return []
  try {
    const status = JSON.parse(json) as TailscaleStatus
    const peers = status.Peer ?? {}
    const out: DiscoveredPeer[] = []
    for (const peer of Object.values(peers)) {
      const hostname = peer.HostName?.trim()
      if (!hostname) continue
      out.push({
        hostname,
        dnsName: (peer.DNSName ?? '').replace(/\.$/, ''),
        online: peer.Online === true,
        os: peer.OS ?? '',
      })
    }
    // Online first, then alpha
    out.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1
      return a.hostname.localeCompare(b.hostname)
    })
    return out
  } catch {
    return []
  }
}

function runTailscaleStatusJson(): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (val: string | null): void => {
      if (settled) return
      settled = true
      resolve(val)
    }
    let proc: ReturnType<typeof spawn>
    try {
      proc = spawn('tailscale', ['status', '--json'], { windowsHide: true })
    } catch {
      finish(null)
      return
    }
    let buf = ''
    proc.stdout?.on('data', (chunk: Buffer) => { buf += chunk.toString('utf8') })
    proc.on('error', () => finish(null))
    proc.on('close', (code) => finish(code === 0 ? buf : null))
    setTimeout(() => {
      try { proc.kill() } catch {}
      finish(null)
    }, 1500)
  })
}
