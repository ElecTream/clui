#!/usr/bin/env node
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const isWin = process.platform === 'win32'

function spawn(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', ...opts })
}

// 1. Apply patches to node_modules (node-gyp recognizes VS 2026, node-pty winpty.gyp
//    works on Windows with NoDefaultCurrentDirectoryInExePath, Spectre mitigation off).
//    Skipped if no patches/ dir exists.
if (fs.existsSync(path.join(__dirname, '..', 'patches'))) {
  const patchBin = path.join(
    __dirname,
    '..',
    'node_modules',
    '.bin',
    isWin ? 'patch-package.cmd' : 'patch-package',
  )
  if (fs.existsSync(patchBin)) {
    const r = spawn(patchBin, [], { shell: isWin })
    if (r.status !== 0) {
      console.warn('postinstall: patch-package returned non-zero — patches may not apply on this version')
    }
  }
}

// 2. Resolve the local electron-builder binary so we don't rely on PATH/npx.
const builderBin = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  isWin ? 'electron-builder.cmd' : 'electron-builder',
)

if (!fs.existsSync(builderBin)) {
  console.error(`postinstall: electron-builder not found at ${builderBin}`)
  process.exit(1)
}

const builderResult = spawn(builderBin, ['install-app-deps'], { shell: isWin })

if (builderResult.error) {
  console.error(`postinstall: failed to launch electron-builder: ${builderResult.error.message}`)
  process.exit(1)
}

if (builderResult.status !== 0) {
  if (isWin) {
    console.warn(
      '\npostinstall: electron-builder install-app-deps reported a failure ' +
        '(typically node-pty needs Visual Studio Build Tools to recompile).\n' +
        'Treating as non-fatal on Windows because PTY mode is opt-in ' +
        '(gated behind CLUI_INTERACTIVE_PERMISSIONS_PTY).\n' +
        'See docs/WINDOWS.md for instructions on enabling PTY mode.\n',
    )
  } else {
    process.exit(builderResult.status ?? 1)
  }
}

if (process.platform === 'darwin') {
  const r = spawn('bash', ['scripts/patch-dev-icon.sh'])
  if (r.status !== 0) process.exit(r.status ?? 1)
}
