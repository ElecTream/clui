#!/usr/bin/env node
// Regenerate Windows .ico assets from the existing PNG sources.
// Run manually: `node scripts/build-icons.js`
// Outputs:
//   resources/icon.ico   — multi-res app icon (16,32,48,64,128,256)
//   resources/tray.ico   — small tray icon (16,24,32)

const fs = require('fs')
const path = require('path')
const pngToIco = require('png-to-ico').default || require('png-to-ico')

const ICONSET_DIR = path.join(__dirname, '..', 'resources', 'icon.iconset')
const RESOURCES_DIR = path.join(__dirname, '..', 'resources')

async function build(outPath, sources) {
  const buffers = sources
    .map((src) => path.join(ICONSET_DIR, src))
    .filter((p) => {
      if (!fs.existsSync(p)) {
        console.warn(`[build-icons] missing source: ${p}`)
        return false
      }
      return true
    })
  if (buffers.length === 0) {
    throw new Error(`no source PNGs found for ${outPath}`)
  }
  const ico = await pngToIco(buffers)
  fs.writeFileSync(outPath, ico)
  console.log(`[build-icons] wrote ${outPath} (${buffers.length} sources, ${ico.length} bytes)`)
}

async function main() {
  await build(path.join(RESOURCES_DIR, 'icon.ico'), [
    'icon_16x16.png',
    'icon_32x32.png',
    'icon_32x32@2x.png',  // 64
    'icon_128x128.png',
    'icon_256x256.png',
  ])

  await build(path.join(RESOURCES_DIR, 'tray.ico'), [
    'icon_16x16.png',
    'icon_16x16@2x.png',  // 32
    'icon_32x32.png',
  ])
}

main().catch((err) => {
  console.error('[build-icons] failed:', err)
  process.exit(1)
})
