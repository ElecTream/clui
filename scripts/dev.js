#!/usr/bin/env node
// electron-vite spawns Electron, but Electron interprets ANY ELECTRON_RUN_AS_NODE
// (including empty string) as "run as Node, strip Electron API." cross-env can only
// set vars, not unset them, so we delete it here before exec'ing electron-vite.

const { spawn } = require('child_process')
const path = require('path')

delete process.env.ELECTRON_RUN_AS_NODE

const isWin = process.platform === 'win32'
const bin = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  isWin ? 'electron-vite.cmd' : 'electron-vite',
)

const child = spawn(bin, ['dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: isWin,
  env: process.env,
})

child.on('exit', code => process.exit(code ?? 0))
child.on('error', err => {
  console.error(`dev: failed to launch electron-vite: ${err.message}`)
  process.exit(1)
})
