/**
 * Settings bridge — Phase B (Major Upgrade plan).
 *
 * Treats `~/.claude/settings.json` and `~/.claude/CLAUDE.md` as the canonical
 * source of truth. Edits in clui propagate to those files; edits made by the
 * Claude CLI / a text editor / another process propagate back to clui via
 * fs.watch + debounce.
 *
 * Atomic writes via temp file + rename so concurrent reads never see a
 * half-written JSON.
 *
 * No new dependencies — uses Node's built-in `fs` and `fs.watch`. Single-file
 * watch on Windows is rough around atomic-rename writes (the watcher closes
 * mid-rename and stops emitting); we handle that by re-attaching the watcher
 * after each fs event.
 */
import { promises as fs, watch as fsWatch, existsSync, mkdirSync, type FSWatcher } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { EventEmitter } from 'node:events'

// ─── Paths ───

const HOME = os.homedir()
const CLAUDE_DIR = path.join(HOME, '.claude')
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json')
const GLOBAL_CLAUDEMD_FILE = path.join(CLAUDE_DIR, 'CLAUDE.md')

// ─── Types ───
//
// We intentionally type ClaudeSettings as `Record<string, unknown>` rather than
// a strict shape — Claude CLI's settings schema isn't published, evolves
// often, and we want clui to round-trip unknown keys faithfully (read-modify-
// write must not drop fields it doesn't recognize).

export type ClaudeSettings = Record<string, unknown>

// ─── Read APIs ───

export async function readClaudeSettings(): Promise<ClaudeSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8')
    if (!raw.trim()) return {}
    return JSON.parse(raw) as ClaudeSettings
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return {}
    throw err
  }
}

export async function readGlobalCLAUDEMd(): Promise<string> {
  try {
    return await fs.readFile(GLOBAL_CLAUDEMD_FILE, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return ''
    throw err
  }
}

export async function readProjectCLAUDEMd(projectPath: string): Promise<string> {
  if (!projectPath) return ''
  const file = path.join(projectPath, 'CLAUDE.md')
  try {
    return await fs.readFile(file, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return ''
    throw err
  }
}

// ─── Write APIs (atomic via temp file + rename) ───

async function atomicWrite(filePath: string, contents: string): Promise<void> {
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${crypto.randomBytes(6).toString('hex')}.tmp`)
  await fs.writeFile(tmpPath, contents, 'utf8')
  // rename on Windows fails if the target exists in some cases — fall back to
  // unlink-then-rename if rename throws EEXIST/EPERM.
  try {
    await fs.rename(tmpPath, filePath)
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'EEXIST' || code === 'EPERM' || code === 'EACCES') {
      try { await fs.unlink(filePath) } catch {}
      await fs.rename(tmpPath, filePath)
    } else {
      try { await fs.unlink(tmpPath) } catch {}
      throw err
    }
  }
}

/**
 * Merge a patch into the existing settings, write back atomically.
 * Doing read-modify-write here means callers can pass partial updates without
 * risking dropping unknown keys.
 */
export async function writeClaudeSettings(patch: ClaudeSettings): Promise<ClaudeSettings> {
  const existing = await readClaudeSettings()
  const merged = { ...existing, ...patch }
  await atomicWrite(SETTINGS_FILE, JSON.stringify(merged, null, 2) + '\n')
  return merged
}

export async function writeGlobalCLAUDEMd(content: string): Promise<void> {
  await atomicWrite(GLOBAL_CLAUDEMD_FILE, content)
}

export async function writeProjectCLAUDEMd(projectPath: string, content: string): Promise<void> {
  if (!projectPath) throw new Error('writeProjectCLAUDEMd: projectPath required')
  const file = path.join(projectPath, 'CLAUDE.md')
  await atomicWrite(file, content)
}

// ─── Watcher ───
//
// Single watcher for the global ~/.claude directory; emits 'change' with a
// human-readable kind so the renderer can decide whether to re-fetch.
//
// Debounced 200ms — Windows fs.watch fires twice for atomic-rename writes
// (once for the temp file, once for the rename). Without debounce we'd
// re-broadcast spuriously.

class SettingsWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private pendingKinds = new Set<'settings' | 'claudemd'>()
  private starting = false

  start(): void {
    if (this.watcher || this.starting) return
    this.starting = true
    try {
      if (!existsSync(CLAUDE_DIR)) {
        // Don't error — Claude CLI may not have run yet. Try again later when
        // someone calls start() explicitly after the dir appears.
        this.starting = false
        return
      }
      this.attach()
    } finally {
      this.starting = false
    }
  }

  private attach(): void {
    try {
      // Watch the parent dir, not the file directly. fs.watch on a file
      // closes when the file is replaced by atomic-rename, which is exactly
      // how we (and Claude CLI) write. Watching the dir survives renames.
      this.watcher = fsWatch(CLAUDE_DIR, { persistent: false }, (eventType, filename) => {
        if (!filename) return
        const fname = filename.toString()
        if (fname === 'settings.json') this.pendingKinds.add('settings')
        else if (fname === 'CLAUDE.md') this.pendingKinds.add('claudemd')
        else return
        this.scheduleEmit()
      })
      this.watcher.on('error', (err) => {
        // Try to recover — reattach after a short delay.
        this.detach()
        setTimeout(() => this.attach(), 1000)
        this.emit('watch-error', err)
      })
    } catch (err) {
      this.emit('watch-error', err)
    }
  }

  private scheduleEmit(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      const kinds = Array.from(this.pendingKinds)
      this.pendingKinds.clear()
      for (const kind of kinds) this.emit('change', kind)
    }, 200)
  }

  private detach(): void {
    if (this.watcher) {
      try { this.watcher.close() } catch {}
      this.watcher = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }

  stop(): void {
    this.detach()
  }
}

let watcherSingleton: SettingsWatcher | null = null

/**
 * Get (lazily-created) singleton watcher. Idempotent — calling more than once
 * returns the same instance.
 */
export function getSettingsWatcher(): SettingsWatcher {
  if (!watcherSingleton) watcherSingleton = new SettingsWatcher()
  return watcherSingleton
}

export type ChangeKind = 'settings' | 'claudemd'
