/**
 * Agents bridge — Phase C (slash-command native UIs).
 *
 * Reads / writes user-scoped subagent definitions in `~/.claude/agents/`.
 * Each agent is a single `.md` file with YAML frontmatter:
 *
 *   ---
 *   name: my-agent
 *   description: When this agent should be invoked
 *   tools: Read, Edit, Bash
 *   ---
 *
 *   System prompt body...
 *
 * We store the file path on each AgentMeta so the renderer can round-
 * trip writes without us having to re-resolve. Project-scoped agents
 * (under `<cwd>/.claude/agents/`) aren't surfaced here yet; the user
 * said "in order, just take off" so we ship the global flow first and
 * extend later if asked.
 */
import { promises as fs, existsSync, mkdirSync } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const HOME = os.homedir()
const AGENTS_DIR = path.join(HOME, '.claude', 'agents')

export interface AgentMeta {
  name: string
  description: string
  tools: string | null
  body: string
  filePath: string
}

function ensureAgentsDir(): void {
  if (!existsSync(AGENTS_DIR)) {
    mkdirSync(AGENTS_DIR, { recursive: true })
  }
}

/**
 * Parse a markdown file with optional YAML frontmatter into an
 * AgentMeta. Tolerant of missing fields — returns null if the file
 * isn't recognizable as an agent (no frontmatter and empty body).
 */
function parseAgent(filePath: string, raw: string): AgentMeta | null {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  let frontmatter = ''
  let body = raw
  if (fmMatch) {
    frontmatter = fmMatch[1]
    body = fmMatch[2]
  }

  const fields: Record<string, string> = {}
  for (const line of frontmatter.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/)
    if (m) fields[m[1].toLowerCase()] = m[2].trim()
  }

  const fallbackName = path.basename(filePath, '.md')
  const name = fields.name || fallbackName
  const description = fields.description || ''
  const tools = fields.tools || null

  if (!frontmatter && !body.trim()) return null

  return { name, description, tools, body: body.replace(/^\r?\n+/, ''), filePath }
}

export async function listAgents(): Promise<AgentMeta[]> {
  ensureAgentsDir()
  let entries: string[]
  try {
    entries = await fs.readdir(AGENTS_DIR)
  } catch {
    return []
  }
  const agents: AgentMeta[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue
    const filePath = path.join(AGENTS_DIR, entry)
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = parseAgent(filePath, raw)
      if (parsed) agents.push(parsed)
    } catch {
      // skip unreadable
    }
  }
  agents.sort((a, b) => a.name.localeCompare(b.name))
  return agents
}

export async function readAgent(filePath: string): Promise<AgentMeta | null> {
  if (!isAgentPath(filePath)) throw new Error('Refusing to read outside ~/.claude/agents/')
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return parseAgent(filePath, raw)
  } catch {
    return null
  }
}

function serializeAgent(agent: AgentMeta): string {
  const lines: string[] = ['---']
  lines.push(`name: ${agent.name}`)
  if (agent.description) lines.push(`description: ${agent.description}`)
  if (agent.tools) lines.push(`tools: ${agent.tools}`)
  lines.push('---', '')
  return lines.join('\n') + agent.body.replace(/^\r?\n+/, '')
}

export async function writeAgent(agent: AgentMeta): Promise<AgentMeta> {
  if (!isAgentPath(agent.filePath)) throw new Error('Refusing to write outside ~/.claude/agents/')
  ensureAgentsDir()
  const next = serializeAgent(agent)
  await fs.writeFile(agent.filePath, next, 'utf8')
  return agent
}

export async function deleteAgent(filePath: string): Promise<void> {
  if (!isAgentPath(filePath)) throw new Error('Refusing to delete outside ~/.claude/agents/')
  try {
    await fs.unlink(filePath)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return
    throw err
  }
}

export function pathForNewAgent(name: string): string {
  ensureAgentsDir()
  const safe = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'agent'
  return path.join(AGENTS_DIR, `${safe}.md`)
}

function isAgentPath(p: string): boolean {
  const resolved = path.resolve(p)
  const dir = path.resolve(AGENTS_DIR)
  return resolved.startsWith(dir + path.sep) && resolved.endsWith('.md')
}
