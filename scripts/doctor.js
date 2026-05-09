#!/usr/bin/env node
// Cross-platform doctor dispatcher.
// On macOS/Linux: runs scripts/doctor.sh.
// On Windows:    runs scripts/doctor.ps1 with ExecutionPolicy Bypass.

const { spawnSync } = require('child_process')
const path = require('path')

let cmd, args
if (process.platform === 'win32') {
  cmd = 'powershell.exe'
  args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join('scripts', 'doctor.ps1')]
} else {
  cmd = 'bash'
  args = [path.join('scripts', 'doctor.sh')]
}

const r = spawnSync(cmd, args, { stdio: 'inherit' })
process.exit(r.status ?? 0)
