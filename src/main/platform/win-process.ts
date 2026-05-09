// Windows-specific helpers for Claude binary discovery, PATH bootstrap, and process lifecycle.
// All exports are no-ops or undefined when called on non-Windows; callers should still gate
// with `process.platform === 'win32'` so the darwin/linux code paths stay byte-identical.

import { execSync, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

/**
 * Probe common Windows locations for the Claude Code CLI, then fall back to `where claude`.
 * Returns a path that should be passed through wrapForCmd() before spawn() if it ends in .cmd/.bat.
 */
export function findClaudeBinaryWin(): string {
  const appdata = process.env.APPDATA
  const localappdata = process.env.LOCALAPPDATA
  const userprofile = process.env.USERPROFILE

  const candidates: string[] = []
  if (appdata) {
    candidates.push(join(appdata, 'npm', 'claude.cmd'))
    candidates.push(join(appdata, 'npm', 'claude.exe'))
  }
  if (localappdata) {
    candidates.push(join(localappdata, 'npm', 'claude.cmd'))
    candidates.push(join(localappdata, 'Programs', 'claude', 'claude.exe'))
    candidates.push(join(localappdata, 'Volta', 'bin', 'claude.exe'))
  }
  if (userprofile) {
    candidates.push(join(userprofile, '.bun', 'bin', 'claude.exe'))
    candidates.push(join(userprofile, '.cargo', 'bin', 'claude.exe'))
  }

  for (const c of candidates) {
    if (existsSync(c)) return c
  }

  try {
    const out = execSync('where claude', {
      encoding: 'utf-8',
      env: process.env,
      shell: 'cmd.exe',
    }).trim()
    const first = out.split(/\r?\n/)[0]
    if (first && existsSync(first)) return first
  } catch {
    // `where` exits 1 if the binary isn't on PATH; fall through to last-resort.
  }

  // Last resort: hope cmd.exe finds something via PATHEXT.
  return 'claude.cmd'
}

/**
 * Build a PATH suitable for spawning Claude on Windows. Starts from the inherited PATH and
 * appends common npm-global locations the user may not have on PATH yet.
 */
export function getCliPathWin(): string {
  const seen = new Set<string>()
  const ordered: string[] = []
  const split = (raw: string | undefined): void => {
    if (!raw) return
    for (const entry of raw.split(';')) {
      const t = entry.trim().replace(/[\\/]+$/, '')
      if (!t) continue
      const k = t.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      ordered.push(t)
    }
  }

  split(process.env.PATH)
  if (process.env.APPDATA) split(join(process.env.APPDATA, 'npm'))
  if (process.env.LOCALAPPDATA) split(join(process.env.LOCALAPPDATA, 'npm'))
  if (process.env.LOCALAPPDATA) split(join(process.env.LOCALAPPDATA, 'Volta', 'bin'))
  if (process.env.USERPROFILE) split(join(process.env.USERPROFILE, '.bun', 'bin'))

  return ordered.join(';')
}

/**
 * Wrap (binary, args) so that .cmd/.bat targets are launched via cmd.exe — needed because
 * child_process.spawn cannot launch .cmd files directly without shell:true, and shell:true
 * mangles arguments containing newlines/quotes (which Clui's --append-system-prompt uses).
 *
 * Returns [executable, finalArgs] suitable for spawn(executable, finalArgs, ...).
 */
export function wrapForCmd(binary: string, args: string[]): [string, string[]] {
  if (/\.(cmd|bat)$/i.test(binary)) {
    return ['cmd.exe', ['/c', binary, ...args]]
  }
  return [binary, args]
}

/**
 * Kill a process and its descendants. On Windows, child.kill('SIGINT'/'SIGTERM') just calls
 * TerminateProcess on the immediate child — any tool subprocesses Claude spawned (rg, node, etc.)
 * are leaked. taskkill /T walks the process tree.
 *
 * Returns true if taskkill was attempted, false if the pid was invalid.
 */
export function killTree(pid: number | undefined): boolean {
  if (!pid || !Number.isFinite(pid)) return false
  try {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    }).unref()
    return true
  } catch {
    return false
  }
}
