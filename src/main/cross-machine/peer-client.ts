/**
 * Peer client — Phase H (cross-machine session resume).
 *
 * Talks JSON-RPC over HTTP to a remote clui peer's PeerServer. Used by
 * the local user to list a remote peer's sessions and import one into
 * their own ~/.claude/projects so the Claude CLI can `--resume` it.
 *
 * No new deps — Node's built-in `http` request API.
 */
import * as http from 'node:http'
import { importSessionLocal, PEER_DEFAULT_PORT, type PeerSessionMeta } from './peer-server.js'

interface RpcOptions {
  hostname: string
  secret: string
  port?: number
}

async function rpc(opts: RpcOptions, payload: Record<string, unknown>): Promise<unknown> {
  const body = JSON.stringify({ ...payload, secret: opts.secret })
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: opts.hostname,
      port: opts.port ?? PEER_DEFAULT_PORT,
      path: '/rpc',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
      timeout: 10_000,
    }, (res) => {
      let chunks = ''
      res.on('data', (c) => { chunks += c })
      res.on('end', () => {
        if ((res.statusCode ?? 500) >= 400) {
          try {
            const parsed = JSON.parse(chunks) as { error?: string }
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`))
          } catch {
            reject(new Error(`HTTP ${res.statusCode}`))
          }
          return
        }
        try {
          resolve(JSON.parse(chunks))
        } catch {
          reject(new Error('Bad JSON from peer'))
        }
      })
    })
    req.on('error', (err) => reject(err))
    req.on('timeout', () => {
      req.destroy(new Error('timeout'))
    })
    req.write(body)
    req.end()
  })
}

export async function listPeerSessions(opts: RpcOptions): Promise<PeerSessionMeta[]> {
  const result = await rpc(opts, { method: 'list_sessions' }) as { sessions: PeerSessionMeta[] }
  return result.sessions
}

export async function importPeerSession(
  opts: RpcOptions,
  projectPath: string,
  sessionId: string,
): Promise<void> {
  const result = await rpc(opts, {
    method: 'get_session',
    projectPath,
    sessionId,
  }) as { messages: string }
  if (!result.messages) throw new Error('No messages returned')
  await importSessionLocal(projectPath, sessionId, result.messages)
}
