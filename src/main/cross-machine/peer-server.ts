/**
 * Peer server — Phase H (cross-machine session resume).
 *
 * Listens on a configurable port (default 41811). Other clui peers on
 * the same Tailnet hit `POST /rpc` with `{ method, secret, ...args }`
 * and we serve session metadata + session messages.
 *
 * Auth: a shared secret in the request body. Network-level trust is
 * delegated to the user's Tailscale ACLs (we listen on all interfaces
 * but the assumption is the user only exposes this port within their
 * Tailnet via firewall / ACL). HTTP, not HTTPS — Tailscale already
 * encrypts the wire.
 *
 * No new deps — uses Node's built-in `http` + the existing
 * ~/.claude/projects layout for session discovery.
 */
import * as http from 'node:http'
import * as path from 'node:path'
import * as os from 'node:os'
import { promises as fs } from 'node:fs'

const HOME = os.homedir()
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects')
const DEFAULT_PORT = 41811

export interface PeerSessionMeta {
  sessionId: string
  projectPath: string
  lastTimestamp: string
  size: number
  firstMessage: string | null
}

export class PeerServer {
  private server: http.Server | null = null
  private secret: string
  private port: number

  constructor(secret: string, port: number = DEFAULT_PORT) {
    this.secret = secret
    this.port = port
  }

  isRunning(): boolean {
    return this.server !== null
  }

  setSecret(next: string): void {
    this.secret = next
  }

  async start(): Promise<void> {
    if (this.server) return
    this.server = http.createServer((req, res) => this.handle(req, res))
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.port, () => {
        this.server!.removeListener('error', reject)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.server) return
    const srv = this.server
    this.server = null
    await new Promise<void>((resolve) => srv.close(() => resolve()))
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== 'POST' || req.url !== '/rpc') {
      res.writeHead(404).end()
      return
    }
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body) as { method?: string; secret?: string; sessionId?: string; projectPath?: string }
        if (!payload.secret || payload.secret !== this.secret) {
          res.writeHead(401, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'auth_failed' }))
          return
        }
        if (payload.method === 'list_sessions') {
          const sessions = await listLocalSessions()
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ sessions }))
          return
        }
        if (payload.method === 'get_session') {
          if (!payload.projectPath || !payload.sessionId) {
            res.writeHead(400).end(JSON.stringify({ error: 'missing_args' }))
            return
          }
          const messages = await readSessionMessages(payload.projectPath, payload.sessionId)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ messages }))
          return
        }
        res.writeHead(400).end(JSON.stringify({ error: 'unknown_method' }))
      } catch (err: unknown) {
        res.writeHead(500).end(JSON.stringify({
          error: err instanceof Error ? err.message : 'server_error',
        }))
      }
    })
  }
}

/**
 * Walk ~/.claude/projects/<project>/<sessionId>.jsonl. Each project
 * directory is named with the encoded form of the project's path
 * (Claude Code's convention).
 */
async function listLocalSessions(): Promise<PeerSessionMeta[]> {
  const out: PeerSessionMeta[] = []
  let projectDirs: string[]
  try {
    projectDirs = await fs.readdir(PROJECTS_DIR)
  } catch {
    return out
  }
  for (const projectDir of projectDirs) {
    const projectFull = path.join(PROJECTS_DIR, projectDir)
    try {
      const stat = await fs.stat(projectFull)
      if (!stat.isDirectory()) continue
    } catch { continue }
    let sessionFiles: string[]
    try { sessionFiles = await fs.readdir(projectFull) } catch { continue }
    for (const fn of sessionFiles) {
      if (!fn.endsWith('.jsonl')) continue
      const filePath = path.join(projectFull, fn)
      try {
        const stat = await fs.stat(filePath)
        const sessionId = fn.replace(/\.jsonl$/, '')
        out.push({
          sessionId,
          projectPath: projectDir,
          lastTimestamp: stat.mtime.toISOString(),
          size: stat.size,
          firstMessage: await readFirstMessage(filePath),
        })
      } catch {
        // skip
      }
    }
  }
  out.sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp))
  return out
}

async function readFirstMessage(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const firstLine = raw.split(/\r?\n/, 1)[0]
    if (!firstLine) return null
    const parsed = JSON.parse(firstLine) as { content?: string; message?: { content?: string } }
    return parsed.content ?? parsed.message?.content ?? null
  } catch {
    return null
  }
}

async function readSessionMessages(projectPath: string, sessionId: string): Promise<string> {
  const filePath = path.join(PROJECTS_DIR, projectPath, `${sessionId}.jsonl`)
  return fs.readFile(filePath, 'utf8')
}

/**
 * Standalone helper for the peer-client side: write an imported
 * session into the local ~/.claude/projects layout, so the user can
 * resume it via the Claude CLI's --resume flag.
 */
export async function importSessionLocal(
  projectPath: string,
  sessionId: string,
  messagesJsonl: string,
): Promise<void> {
  const dir = path.join(PROJECTS_DIR, projectPath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `${sessionId}.jsonl.partial`)
  const final = path.join(dir, `${sessionId}.jsonl`)
  await fs.writeFile(tmp, messagesJsonl, 'utf8')
  await fs.rename(tmp, final)
}

export const PEER_DEFAULT_PORT = DEFAULT_PORT
