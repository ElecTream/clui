#!/usr/bin/env node
/**
 * Cross-platform postinstall.
 *
 * Strategy (rewritten — see commit history):
 *   - **Windows**: do NOT rebuild native modules. node-pty 1.1+, onnxruntime-node,
 *     and the @huggingface/transformers ONNX backend all ship working
 *     prebuilds for win32-x64. The previous flow (`electron-builder
 *     install-app-deps` → `@electron/rebuild`) attempted to recompile against
 *     Electron's bundled Node ABI and silently produced empty 0-byte
 *     `.node` stubs in `node_modules/node-pty/build/Release/` when the toolchain
 *     wasn't perfectly aligned. node-pty's runtime resolver (node-gyp-build)
 *     checks `build/Release/` BEFORE `prebuilds/`, so those empty stubs
 *     shadowed the working prebuilds — the source of every "PTY broken on a
 *     new machine" report. We now skip the rebuild entirely and let node-pty's
 *     own install hook (which is smart about prebuilds) do its job.
 *   - **macOS**: run electron-builder install-app-deps normally and apply
 *     the dev-icon patch.
 *
 * Also removes any stale empty .node stubs from previous bad rebuilds so a
 * `npm install` on a poisoned tree heals itself.
 */
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const ROOT = path.join(__dirname, '..')

function spawn(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', ...opts })
}

// 1. Heal any stale empty .node stubs left over from a previous bad rebuild.
//    These exist if the user ran a version of postinstall that called
//    @electron/rebuild and it produced 0-byte output. node-pty's runtime
//    resolver tries build/Release/ first; an empty file there breaks loading
//    even though prebuilds/<platform>-<arch>/ has the real binaries.
function healStaleStubs() {
  const buildDir = path.join(ROOT, 'node_modules', 'node-pty', 'build', 'Release')
  if (!fs.existsSync(buildDir)) return
  let anyEmpty = false
  for (const entry of fs.readdirSync(buildDir)) {
    if (!entry.endsWith('.node')) continue
    const full = path.join(buildDir, entry)
    try {
      const st = fs.statSync(full)
      if (st.size === 0) {
        anyEmpty = true
        break
      }
    } catch {}
  }
  if (anyEmpty) {
    console.log('postinstall: empty .node stubs detected in node-pty/build/Release — clearing so the shipped prebuilds load')
    fs.rmSync(buildDir, { recursive: true, force: true })
  }
}

healStaleStubs()

// 1b. Ensure Electron's native binary is actually downloaded.
//     Electron's npm package only carries metadata + an install.js that
//     fetches the ~250MB binary at install time. That fetch can fail
//     silently (network blip, GitHub rate limit, cache corruption), exit 0,
//     and leave node_modules/electron/dist/ empty. electron-vite then dies
//     with "Electron uninstall" on dev start.
//
//     This runs install.js — if it's already installed, install.js's
//     isInstalled() check exits cleanly. If not, it forces the download.
function ensureElectronBinary() {
  const electronDir = path.join(ROOT, 'node_modules', 'electron')
  if (!fs.existsSync(electronDir)) {
    // No Electron dep at all — nothing to do
    return
  }

  const platformBinary =
    isWin ? path.join(electronDir, 'dist', 'electron.exe')
    : isMac ? path.join(electronDir, 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
    : path.join(electronDir, 'dist', 'electron')

  if (fs.existsSync(platformBinary)) return

  console.log('postinstall: Electron binary missing — running electron/install.js to fetch it')
  const installJs = path.join(electronDir, 'install.js')
  if (!fs.existsSync(installJs)) {
    console.warn('postinstall: electron/install.js not found — skipping')
    return
  }
  const r = spawnSync(process.execPath, [installJs], {
    cwd: electronDir,
    stdio: 'inherit',
    env: process.env,
  })
  if (r.status !== 0) {
    console.error('postinstall: electron install.js failed with status ' + r.status)
    console.error('postinstall: try `cd node_modules/electron && node install.js` manually,')
    console.error('postinstall: check network access to github.com / electronjs.org caches')
    process.exit(r.status ?? 1)
  }
  // Verify it actually appeared
  if (!fs.existsSync(platformBinary)) {
    console.error(`postinstall: install.js returned 0 but ${platformBinary} still missing`)
    console.error('postinstall: this typically means a network or proxy issue blocked the GitHub release download')
    process.exit(1)
  }
}

ensureElectronBinary()

// 2. Patches. These were originally to make BUILDS-FROM-SOURCE work on
//    Windows with VS Build Tools 18.5 (VS 2026). Since we no longer rebuild
//    on Windows they're not needed there, but we still apply on non-Windows
//    in case macOS dev paths regress and need them.
if (!isWin && fs.existsSync(path.join(ROOT, 'patches'))) {
  const patchBin = path.join(
    ROOT,
    'node_modules',
    '.bin',
    isWin ? 'patch-package.cmd' : 'patch-package',
  )
  if (fs.existsSync(patchBin)) {
    const r = spawn(patchBin, [], { shell: false })
    if (r.status !== 0) {
      console.warn('postinstall: patch-package returned non-zero — patches may not apply on this version')
    }
  }
}

// 3. Native rebuild. SKIP on Windows entirely — everything has prebuilds.
//    On macOS, do the standard install-app-deps flow.
if (!isWin) {
  const builderBin = path.join(
    ROOT,
    'node_modules',
    '.bin',
    'electron-builder',
  )

  if (!fs.existsSync(builderBin)) {
    console.error(`postinstall: electron-builder not found at ${builderBin}`)
    process.exit(1)
  }

  const builderResult = spawn(builderBin, ['install-app-deps'], { shell: false })

  if (builderResult.error) {
    console.error(`postinstall: failed to launch electron-builder: ${builderResult.error.message}`)
    process.exit(1)
  }

  if (builderResult.status !== 0) {
    process.exit(builderResult.status ?? 1)
  }
} else {
  console.log('postinstall: skipping electron-builder install-app-deps on Windows (using shipped prebuilds for node-pty + onnxruntime-node)')
}

// 4. macOS dev icon patch. Last because it's a cosmetic step.
if (isMac) {
  const r = spawn('bash', ['scripts/patch-dev-icon.sh'])
  if (r.status !== 0) process.exit(r.status ?? 1)
}
