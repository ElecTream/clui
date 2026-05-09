/**
 * Version-check — Phase G (Major Upgrade plan, MVP form).
 *
 * Checks installed `claude` CLI vs the latest published on npm. Used by the
 * Settings panel "About" section to surface an update hint with the install
 * command users can copy-paste. We deliberately do NOT auto-trigger upgrade
 * — `npm i -g` paths vary by Windows / macOS / Linux + npm vs pnpm vs yarn,
 * and a silent spawn that fails partway through could leave the CLI in a
 * broken state. Better to give users the command and let them run it.
 *
 * Cached for 1h per process so reopening the Settings panel doesn't slam the
 * npm registry.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ClaudeVersionInfo {
  installed: string | null
  latest: string | null
  updateAvailable: boolean
  /** Semver-aware compare result, or null if either side is unknown. */
  compareResult: -1 | 0 | 1 | null
  /** Suggested upgrade command for copy-paste. */
  upgradeCommand: string
  /** When this check was performed. */
  checkedAt: number
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
let cached: ClaudeVersionInfo | null = null

/** Probe installed Claude CLI version. Returns null if not installed / not on PATH. */
async function getInstalledVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('claude', ['--version'], {
      timeout: 5000,
      windowsHide: true,
    })
    const match = stdout.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/** Fetch the latest version from npm registry. */
async function getLatestNpmVersion(): Promise<string | null> {
  try {
    // `npm view <pkg> version` is ~50ms, no auth needed for public packages.
    // We pass `--json=false` to keep output a plain string.
    const { stdout } = await execFileAsync(
      'npm',
      ['view', '@anthropic-ai/claude-code', 'version'],
      {
        timeout: 10000,
        windowsHide: true,
        shell: process.platform === 'win32', // npm is npm.cmd on Windows
      },
    )
    const trimmed = stdout.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

/**
 * Compare two semver strings. Returns -1 if a < b, 0 if equal, 1 if a > b.
 * Handles `-pre` suffixes naively (strips them for the comparison).
 */
function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const cleanA = a.replace(/[-+].*$/, '')
  const cleanB = b.replace(/[-+].*$/, '')
  const partsA = cleanA.split('.').map((n) => parseInt(n, 10) || 0)
  const partsB = cleanB.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff < 0) return -1
    if (diff > 0) return 1
  }
  return 0
}

export async function checkClaudeVersion(force = false): Promise<ClaudeVersionInfo> {
  if (!force && cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached
  }

  const [installed, latest] = await Promise.all([getInstalledVersion(), getLatestNpmVersion()])

  let compareResult: -1 | 0 | 1 | null = null
  if (installed && latest) {
    compareResult = compareSemver(installed, latest)
  }

  cached = {
    installed,
    latest,
    updateAvailable: compareResult === -1,
    compareResult,
    upgradeCommand: 'npm install -g @anthropic-ai/claude-code',
    checkedAt: Date.now(),
  }
  return cached
}

export function invalidateVersionCache(): void {
  cached = null
}
