/**
 * Model registry — Phase A (Major Upgrade plan).
 *
 * Originally planned as a `claude --list-models --output-format json` shell
 * call, but the Claude CLI doesn't expose a list command yet (verified
 * against current CLI: `--list-models` returns "unknown option"). What it DOES
 * expose: the `--model` flag accepts both stable aliases ('opus', 'sonnet',
 * 'haiku' — always resolve to latest) and pinned full IDs ('claude-sonnet-4-6'
 * etc).
 *
 * This registry exposes both forms so users can pick "latest sonnet"
 * (auto-tracking) or pin to a specific version. We also probe `claude --version`
 * at startup so we can swap the registry for newer CLI versions if needed.
 *
 * When/if Claude CLI grows a list-models command we can plug in real
 * discovery here without changing any callers.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ModelInfo } from '../../shared/types'

const execFileAsync = promisify(execFile)

/**
 * Curated model list. Order matters — first entry is the default in pickers.
 *
 * Aliases (`opus`, `sonnet`, `haiku`) auto-track the latest. Pinned full IDs
 * are for reproducibility (e.g. comparing runs, locking a model for a release).
 */
const CURATED_MODELS: ModelInfo[] = [
  // ─── Aliases — auto-track latest ───
  {
    id: 'sonnet',
    label: 'Sonnet (latest)',
    family: 'sonnet',
    kind: 'alias',
    isDefault: true,
  },
  {
    id: 'opus',
    label: 'Opus (latest)',
    family: 'opus',
    kind: 'alias',
  },
  {
    id: 'haiku',
    label: 'Haiku (latest)',
    family: 'haiku',
    kind: 'alias',
  },
  // ─── Pinned versions — reproducible ───
  {
    id: 'claude-opus-4-6',
    label: 'Opus 4.6',
    family: 'opus',
    kind: 'pinned',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    family: 'sonnet',
    kind: 'pinned',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    family: 'haiku',
    kind: 'pinned',
  },
]

let cached: { models: ModelInfo[]; cliVersion: string | null } | null = null

/**
 * Probe the installed Claude CLI version. Cheap (~50ms cold). Used to
 * potentially swap the registry for older/newer CLI versions later.
 */
async function probeCliVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('claude', ['--version'], {
      timeout: 5000,
      windowsHide: true,
      // shell:false so the cmd injection guard from DEP0190 doesn't trigger;
      // execFile handles arg quoting natively
    })
    // Output is typically "X.Y.Z (Claude Code)" or just "X.Y.Z"
    const match = stdout.match(/(\d+\.\d+\.\d+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * Returns the active model registry. Cached for the process lifetime.
 *
 * Future evolution path: when Claude CLI exposes `--list-models`, replace the
 * curated array below with a parse of that output, falling back to
 * CURATED_MODELS on any error.
 */
export async function discoverModels(): Promise<{ models: ModelInfo[]; cliVersion: string | null }> {
  if (cached) return cached

  const cliVersion = await probeCliVersion()

  // Today: just return the curated list. Tomorrow: dispatch on cliVersion to
  // swap in newer model sets when we know them.
  cached = { models: CURATED_MODELS, cliVersion }
  return cached
}

/** Force-refresh the cache. Useful after the user upgrades Claude CLI. */
export function invalidateModelCache(): void {
  cached = null
}
