import { app, BrowserWindow, ipcMain, dialog, screen, globalShortcut, Tray, Menu, nativeImage, nativeTheme, shell, systemPreferences, protocol, net, desktopCapturer, clipboard, Notification } from 'electron'
import { execFile, spawn } from 'child_process'
import { basename, join, resolve, normalize } from 'path'
import { existsSync, readdirSync, statSync, createReadStream, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'fs'
import { readdir } from 'fs/promises'
import { createInterface } from 'readline'
import { homedir, tmpdir } from 'os'
import { ControlPlane } from './claude/control-plane'
import { ensureSkills, type SkillStatus } from './skills/installer'
import { fetchCatalog, listInstalled, installPlugin, uninstallPlugin } from './marketplace/catalog'
import { log as _log, LOG_FILE, flushLogs } from './logger'
import { getCliEnv } from './cli-env'
import { autoUpdater } from 'electron-updater'
import { SearchManager } from './search/search-manager'
import { IPC, OVERLAY_BAR_WIDTH, OVERLAY_PILL_HEIGHT, OVERLAY_PILL_BOTTOM_MARGIN } from '../shared/types'
import type { RunOptions, NormalizedEvent, EnrichedError, BtwOptions, PreferredTerminalId, TerminalId, TerminalInstallation } from '../shared/types'

const DEBUG_MODE = process.env.CLUI_DEBUG === '1'
const SPACES_DEBUG = DEBUG_MODE || process.env.CLUI_SPACES_DEBUG === '1'

function log(msg: string): void {
  _log('main', msg)
}

let mainWindow: BrowserWindow | null = null
// Phase 0.1 — host window. Holds Conversation/Settings/Marketplace/etc. as a
// real solid rectangular surface so its shadow + edges don't alpha-bleed
// across the pill's transparent canvas. Stays paired with the pill (same
// always-on-top + skip-taskbar + cross-space membership) so the overlay
// metaphor is preserved.
let hostWindow: BrowserWindow | null = null
let tray: Tray | null = null
let screenshotCounter = 0
let toggleSequence = 0
let forceQuit = false
let lastWindowBounds: Electron.Rectangle | null = null

// Module-scope so the background-agent registry (constructed before app-ready)
// and the auto-updater (which lands inside app.whenReady) can both ask the
// tray to re-render. The function only fires once tray + the menu builder
// have been wired up inside whenReady.
let rebuildTrayMenu: (() => void) = () => {}

// Feature flag: enable PTY interactive permissions transport
const INTERACTIVE_PTY = process.env.CLUI_INTERACTIVE_PERMISSIONS_PTY === '1'

const controlPlane = new ControlPlane(INTERACTIVE_PTY)

// Keep native width fixed to avoid renderer animation vs setBounds race.
// The UI itself still launches in compact mode; extra width is transparent/click-through.
// Values are imported from shared/types to stay in sync with the renderer.
const BAR_WIDTH = OVERLAY_BAR_WIDTH
const PILL_HEIGHT = OVERLAY_PILL_HEIGHT       // Fixed native window height — extra room for expanded UI + shadow buffers
const PILL_BOTTOM_MARGIN = OVERLAY_PILL_BOTTOM_MARGIN

// ─── Broadcast to renderer ───

function broadcast(channel: string, ...args: unknown[]): void {
  // Phase 0.1 — fan out to every clui-owned BrowserWindow we know about.
  // Both pill and host renderers subscribe to the same store-sync channels
  // so events from one (e.g. WINDOW_SHOWN, ACTIVATE_TAB_BY_INDEX) reach the
  // other.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
  if (hostWindow && !hostWindow.isDestroyed()) {
    hostWindow.webContents.send(channel, ...args)
  }
}

// ─── Search ───

const searchManager = new SearchManager((status) => {
  broadcast(IPC.SEARCH_INDEX_STATUS, status)
})

// ─── Terminal detection / launch ───

type PlistValue = string | number | boolean | null | PlistObject | PlistValue[]

interface PlistObject {
  [key: string]: PlistValue
}

type TerminalLaunchStrategy = 'open-script' | 'spawn-alacritty'

interface InstalledTerminal extends TerminalInstallation {
  appPath: string
  execPath?: string
  launchStrategy: TerminalLaunchStrategy
}

const TERMINAL_SCRIPT_EXTENSIONS = new Set(['command', 'tool'])
const TERMINAL_SCRIPT_CONTENT_TYPES = new Set(['com.apple.terminal.shell-script'])
const TERMINAL_DISCOVERY_CACHE_MS = 15_000

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)]
}

function stripAppExtension(name: string): string {
  return name.endsWith('.app') ? name.slice(0, -4) : name
}

function getAppLabel(info: PlistObject, appPath: string): string {
  const displayName = typeof info.CFBundleDisplayName === 'string' && info.CFBundleDisplayName.trim().length > 0
    ? info.CFBundleDisplayName
    : typeof info.CFBundleName === 'string' && info.CFBundleName.trim().length > 0
      ? info.CFBundleName
      : stripAppExtension(basename(appPath))

  return displayName.trim()
}

function getAppId(info: PlistObject, appPath: string): TerminalId {
  if (typeof info.CFBundleIdentifier === 'string' && info.CFBundleIdentifier.trim().length > 0) {
    return info.CFBundleIdentifier
  }

  return `app:${stripAppExtension(basename(appPath)).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

async function discoverAppBundles(rootDir: string, depth = 1): Promise<string[]> {
  if (!existsSync(rootDir)) return []

  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => [])
  const bundles = await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory()) return []

    const fullPath = join(rootDir, entry.name)
    if (entry.name.endsWith('.app')) {
      return [fullPath]
    }

    if (depth > 0) {
      return discoverAppBundles(fullPath, depth - 1)
    }

    return []
  }))

  return bundles.flat()
}

function readBundleInfo(appPath: string): Promise<PlistObject | null> {
  const plistPath = join(appPath, 'Contents', 'Info.plist')
  if (!existsSync(plistPath)) return Promise.resolve(null)

  return new Promise((resolve) => {
    // execFile typings split: stdio belongs to ExecFileOptions (no encoding),
    // 'utf8' belongs to ExecFileOptionsWithStringEncoding (no stdio). Drop
    // stdio (default is fine for our purpose: stdout pipe, stdin/stderr ignore
    // via maxBuffer + .stderr access).
    execFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plistPath], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    }, (err: Error | null, stdout: string | Buffer) => {
      if (err) {
        resolve(null)
        return
      }

      try {
        const parsed = JSON.parse(String(stdout))
        resolve(parsed && typeof parsed === 'object' ? parsed as PlistObject : null)
      } catch {
        resolve(null)
      }
    })
  })
}

function getDocumentTypes(info: PlistObject): PlistObject[] {
  if (!Array.isArray(info.CFBundleDocumentTypes)) return []
  return info.CFBundleDocumentTypes.filter((value): value is PlistObject => value != null && typeof value === 'object' && !Array.isArray(value))
}

function getStringArray(value: PlistValue | undefined): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function supportsShellScriptDocuments(info: PlistObject): boolean {
  return getDocumentTypes(info).some((documentType) => {
    const extensions = getStringArray(documentType.CFBundleTypeExtensions).map((extension) => extension.toLowerCase())
    if (extensions.some((extension) => TERMINAL_SCRIPT_EXTENSIONS.has(extension))) return true

    const contentTypes = getStringArray(documentType.LSItemContentTypes)
    return contentTypes.some((contentType) => TERMINAL_SCRIPT_CONTENT_TYPES.has(contentType))
  })
}

function getExecutablePath(info: PlistObject, appPath: string): string | null {
  if (typeof info.CFBundleExecutable !== 'string' || info.CFBundleExecutable.trim().length === 0) return null

  const execPath = join(appPath, 'Contents', 'MacOS', info.CFBundleExecutable)
  return existsSync(execPath) ? execPath : null
}

function detectLaunchStrategy(info: PlistObject, execPath: string | null): TerminalLaunchStrategy | null {
  if (supportsShellScriptDocuments(info)) return 'open-script'

  // Some terminal apps do not register shell-script handlers but can still be
  // launched directly with an executable command interface.
  if (execPath && (info.CFBundleIdentifier === 'org.alacritty' || basename(execPath).toLowerCase() === 'alacritty')) {
    return 'spawn-alacritty'
  }

  return null
}

async function buildInstalledTerminal(appPath: string): Promise<InstalledTerminal | null> {
  const info = await readBundleInfo(appPath)
  if (!info) return null

  const execPath = getExecutablePath(info, appPath)
  const launchStrategy = detectLaunchStrategy(info, execPath)
  if (!launchStrategy) return null

  return {
    id: getAppId(info, appPath),
    label: getAppLabel(info, appPath),
    appPath,
    ...(execPath ? { execPath } : {}),
    launchStrategy,
  }
}

let installedTerminalCache: { scannedAt: number; terminals: InstalledTerminal[] } | null = null
let installedTerminalScanPromise: Promise<InstalledTerminal[]> | null = null

async function scanInstalledTerminals(): Promise<InstalledTerminal[]> {
  const appRoots = uniquePaths([
    '/Applications',
    '/System/Applications',
    join(homedir(), 'Applications'),
  ])

  const appPaths = uniquePaths((await Promise.all(appRoots.map((root) => discoverAppBundles(root)))).flat())
  const terminals = (await Promise.all(appPaths.map((appPath) => buildInstalledTerminal(appPath))))
    .flatMap((terminal) => terminal ? [terminal] : [])
    .reduce<InstalledTerminal[]>((unique, terminal) => {
      if (unique.some((candidate) => candidate.id === terminal.id)) return unique
      unique.push(terminal)
      return unique
    }, [])
    .sort((a, b) => a.label.localeCompare(b.label))

  installedTerminalCache = {
    scannedAt: Date.now(),
    terminals,
  }

  return terminals
}

function refreshInstalledTerminals(): Promise<InstalledTerminal[]> {
  if (installedTerminalScanPromise) return installedTerminalScanPromise

  installedTerminalScanPromise = scanInstalledTerminals().finally(() => {
    installedTerminalScanPromise = null
  })

  return installedTerminalScanPromise
}

async function getInstalledTerminals(): Promise<InstalledTerminal[]> {
  if (installedTerminalCache && Date.now() - installedTerminalCache.scannedAt < TERMINAL_DISCOVERY_CACHE_MS) {
    return installedTerminalCache.terminals
  }

  if (installedTerminalCache) {
    void refreshInstalledTerminals()
    return installedTerminalCache.terminals
  }

  return refreshInstalledTerminals()
}

async function findInstalledTerminal(preferredId: PreferredTerminalId | TerminalId | null | undefined): Promise<InstalledTerminal | null> {
  if (!preferredId || preferredId === 'auto') return null
  return (await getInstalledTerminals()).find((terminal) => terminal.id === preferredId) ?? null
}

function quoteForShell(input: string): string {
  return `'${input.replace(/'/g, `'\\''`)}'`
}

function buildClaudeInvocation(sessionId: string | null): string {
  return sessionId ? `claude --resume ${quoteForShell(sessionId)}` : 'claude'
}

function buildClaudeShellCommand(projectPath: string, sessionId: string | null): string {
  return `cd -- ${quoteForShell(projectPath)} && ${buildClaudeInvocation(sessionId)}`
}

function createTerminalLaunchScript(projectPath: string, sessionId: string | null): string {
  const scriptsDir = join(tmpdir(), 'clui-open-in-cli')
  mkdirSync(scriptsDir, { recursive: true })

  const scriptPath = join(
    scriptsDir,
    `launch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.command`,
  )

  writeFileSync(scriptPath, [
    '#!/bin/zsh',
    `cd -- ${quoteForShell(projectPath)} || exit 1`,
    buildClaudeInvocation(sessionId),
    '',
  ].join('\n'))
  chmodSync(scriptPath, 0o755)

  return scriptPath
}

function openScriptInTerminal(scriptPath: string, appPath?: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const args = appPath ? ['-a', appPath, scriptPath] : [scriptPath]
    execFile('/usr/bin/open', args, (err) => {
      if (err) reject(err)
      else resolvePromise()
    })
  })
}

async function launchDefaultTerminal(sessionId: string | null, projectPath: string): Promise<void> {
  if (process.platform === 'win32') {
    await launchWindowsTerminal(sessionId, projectPath)
    return
  }
  const scriptPath = createTerminalLaunchScript(projectPath, sessionId)
  await openScriptInTerminal(scriptPath)
}

/**
 * Launch Claude in a new Windows terminal window, honoring the user's
 * "default terminal application" choice from
 *   Settings → Privacy & Security → For Developers → Terminal
 * (Windows Terminal / Console Host / Let Windows decide).
 *
 * We invoke `cmd /c start "" /D <cwd> cmd /k claude ...`. The `start`
 * command spawns a new console process and Windows decides which
 * terminal app hosts it based on the default-terminal setting — so a
 * user who picked WT gets WT, a user who picked Console Host gets
 * conhost, etc. Previously we hard-launched `wt.exe` first which
 * bypassed that setting.
 */
async function launchWindowsTerminal(sessionId: string | null, projectPath: string): Promise<void> {
  const claudeArgs = sessionId ? ['claude', '--resume', sessionId] : ['claude']
  // `start ""` — empty title arg avoids start treating the next quoted
  // string as a window title. /D sets the working directory of the
  // spawned cmd. `cmd /k` keeps the shell open after claude exits so
  // the user can keep typing.
  const child = spawn(
    'cmd.exe',
    ['/c', 'start', '', '/D', projectPath, 'cmd.exe', '/k', ...claudeArgs],
    {
      cwd: projectPath,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    },
  )
  child.unref()
}

async function launchTerminal(terminal: InstalledTerminal, sessionId: string | null, projectPath: string): Promise<void> {
  if (terminal.launchStrategy === 'open-script') {
    const scriptPath = createTerminalLaunchScript(projectPath, sessionId)
    await openScriptInTerminal(scriptPath, terminal.appPath)
    return
  }

  if (terminal.launchStrategy === 'spawn-alacritty') {
    const shellCommand = `${buildClaudeInvocation(sessionId)}; exec "\${SHELL:-/bin/zsh}" -l`
    const child = spawn(terminal.execPath || 'alacritty', [
      '--working-directory',
      projectPath,
      '-e',
      '/bin/zsh',
      '-lc',
      shellCommand,
    ], {
      cwd: projectPath,
      detached: true,
      stdio: 'ignore',
    })

    child.unref()
  }
}

ipcMain.handle(IPC.SEARCH_SESSIONS, async (_e, query: string) => {
  searchManager.ensureReady()
  return searchManager.search(query, 10)
})

ipcMain.on(IPC.SEARCH_BUILD_INDEX, () => {
  searchManager.ensureReady()
})

function snapshotWindowState(reason: string): void {
  if (!SPACES_DEBUG) return
  if (!mainWindow || mainWindow.isDestroyed()) {
    log(`[spaces] ${reason} window=none`)
    return
  }

  const b = mainWindow.getBounds()
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const visibleOnAll = mainWindow.isVisibleOnAllWorkspaces()
  const wcFocused = mainWindow.webContents.isFocused()

  log(
    `[spaces] ${reason} ` +
    `vis=${mainWindow.isVisible()} focused=${mainWindow.isFocused()} wcFocused=${wcFocused} ` +
    `alwaysOnTop=${mainWindow.isAlwaysOnTop()} allWs=${visibleOnAll} ` +
    `bounds=(${b.x},${b.y},${b.width}x${b.height}) ` +
    `cursor=(${cursor.x},${cursor.y}) display=${display.id} ` +
    `workArea=(${display.workArea.x},${display.workArea.y},${display.workArea.width}x${display.workArea.height})`
  )
}

function scheduleToggleSnapshots(toggleId: number, phase: 'show' | 'hide'): void {
  if (!SPACES_DEBUG) return
  const probes = [0, 100, 400, 1200]
  for (const delay of probes) {
    setTimeout(() => {
      snapshotWindowState(`toggle#${toggleId} ${phase} +${delay}ms`)
    }, delay)
  }
}


// ─── Wire ControlPlane events → renderer ───

controlPlane.on('event', (tabId: string, event: NormalizedEvent) => {
  broadcast('clui:normalized-event', tabId, event)
})

controlPlane.on('tab-status-change', (tabId: string, newStatus: string, oldStatus: string) => {
  broadcast('clui:tab-status-change', tabId, newStatus, oldStatus)
})

controlPlane.on('error', (tabId: string, error: EnrichedError) => {
  broadcast('clui:enriched-error', tabId, error)
})

// ─── Window Creation ───

function createWindow(): void {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { width: screenWidth, height: screenHeight } = display.workAreaSize
  const { x: dx, y: dy } = display.workArea

  const x = dx + Math.round((screenWidth - BAR_WIDTH) / 2)
  const y = dy + screenHeight - PILL_HEIGHT - PILL_BOTTOM_MARGIN

  mainWindow = new BrowserWindow({
    width: BAR_WIDTH,
    height: PILL_HEIGHT,
    x,
    y,
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),  // NSPanel — non-activating, joins all spaces
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    // roundedCorners is macOS-only; setting it on Windows is ignored and in some
    // Electron 35 builds triggers a brief DWM chrome flash when transparency is
    // re-applied. Explicitly mac-only.
    ...(process.platform === 'darwin' ? { roundedCorners: true } : {}),
    // Windows: thickFrame defaults to true even with frame:false, which keeps the
    // DWM "thick frame" + shadow + resize border invisible-but-present. That
    // invisible frame is what occasionally flashes a "Clui" title bar when the
    // compositor restarts or the window's always-on-top level toggles. Off.
    ...(process.platform === 'win32' ? { thickFrame: false } : {}),
    // Don't paint anything until ready-to-show fires. Without this, transparent
    // windows on Windows can render one frame of system chrome before the
    // renderer's transparent body composites over it.
    paintWhenInitiallyHidden: false,
    backgroundColor: '#00000000',
    show: false,
    icon: join(
      __dirname,
      '../../resources',
      process.platform === 'darwin' ? 'icon.icns' : process.platform === 'win32' ? 'icon.ico' : 'icon.png',
    ),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Belt-and-suspenders: panel already joins all spaces and floats,
  // but explicit flags ensure correct behavior on older Electron builds.
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  mainWindow.setAlwaysOnTop(true, 'screen-saver')

  // The window is transparent + click-through, so a renderer crash before
  // first paint leaves nothing visible — the overlay would simply seem to
  // never open. Surface the cause to ~/.clui-debug.log instead of silently
  // hanging on ready-to-show.
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log(`[renderer] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`)
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log(`[renderer] did-fail-load code=${code} desc="${desc}" url=${url}`)
  })
  mainWindow.webContents.on('preload-error', (_e, preloadPath, err) => {
    log(`[renderer] preload-error path=${preloadPath} err=${err.message}`)
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    // setIgnoreMouseEvents is intentionally NOT enabled here anymore.
    // Stage 2e shrunk the pill window to just the visible chrome (740×160)
    // so there's no longer a giant transparent canvas around the UI that
    // needed click-through. The only transparent areas now are the small
    // rounded-corner clip-outs of the pill itself. Letting those capture
    // clicks instead of passing them through is the price of getting
    // native `-webkit-app-region: drag` to work — and it does work, with
    // zero IPC and proper multi-monitor handling.
    if (process.env.ELECTRON_RENDERER_URL && process.env.CLUI_DEVTOOLS === '1') {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  app.on('before-quit', () => {
    forceQuit = true
    searchManager.dispose()
  })
  mainWindow.on('close', (e) => {
    if (!forceQuit) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // Phase 0.1 stage 2 — host follows pill. 'move' fires continuously
  // during native drag (and `setBounds` calls), so this is essentially
  // free (no IPC). Spring physics polish lands later; for now an instant
  // snap is enough to break the "host stays still while pill flies
  // around" feel.
  mainWindow.on('move', () => {
    applyHostOffsetFromPill()
    lastWindowBounds = mainWindow!.getBounds()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  lastWindowBounds = mainWindow.getBounds()
}

function resetWindowPosition(): void {
  if (!mainWindow) return

  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { width: sw, height: sh } = display.workAreaSize
  const { x: dx, y: dy } = display.workArea

  mainWindow.setBounds({
    x: dx + Math.round((sw - BAR_WIDTH) / 2),
    y: dy + sh - PILL_HEIGHT - PILL_BOTTOM_MARGIN,
    width: BAR_WIDTH,
    height: PILL_HEIGHT,
  })
  lastWindowBounds = mainWindow.getBounds()
}

/** Clamp saved bounds to a valid display work area so the window is never unreachable. */
function clampBoundsToDisplay(bounds: Electron.Rectangle): Electron.Rectangle {
  const displays = screen.getAllDisplays()
  // Find the display whose center is closest to the saved bounds center
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  let best = displays[0]
  let bestDist = Infinity
  for (const d of displays) {
    const dcx = d.workArea.x + d.workArea.width / 2
    const dcy = d.workArea.y + d.workArea.height / 2
    const dist = Math.abs(cx - dcx) + Math.abs(cy - dcy)
    if (dist < bestDist) { bestDist = dist; best = d }
  }
  const wa = best.workArea
  return {
    x: Math.max(wa.x, Math.min(bounds.x, wa.x + wa.width - bounds.width)),
    y: Math.max(wa.y, Math.min(bounds.y, wa.y + wa.height - bounds.height)),
    width: bounds.width,
    height: bounds.height,
  }
}

function showWindow(source = 'unknown'): void {
  if (!mainWindow) return
  const toggleId = ++toggleSequence

  // Always show on the display where the cursor currently is.
  // If the cursor moved to a different display since the last show,
  // reposition the overlay to that display (centered, bottom-pinned).
  const cursor = screen.getCursorScreenPoint()
  const cursorDisplay = screen.getDisplayNearestPoint(cursor)

  if (lastWindowBounds) {
    const savedDisplay = screen.getDisplayMatching(lastWindowBounds)
    if (savedDisplay.id !== cursorDisplay.id) {
      // Cursor is on a different display — reposition to cursor's display
      const { width: sw, height: sh } = cursorDisplay.workAreaSize
      const { x: dx, y: dy } = cursorDisplay.workArea
      lastWindowBounds = {
        x: dx + Math.round((sw - BAR_WIDTH) / 2),
        y: dy + sh - PILL_HEIGHT - PILL_BOTTOM_MARGIN,
        width: BAR_WIDTH,
        height: PILL_HEIGHT,
      }
    }
    // Clamp before applying — display config may have changed (monitor disconnected, scaling changed)
    mainWindow.setBounds(clampBoundsToDisplay(lastWindowBounds))
  }

  // Always re-assert space membership — the flag can be lost after hide/show cycles
  // and must be set before show() so the window joins the active Space, not its
  // last-known Space.
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (SPACES_DEBUG) {
    const b = mainWindow.getBounds()
    log(`[spaces] showWindow#${toggleId} source=${source} preserve-bounds=(${b.x},${b.y},${b.width}x${b.height})`)
    snapshotWindowState(`showWindow#${toggleId} pre-show`)
  }
  // As an accessory app (app.dock.hide), show() + focus gives keyboard
  // without deactivating the active app — hover preserved everywhere.
  mainWindow.show()
  if (lastWindowBounds) {
    mainWindow.setBounds(clampBoundsToDisplay(lastWindowBounds))
  }
  mainWindow.webContents.focus()
  broadcast(IPC.WINDOW_SHOWN)
  if (SPACES_DEBUG) scheduleToggleSnapshots(toggleId, 'show')
}

function toggleWindow(source = 'unknown'): void {
  if (!mainWindow) return
  const toggleId = ++toggleSequence
  if (SPACES_DEBUG) {
    log(`[spaces] toggle#${toggleId} source=${source} start`)
    snapshotWindowState(`toggle#${toggleId} pre`)
  }

  if (mainWindow.isVisible()) {
    // Pair pill ↔ host: capture host's current visibility so we can
    // restore it on next summon (Claude-anywhere on-demand: open, peek,
    // dismiss as a unit).
    const hostWasVisible = !!(hostWindow && !hostWindow.isDestroyed() && hostWindow.isVisible())
    saveHostState({ bounds: loadHostState().bounds, visibleOnLastHide: hostWasVisible })

    mainWindow.hide()
    if (hostWasVisible) {
      hostWindow!.hide()
    }
    if (SPACES_DEBUG) scheduleToggleSnapshots(toggleId, 'hide')
  } else {
    showWindow(source)
    // Restore host to its pre-dismissal state. Tied to pill summon so the
    // user doesn't have to remember a separate hotkey for the host.
    if (loadHostState().visibleOnLastHide) {
      showHostWindow()
    }
  }
}

// ─── Resize ───
// Fixed-height mode: ignore renderer resize events to prevent jank.
// The native window stays at PILL_HEIGHT; all expand/collapse happens inside the renderer.

ipcMain.on(IPC.RESIZE_HEIGHT, () => {
  // No-op — fixed height window, no dynamic resize
})

ipcMain.on(IPC.SET_WINDOW_WIDTH, () => {
  // No-op — native width is fixed to keep expand/collapse animation smooth.
})

ipcMain.handle(IPC.ANIMATE_HEIGHT, () => {
  // No-op — kept for API compat, animation handled purely in renderer
})

ipcMain.on(IPC.HIDE_WINDOW, () => {
  mainWindow?.hide()
})

ipcMain.handle(IPC.IS_VISIBLE, () => {
  return mainWindow?.isVisible() ?? false
})

function getOverlayDisplay(): Electron.Display {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return screen.getDisplayMatching(mainWindow.getBounds())
  }
  const cursor = screen.getCursorScreenPoint()
  return screen.getDisplayNearestPoint(cursor)
}

ipcMain.on(IPC.RESET_WINDOW_POSITION, () => {
  resetWindowPosition()
})

// ─── Host window (Phase 0.1) ───
//
// The host is a separate solid BrowserWindow that holds the conversation,
// settings, marketplace, and search surfaces. The pill stays as the small
// always-on-top transparent summon; non-pill content lives here so its
// box-shadow + rounded corners + scrims paint into a real rectangular
// surface instead of bleeding through the pill's alpha-blended canvas.
//
// First commit: window infrastructure only. Renders a placeholder while
// the migration of in-pill content is staged.

const HOST_BOUNDS_FILE = 'host-window-bounds.json'
const HOST_DEFAULT_WIDTH = 960
const HOST_DEFAULT_HEIGHT = 700
const HOST_MIN_WIDTH = 480
const HOST_MIN_HEIGHT = 320
// Vertical gap between the bottom of the host and the top of the pill.
// The pill sits flush at the bottom of the work area; the host floats
// above it.
const HOST_PILL_GAP = 12

interface HostBounds {
  x: number
  y: number
  width: number
  height: number
}

interface HostState {
  bounds: HostBounds | null
  /** Was the host visible the last time the pill was hidden? Used to
   *  restore host visibility on next pill summon. */
  visibleOnLastHide: boolean
}

function hostStatePath(): string {
  return join(app.getPath('userData'), HOST_BOUNDS_FILE)
}

function loadHostState(): HostState {
  try {
    const raw = require('fs').readFileSync(hostStatePath(), 'utf-8')
    const parsed = JSON.parse(raw)
    const bounds: HostBounds | null =
      typeof parsed?.x === 'number' &&
      typeof parsed?.y === 'number' &&
      typeof parsed?.width === 'number' &&
      typeof parsed?.height === 'number'
        ? { x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height }
        : parsed?.bounds && typeof parsed.bounds.x === 'number'
          ? parsed.bounds as HostBounds
          : null
    return {
      bounds,
      visibleOnLastHide: typeof parsed?.visibleOnLastHide === 'boolean' ? parsed.visibleOnLastHide : false,
    }
  } catch {}
  return { bounds: null, visibleOnLastHide: false }
}

function saveHostState(state: HostState): void {
  try {
    // Flat shape for backwards compat with the v1 layout (just x/y/w/h
    // at the top level), with the new visibleOnLastHide alongside.
    const payload = state.bounds
      ? { ...state.bounds, visibleOnLastHide: state.visibleOnLastHide }
      : { visibleOnLastHide: state.visibleOnLastHide }
    require('fs').writeFileSync(hostStatePath(), JSON.stringify(payload))
  } catch (err) {
    log(`[host] saveHostState failed: ${(err as Error).message}`)
  }
}

function loadHostBounds(): HostBounds | null {
  return loadHostState().bounds
}

function saveHostBounds(b: HostBounds): void {
  const current = loadHostState()
  saveHostState({ bounds: b, visibleOnLastHide: current.visibleOnLastHide })
}

/** Compute a default placement: centered above the pill on the pill's display. */
function computeDefaultHostBounds(): HostBounds {
  const display = getOverlayDisplay()
  const wa = display.workArea
  const width = HOST_DEFAULT_WIDTH
  const height = HOST_DEFAULT_HEIGHT
  // Center horizontally on the pill's display, sit above the pill+gap.
  const x = wa.x + Math.round((wa.width - width) / 2)
  const pillTop = wa.y + wa.height - PILL_HEIGHT - PILL_BOTTOM_MARGIN
  const y = Math.max(wa.y, pillTop - height - HOST_PILL_GAP)
  return { x, y, width, height }
}

function clampHostBoundsToDisplay(b: HostBounds): HostBounds {
  const displays = screen.getAllDisplays()
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  let best = displays[0]
  let bestDist = Infinity
  for (const d of displays) {
    const dcx = d.workArea.x + d.workArea.width / 2
    const dcy = d.workArea.y + d.workArea.height / 2
    const dist = Math.abs(cx - dcx) + Math.abs(cy - dcy)
    if (dist < bestDist) { bestDist = dist; best = d }
  }
  const wa = best.workArea
  const width = Math.min(b.width, wa.width)
  const height = Math.min(b.height, wa.height)
  return {
    x: Math.max(wa.x, Math.min(b.x, wa.x + wa.width - width)),
    y: Math.max(wa.y, Math.min(b.y, wa.y + wa.height - height)),
    width,
    height,
  }
}

function createHostWindow(): BrowserWindow {
  if (hostWindow && !hostWindow.isDestroyed()) return hostWindow

  const initial = clampHostBoundsToDisplay(loadHostBounds() || computeDefaultHostBounds())

  hostWindow = new BrowserWindow({
    x: initial.x,
    y: initial.y,
    width: initial.width,
    height: initial.height,
    minWidth: HOST_MIN_WIDTH,
    minHeight: HOST_MIN_HEIGHT,
    // Solid rectangular surface — the whole point of this window. No
    // transparency means box-shadow and antialiased corners stay inside
    // the OS-clipped window region instead of leaking onto the desktop.
    transparent: false,
    frame: false,
    resizable: true,
    movable: true,
    // Pair with pill: float above other apps + ride along all virtual
    // desktops + don't appear in the taskbar. Preserves the "this is part
    // of the overlay" feel.
    alwaysOnTop: true,
    skipTaskbar: true,
    // Real DWM shadow — safe now that the window is rectangular.
    hasShadow: true,
    show: false,
    paintWhenInitiallyHidden: false,
    backgroundColor: '#0f0f0f',
    icon: join(
      __dirname,
      '../../resources',
      process.platform === 'darwin' ? 'icon.icns' : process.platform === 'win32' ? 'icon.ico' : 'icon.png',
    ),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  hostWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hostWindow.setAlwaysOnTop(true, 'screen-saver')

  hostWindow.once('ready-to-show', () => {
    log('[host] ready-to-show')
    if (process.env.ELECTRON_RENDERER_URL && process.env.CLUI_DEVTOOLS === '1') {
      hostWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // Persist bounds whenever the user moves or resizes. Debounce by
  // listening to the move/resize end transitions (Electron fires these
  // continuously while dragging).
  let saveTimer: NodeJS.Timeout | null = null
  const persistBounds = () => {
    if (!hostWindow || hostWindow.isDestroyed()) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!hostWindow || hostWindow.isDestroyed()) return
      const b = hostWindow.getBounds()
      saveHostBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
    }, 200)
  }
  hostWindow.on('moved', () => {
    persistBounds()
    // User-initiated host drag: relock the offset so future pill drags
    // carry the host at the *new* relative place, not the original.
    captureHostOffset()
  })
  hostWindow.on('resized', () => {
    persistBounds()
    // User finished resizing — that's the new authoritative size we
    // re-assert during pill-driven follows.
    captureHostKnownSize()
  })

  // Initial size — captured before any pill-driven follows so the
  // first follow has a stable size to assert.
  captureHostKnownSize()

  hostWindow.on('close', (e) => {
    // Match pill behavior: "close" hides; only forceQuit truly destroys.
    if (!forceQuit) {
      e.preventDefault()
      hostWindow?.hide()
      broadcast(IPC.HOST_WINDOW_VISIBILITY, false)
    }
  })

  hostWindow.on('show', () => broadcast(IPC.HOST_WINDOW_VISIBILITY, true))
  hostWindow.on('hide', () => broadcast(IPC.HOST_WINDOW_VISIBILITY, false))

  // Load the same renderer entry as the pill, but tag the URL so the
  // renderer can branch on which window it's rendering. Single React
  // bundle, two top-level UIs.
  const hostQuery = '?window=host'
  if (process.env.ELECTRON_RENDERER_URL) {
    hostWindow.loadURL(process.env.ELECTRON_RENDERER_URL + hostQuery)
  } else {
    hostWindow.loadFile(join(__dirname, '../renderer/index.html'), { search: hostQuery.slice(1) })
  }

  return hostWindow
}

/**
 * Per-tab pop-out windows. The "viewport" architecture: each pop-out is a
 * fresh BrowserWindow loading the same renderer bundle with
 * `?window=popout&tabId=<id>`. State (messages, status, permissions)
 * lives in main and streams into the pop-out the same way it streams into
 * the pill / host. Multiple pop-outs of the same tab are allowed.
 *
 * Position is sticky per-tabId across launches; the pop-out does NOT
 * follow the pill on drag (otherwise dragging the pill across the screen
 * flings every popped-out window around — the user picked that position
 * deliberately). Closing a pop-out is destructive (no hide-and-restore
 * like the host) — it just goes away; the tab keeps running in main.
 */
const popoutWindows = new Map<string, BrowserWindow>()
const POPOUT_DEFAULT_WIDTH = 480
const POPOUT_DEFAULT_HEIGHT = 720

function computeDefaultPopoutBounds(): HostBounds {
  // Default placement: centered on the pill's display but offset right of
  // the host so they don't stack on first open.
  const display = getOverlayDisplay()
  const wa = display.workArea
  const width = POPOUT_DEFAULT_WIDTH
  const height = POPOUT_DEFAULT_HEIGHT
  const x = wa.x + Math.min(wa.width - width - 20, Math.round((wa.width - width) / 2 + 240))
  const y = wa.y + Math.max(20, Math.round((wa.height - height) / 2))
  return { x, y, width, height }
}

function loadPopoutBoundsKey(tabId: string): string {
  return `clui:popout-bounds:${tabId}`
}

function loadPopoutBounds(tabId: string): HostBounds | null {
  try {
    const settingsPath = join(app.getPath('userData'), 'window-bounds.json')
    if (!existsSync(settingsPath)) return null
    const raw = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, HostBounds>
    return raw[loadPopoutBoundsKey(tabId)] ?? null
  } catch {
    return null
  }
}

function savePopoutBounds(tabId: string, b: HostBounds): void {
  try {
    const settingsPath = join(app.getPath('userData'), 'window-bounds.json')
    const raw = (existsSync(settingsPath)
      ? JSON.parse(readFileSync(settingsPath, 'utf8'))
      : {}) as Record<string, HostBounds>
    raw[loadPopoutBoundsKey(tabId)] = b
    writeFileSync(settingsPath, JSON.stringify(raw, null, 2))
  } catch {
    // Best effort — pop-out bounds are nice-to-have, not load-bearing.
  }
}

function createPopoutWindow(tabId: string): BrowserWindow {
  const existing = popoutWindows.get(tabId)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return existing
  }

  const initial = clampHostBoundsToDisplay(loadPopoutBounds(tabId) || computeDefaultPopoutBounds())

  const win = new BrowserWindow({
    x: initial.x,
    y: initial.y,
    width: initial.width,
    height: initial.height,
    minWidth: 360,
    minHeight: 480,
    transparent: false,
    frame: false,
    resizable: true,
    movable: true,
    // Same overlay membership as host — ride along virtual desktops, no
    // taskbar pollution. alwaysOnTop is intentional: the user popped this
    // out *because* they want to keep it visible.
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    show: false,
    paintWhenInitiallyHidden: false,
    backgroundColor: '#0f0f0f',
    icon: join(
      __dirname,
      '../../resources',
      process.platform === 'darwin' ? 'icon.icns' : process.platform === 'win32' ? 'icon.ico' : 'icon.png',
    ),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'screen-saver')

  let saveTimer: NodeJS.Timeout | null = null
  const persistBounds = (): void => {
    if (win.isDestroyed()) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (win.isDestroyed()) return
      const b = win.getBounds()
      savePopoutBounds(tabId, { x: b.x, y: b.y, width: b.width, height: b.height })
    }, 200)
  }
  win.on('moved', persistBounds)
  win.on('resized', persistBounds)

  win.on('closed', () => {
    popoutWindows.delete(tabId)
  })

  win.once('ready-to-show', () => {
    win.show()
    if (process.env.ELECTRON_RENDERER_URL && process.env.CLUI_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  })

  const popoutQuery = `?window=popout&tabId=${encodeURIComponent(tabId)}`
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL + popoutQuery)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { search: popoutQuery.slice(1) })
  }

  popoutWindows.set(tabId, win)
  return win
}

ipcMain.handle(IPC.POPOUT_TAB, (_e, tabId: string) => {
  if (typeof tabId !== 'string' || tabId.length === 0) return
  createPopoutWindow(tabId)
})

/**
 * Tab-state replay broker — when a pop-out mounts it asks the pill for a
 * full snapshot of the tab including message history. We forward to the
 * pill window, await its reply, resolve the popout's promise.
 *
 * Promises are correlated by a unique replyId; if the pill never answers
 * (e.g. it's hidden mid-launch and missed the message) we time out at
 * 2s and resolve null — the popout falls back to live-tail.
 */
const pendingReplays = new Map<string, (state: unknown | null) => void>()
ipcMain.handle(IPC.REQUEST_TAB_REPLAY, async (_e, tabId: string) => {
  if (!mainWindow || mainWindow.isDestroyed()) return null
  const replyId = `replay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return new Promise<unknown | null>((resolve) => {
    const finish = (state: unknown | null): void => {
      pendingReplays.delete(replyId)
      clearTimeout(timer)
      resolve(state)
    }
    pendingReplays.set(replyId, finish)
    const timer = setTimeout(() => finish(null), 2000)
    mainWindow!.webContents.send(IPC.REPLAY_TAB_STATE_REQUEST, replyId, tabId)
  })
})
ipcMain.on(IPC.TAB_STATE_REPLAY, (_e, replyId: string, state: unknown | null) => {
  const resolver = pendingReplays.get(replyId)
  if (resolver) resolver(state)
})

/**
 * Hub → pill create-tab broker. The hub (host window) can't add a tab
 * to its local store and call it done — the pill is the canonical owner
 * of tab metadata, only the pill broadcasts tabs-snapshot. So when the
 * hub wants to start a chat, it forwards the request through main; the
 * pill creates the tab via its existing store action; the new tab
 * propagates back via tabs-snapshot. Same correlation pattern as the
 * tab-replay broker.
 */
const pendingCreateTab = new Map<string, (result: { tabId: string } | null) => void>()
ipcMain.handle(IPC.REQUEST_CREATE_TAB, async (_e, workingDirectory?: string) => {
  if (!mainWindow || mainWindow.isDestroyed()) return null
  const replyId = `mktab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return new Promise<{ tabId: string } | null>((resolve) => {
    const finish = (result: { tabId: string } | null): void => {
      pendingCreateTab.delete(replyId)
      clearTimeout(timer)
      resolve(result)
    }
    pendingCreateTab.set(replyId, finish)
    const timer = setTimeout(() => finish(null), 5000)
    mainWindow!.webContents.send(IPC.CREATE_TAB_REQUEST, replyId, workingDirectory)
  })
})
ipcMain.on(IPC.CREATE_TAB_RESULT, (_e, replyId: string, result: { tabId: string } | null) => {
  const resolver = pendingCreateTab.get(replyId)
  if (resolver) resolver(result)
})

/**
 * Generic any-window → pill action broker. Single round-trip channel for
 * all tab mutations (create / close / rename / duplicate / reorder).
 * Replaces the per-action create-tab broker above (which is kept for
 * IPC stability across builds; new code uses the generic broker).
 */
const pendingPillActions = new Map<string, (result: import('../shared/types').PillActionResult) => void>()
ipcMain.handle(IPC.REQUEST_PILL_ACTION, async (_e, action: import('../shared/types').PillAction) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: 'pill window unavailable' }
  }
  const replyId = `pa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return new Promise<import('../shared/types').PillActionResult>((resolve) => {
    const finish = (result: import('../shared/types').PillActionResult): void => {
      pendingPillActions.delete(replyId)
      clearTimeout(timer)
      resolve(result)
    }
    pendingPillActions.set(replyId, finish)
    const timer = setTimeout(() => finish({ ok: false, error: 'pill action timed out' }), 5000)
    mainWindow!.webContents.send(IPC.PILL_ACTION_REQUEST, replyId, action)
  })
})
ipcMain.on(IPC.PILL_ACTION_RESULT, (_e, replyId: string, result: import('../shared/types').PillActionResult) => {
  const resolver = pendingPillActions.get(replyId)
  if (resolver) resolver(result)
})

ipcMain.handle(IPC.CLOSE_POPOUT, (_e, tabId?: string) => {
  // tabId omitted → close the popout the call came from. With a tabId,
  // close the matching popout regardless of caller.
  if (tabId && popoutWindows.has(tabId)) {
    popoutWindows.get(tabId)?.close()
    return
  }
  const sender = BrowserWindow.fromWebContents(_e.sender)
  if (!sender) return
  for (const [id, win] of popoutWindows) {
    if (win === sender) {
      win.close()
      popoutWindows.delete(id)
      return
    }
  }
})

// Relative offset from pill top-left → host top-left. Captured the first
// time the host opens (default placement is "above and centered on the
// pill"), updated whenever the user drags the host manually so their
// preferred relationship persists.
let hostPillOffset: { dx: number; dy: number } | null = null

// Authoritative host size — set on create, on user resize, never read
// from getBounds() during a pill-driven follow. Reading getBounds()
// mid-pill-drag was returning slightly larger values each tick on
// Windows (DWM hadn't applied our previous setBounds yet, so
// getBounds was reporting an in-flight intermediate); re-asserting
// those inflated dims accumulated growth across hundreds of move
// events. Decoupling the size from the live read fixes it.
let hostKnownSize: { width: number; height: number } | null = null

function captureHostKnownSize(): void {
  if (!hostWindow || hostWindow.isDestroyed()) return
  const b = hostWindow.getBounds()
  hostKnownSize = { width: b.width, height: b.height }
}

function captureHostOffset(): void {
  if (!hostWindow || hostWindow.isDestroyed() || !mainWindow || mainWindow.isDestroyed()) return
  const h = hostWindow.getBounds()
  const p = mainWindow.getBounds()
  hostPillOffset = { dx: h.x - p.x, dy: h.y - p.y }
}

function applyHostOffsetFromPill(): void {
  if (!hostWindow || hostWindow.isDestroyed() || !mainWindow || mainWindow.isDestroyed()) return
  if (!hostPillOffset) return
  if (!hostKnownSize) return
  // Skip the relayout if the host is hidden — no point repositioning a
  // window the user can't see, and avoids re-show flicker if pill bounce
  // events fire while the user is mid-toggle.
  if (!hostWindow.isVisible()) return
  const p = mainWindow.getBounds()
  hostWindow.setBounds({
    x: Math.round(p.x + hostPillOffset.dx),
    y: Math.round(p.y + hostPillOffset.dy),
    width: hostKnownSize.width,
    height: hostKnownSize.height,
  })
}

function showHostWindow(): void {
  const win = createHostWindow()
  // Always re-assert space membership before show; lost on hide/show cycles.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.show()
  // First-time-shown calibration: lock in the offset between host and pill
  // so subsequent pill drags carry the host along at the same relative
  // place. Subsequent shows reuse the saved offset (user-respected).
  if (!hostPillOffset) {
    captureHostOffset()
  }
}

function hideHostWindow(): void {
  if (hostWindow && !hostWindow.isDestroyed()) {
    hostWindow.hide()
  }
}

function toggleHostWindow(): void {
  if (hostWindow && !hostWindow.isDestroyed() && hostWindow.isVisible()) {
    hideHostWindow()
  } else {
    showHostWindow()
  }
}

ipcMain.on(IPC.SHOW_HOST_WINDOW, () => showHostWindow())
ipcMain.on(IPC.HIDE_HOST_WINDOW, () => hideHostWindow())
ipcMain.on(IPC.TOGGLE_HOST_WINDOW, () => toggleHostWindow())
ipcMain.handle(IPC.GET_HOST_VISIBILITY, () => {
  return !!(hostWindow && !hostWindow.isDestroyed() && hostWindow.isVisible())
})

// ─── IPC Handlers (typed, strict) ───

ipcMain.handle(IPC.START, async () => {
  log('IPC START — fetching static CLI info')
  const { execSync } = require('child_process')

  let version = 'unknown'
  try {
    version = execSync('claude -v', { encoding: 'utf-8', timeout: 5000, env: getCliEnv() }).trim()
  } catch {}

  let auth: { email?: string; subscriptionType?: string; authMethod?: string } = {}
  try {
    const raw = execSync('claude auth status', { encoding: 'utf-8', timeout: 5000, env: getCliEnv() }).trim()
    auth = JSON.parse(raw)
  } catch {}

  let mcpServers: string[] = []
  try {
    const raw = execSync('claude mcp list', { encoding: 'utf-8', timeout: 5000, env: getCliEnv() }).trim()
    if (raw) mcpServers = raw.split('\n').filter(Boolean)
  } catch {}

  return { version, auth, mcpServers, projectPath: process.cwd(), homePath: require('os').homedir() }
})

ipcMain.handle(IPC.CREATE_TAB, () => {
  const tabId = controlPlane.createTab()
  log(`IPC CREATE_TAB → ${tabId}`)
  return { tabId }
})

ipcMain.on(IPC.INIT_SESSION, (_event, tabId: string) => {
  log(`IPC INIT_SESSION: ${tabId}`)
  controlPlane.initSession(tabId)
})

ipcMain.on(IPC.RESET_TAB_SESSION, (_event, tabId: string) => {
  log(`IPC RESET_TAB_SESSION: ${tabId}`)
  controlPlane.resetTabSession(tabId)
})

ipcMain.handle(IPC.PROMPT, async (_event, { tabId, requestId, options }: { tabId: string; requestId: string; options: RunOptions }) => {
  if (DEBUG_MODE) {
    log(`IPC PROMPT: tab=${tabId} req=${requestId} prompt="${options.prompt.substring(0, 100)}"`)
  } else {
    log(`IPC PROMPT: tab=${tabId} req=${requestId}`)
  }

  if (!tabId) {
    throw new Error('No tabId provided — prompt rejected')
  }
  if (!requestId) {
    throw new Error('No requestId provided — prompt rejected')
  }

  try {
    await controlPlane.submitPrompt(tabId, requestId, options)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`PROMPT error: ${msg}`)
    throw err
  }
})

ipcMain.handle(IPC.BTW_PROMPT, async (_event, opts: BtwOptions) => {
  log(`IPC BTW_PROMPT: btwId=${opts.btwId}`)

  const BTW_SYSTEM_PROMPT = [
    '<system-reminder>',
    'This is a lightweight side question. Keep your answer concise.',
    'You may use tools if truly needed, but use no more than 3 tool calls total.',
    'Prefer answering from existing knowledge over reaching for tools.',
    '</system-reminder>',
  ].join(' ')

  // Use a temp directory so the btw session isn't saved
  // alongside the user's real project sessions.
  const { mkdtempSync, rmSync } = require('fs')
  const { tmpdir } = require('os')
  const btwDir = mkdtempSync(join(tmpdir(), 'clui-btw-'))

  const cleanupBtwDir = () => {
    try { rmSync(btwDir, { recursive: true, force: true }) } catch {}
    // Also remove the Claude session transcript dir that gets created under
    // ~/.claude/projects/<encoded-btwDir>/ — these are ephemeral and would
    // accumulate indefinitely otherwise.
    try {
      const encodedBtwDir = encodeProjectPath(btwDir)
      const claudeSessionDir = join(homedir(), '.claude', 'projects', encodedBtwDir)
      rmSync(claudeSessionDir, { recursive: true, force: true })
    } catch {}
  }

  controlPlane.startBtwRun(
    opts.btwId,
    {
      prompt: opts.question,
      projectPath: btwDir,
      maxTurns: 5,
      systemPrompt: BTW_SYSTEM_PROMPT,
    },
    (text) => broadcast(IPC.BTW_EVENT, { btwId: opts.btwId, type: 'chunk', text }),
    ()     => { broadcast(IPC.BTW_EVENT, { btwId: opts.btwId, type: 'done' }); cleanupBtwDir() },
    (msg)  => { broadcast(IPC.BTW_EVENT, { btwId: opts.btwId, type: 'error', errorMessage: msg }); cleanupBtwDir() },
  )
})

ipcMain.handle(IPC.CANCEL, (_event, requestId: string) => {
  log(`IPC CANCEL: ${requestId}`)
  return controlPlane.cancel(requestId)
})

ipcMain.handle(IPC.STOP_TAB, (_event, tabId: string) => {
  log(`IPC STOP_TAB: ${tabId}`)
  return controlPlane.cancelTab(tabId)
})

ipcMain.handle(IPC.RETRY, async (_event, { tabId, requestId, options }: { tabId: string; requestId: string; options: RunOptions }) => {
  log(`IPC RETRY: tab=${tabId} req=${requestId}`)
  return controlPlane.retry(tabId, requestId, options)
})

ipcMain.handle(IPC.STATUS, () => {
  return controlPlane.getHealth()
})

ipcMain.handle(IPC.TAB_HEALTH, () => {
  return controlPlane.getHealth()
})

ipcMain.handle(IPC.CLOSE_TAB, (_event, tabId: string) => {
  log(`IPC CLOSE_TAB: ${tabId}`)
  controlPlane.closeTab(tabId)
})

ipcMain.on(IPC.SET_PERMISSION_MODE, (_event, mode: string) => {
  if (mode !== 'ask' && mode !== 'auto') {
    log(`IPC SET_PERMISSION_MODE: invalid mode "${mode}" — ignoring`)
    return
  }
  log(`IPC SET_PERMISSION_MODE: ${mode}`)
  controlPlane.setPermissionMode(mode)
})

// Phase A — model registry. Returns the curated list of models the Claude CLI
// will accept on the --model flag, including stable aliases ('sonnet', 'opus',
// 'haiku' which auto-track latest) and pinned full IDs for reproducible runs.
ipcMain.handle(IPC.LIST_MODELS, async () => {
  const { discoverModels } = await import('./claude/model-registry.js')
  return discoverModels()
})

// Phase G — Claude CLI version check. Caches result for 1h to avoid hitting
// the npm registry on every Settings panel open.
ipcMain.handle(IPC.CHECK_CLAUDE_VERSION, async (_e, force?: boolean) => {
  const { checkClaudeVersion } = await import('./claude/version-check.js')
  return checkClaudeVersion(force === true)
})

// Phase B — settings + CLAUDE.md bridge. clui treats ~/.claude/settings.json
// and ~/.claude/CLAUDE.md as canonical: edits in either app round-trip, and
// external changes (the CLI editing settings, the user editing CLAUDE.md in
// VS Code) are picked up via fs.watch and broadcast to all windows.
ipcMain.handle(IPC.READ_CLAUDE_SETTINGS, async () => {
  const { readClaudeSettings } = await import('./claude/settings-bridge.js')
  return readClaudeSettings()
})

ipcMain.handle(IPC.WRITE_CLAUDE_SETTINGS, async (_e, patch: Record<string, unknown>) => {
  const { writeClaudeSettings } = await import('./claude/settings-bridge.js')
  return writeClaudeSettings(patch)
})

ipcMain.handle(IPC.READ_GLOBAL_CLAUDEMD, async () => {
  const { readGlobalCLAUDEMd } = await import('./claude/settings-bridge.js')
  return readGlobalCLAUDEMd()
})

ipcMain.handle(IPC.WRITE_GLOBAL_CLAUDEMD, async (_e, content: string) => {
  const { writeGlobalCLAUDEMd } = await import('./claude/settings-bridge.js')
  await writeGlobalCLAUDEMd(content)
})

ipcMain.handle(IPC.READ_PROJECT_CLAUDEMD, async (_e, projectPath: string) => {
  const { readProjectCLAUDEMd } = await import('./claude/settings-bridge.js')
  return readProjectCLAUDEMd(projectPath)
})

ipcMain.handle(IPC.WRITE_PROJECT_CLAUDEMD, async (_e, { projectPath, content }: { projectPath: string; content: string }) => {
  const { writeProjectCLAUDEMd } = await import('./claude/settings-bridge.js')
  await writeProjectCLAUDEMd(projectPath, content)
})

// Start the settings watcher early so listeners get hot-reload from the start.
// Imported via dynamic import to avoid loading the module on cold paths.
import('./claude/settings-bridge.js').then(({ getSettingsWatcher }) => {
  const watcher = getSettingsWatcher()
  watcher.start()
  watcher.on('change', (kind: 'settings' | 'claudemd') => {
    broadcast(IPC.CLAUDE_SETTINGS_CHANGED, kind)
  })
}).catch((err) => log(`settings-bridge load failed: ${err?.message ?? err}`))

// Phase H — Tailscale-peer session sharing. Optional server (off by
// default) lets other clui peers on the user's Tailnet pull session
// transcripts via /rpc. Auth is a shared secret in the request body;
// network-level trust is delegated to the user's Tailscale ACLs.
import { PeerServer, PEER_DEFAULT_PORT } from './cross-machine/peer-server.js'
import { listPeerSessions, importPeerSession } from './cross-machine/peer-client.js'

let peerServer: PeerServer | null = null
let peerSecret: string | null = null

function readPeerSecretFromDisk(): string | null {
  try {
    const p = require('path').join(app.getPath('userData'), 'peer-secret.txt')
    return require('fs').readFileSync(p, 'utf8').trim() || null
  } catch {
    return null
  }
}

function writePeerSecretToDisk(secret: string): void {
  try {
    const p = require('path').join(app.getPath('userData'), 'peer-secret.txt')
    require('fs').writeFileSync(p, secret, 'utf8')
  } catch (err) {
    log(`peer-server: failed to persist secret: ${(err as Error).message}`)
  }
}

function generatePeerSecret(): string {
  return require('crypto').randomBytes(24).toString('base64url')
}

function getOrInitPeerSecret(): string {
  if (peerSecret) return peerSecret
  const stored = readPeerSecretFromDisk()
  if (stored) {
    peerSecret = stored
    return peerSecret
  }
  peerSecret = generatePeerSecret()
  writePeerSecretToDisk(peerSecret)
  return peerSecret
}

function peerServerState(): import('../shared/types').PeerServerState {
  return {
    running: !!peerServer && peerServer.isRunning(),
    port: PEER_DEFAULT_PORT,
    hostname: require('os').hostname(),
    secretPrefix: peerSecret ? peerSecret.slice(0, 6) + '…' : null,
  }
}

ipcMain.handle(IPC.PEER_GET_LOCAL_INFO, () => {
  // Initialize secret on first read so the user can copy/share it
  // even before they've started the server.
  getOrInitPeerSecret()
  return peerServerState()
})

ipcMain.handle(IPC.PEER_SERVER_START, async () => {
  const secret = getOrInitPeerSecret()
  if (!peerServer) peerServer = new PeerServer(secret, PEER_DEFAULT_PORT)
  await peerServer.start()
  const state = peerServerState()
  broadcast(IPC.PEER_SERVER_STATE, state)
  return state
})

ipcMain.handle(IPC.PEER_SERVER_STOP, async () => {
  if (peerServer) await peerServer.stop()
  const state = peerServerState()
  broadcast(IPC.PEER_SERVER_STATE, state)
  return state
})

ipcMain.handle(IPC.PEER_GENERATE_SECRET, () => {
  const next = generatePeerSecret()
  peerSecret = next
  writePeerSecretToDisk(next)
  if (peerServer) peerServer.setSecret(next)
  return peerServerState()
})

ipcMain.handle(IPC.PEER_LIST_SESSIONS, async (_e, args: { hostname: string; secret: string; port?: number }) => {
  return listPeerSessions(args)
})

ipcMain.handle(IPC.PEER_LIST_TAILSCALE_PEERS, async () => {
  const { listTailscalePeers } = await import('./cross-machine/peer-discovery.js')
  return listTailscalePeers()
})

// ─── Phase H follow-up: saved peers list ───
ipcMain.handle(IPC.PEER_LIST_SAVED, async () => {
  const { listSavedPeers } = await import('./cross-machine/saved-peers.js')
  return listSavedPeers()
})
ipcMain.handle(IPC.PEER_SAVE, async (_e, peer: import('../shared/types').SavedPeer) => {
  const { saveSavedPeer } = await import('./cross-machine/saved-peers.js')
  return saveSavedPeer(peer)
})
ipcMain.handle(IPC.PEER_REMOVE_SAVED, async (_e, hostname: string) => {
  const { removeSavedPeer } = await import('./cross-machine/saved-peers.js')
  return removeSavedPeer(hostname)
})

ipcMain.handle(IPC.PEER_IMPORT_SESSION, async (_e, args: import('../shared/types').PeerImportRequest) => {
  await importPeerSession(
    { hostname: args.hostname, secret: args.secret, port: args.port },
    args.projectPath,
    args.sessionId,
  )
})

// Phase G — upgrade the user's installed Claude CLI by spawning
// `npm i -g @anthropic-ai/claude-code` in a fresh terminal window
// (so the user can see install progress + handle any npm auth
// prompts). Uses the same Windows-default-terminal path the
// "Open in CLI" launcher uses, so whatever the user has set in
// Settings → Privacy & Security → For Developers → Terminal hosts
// the install.
ipcMain.handle(IPC.UPGRADE_CLAUDE_CLI, async (_e, command?: string) => {
  const cmd = command || 'npm install -g @anthropic-ai/claude-code'
  if (process.platform === 'win32') {
    spawn(
      'cmd.exe',
      ['/c', 'start', '', 'cmd.exe', '/k', cmd],
      { detached: true, stdio: 'ignore', windowsHide: false },
    ).unref()
    return true
  }
  // macOS / Linux: hand to the existing default-terminal launcher
  // by writing a tiny launch script.
  const tmpDir = require('os').tmpdir() as string
  const path = require('path') as typeof import('path')
  const fs = require('fs') as typeof import('fs')
  const scriptPath = path.join(tmpDir, `clui-upgrade-${Date.now()}.sh`)
  fs.writeFileSync(scriptPath, `#!/bin/sh\n${cmd}\n`, { mode: 0o755 })
  spawn('open', ['-a', 'Terminal', scriptPath], { detached: true, stdio: 'ignore' }).unref()
  return true
})

// Phase E — background-agent registry. Wraps ControlPlane.submitPrompt
// with a budget watchdog. Imported at top-level because the registry
// subscribes to controlPlane events from construction.
import { BackgroundAgentRegistry } from './claude/background-registry.js'
const backgroundAgents = new BackgroundAgentRegistry(controlPlane)
// Tracks which agents have already fired a completion notification so a
// duplicate 'update' (e.g. tab-status-change safety net) doesn't double-notify.
const notifiedAgents = new Set<string>()
backgroundAgents.on('update', (record: import('../shared/types').BackgroundAgentRecord) => {
  broadcast(IPC.BACKGROUND_AGENT_UPDATE, record)
  updateTrayBadge()
  rebuildTrayMenu()
  if (record.status !== 'running' && !notifiedAgents.has(record.tabId)) {
    notifiedAgents.add(record.tabId)
    fireAgentCompletionNotification(record)
  }
})
backgroundAgents.on('removed', (tabId: string) => {
  notifiedAgents.delete(tabId)
  updateTrayBadge()
  rebuildTrayMenu()
})

function updateTrayBadge(): void {
  if (!tray) return
  const n = backgroundAgents.activeCount()
  const baseTitle = 'clui'
  if (n > 0) {
    tray.setToolTip(`${baseTitle} — ${n} background agent${n === 1 ? '' : 's'} running`)
  } else {
    tray.setToolTip(baseTitle)
  }
}

function fireAgentCompletionNotification(
  record: import('../shared/types').BackgroundAgentRecord,
): void {
  if (!Notification.isSupported()) return
  const goalSnippet = record.goal.length > 80
    ? record.goal.slice(0, 77) + '…'
    : record.goal
  let title: string
  let body: string
  switch (record.status) {
    case 'completed': {
      const cost = record.costUsd != null ? ` · $${record.costUsd.toFixed(2)}` : ''
      const turns = record.turnsUsed != null ? ` · ${record.turnsUsed} turn${record.turnsUsed === 1 ? '' : 's'}` : ''
      title = 'Background agent finished'
      body = `${goalSnippet}${turns}${cost}`
      break
    }
    case 'budget_exceeded':
      title = 'Background agent — budget exceeded'
      body = goalSnippet
      break
    case 'cancelled':
      // User-initiated: skip the notification — they know.
      return
    case 'failed':
      title = 'Background agent failed'
      body = record.failureReason ? `${goalSnippet} — ${record.failureReason}` : goalSnippet
      break
    default:
      return
  }
  const n = new Notification({ title, body, silent: false })
  n.on('click', () => {
    showWindow('agent notification')
    if (hostWindow && !hostWindow.isDestroyed()) {
      hostWindow.show()
      hostWindow.focus()
    }
    // Ask the renderer to switch to the relevant tab.
    broadcast(IPC.ACTIVATE_TAB_BY_ID, record.tabId)
  })
  n.show()
}

ipcMain.handle(IPC.START_BACKGROUND_AGENT, async (_e, input: import('../shared/types').StartBackgroundAgentInput) => {
  return backgroundAgents.start(input)
})

ipcMain.handle(IPC.STOP_BACKGROUND_AGENT, async (_e, tabId: string) => {
  await backgroundAgents.stop(tabId)
})

ipcMain.handle(IPC.LIST_BACKGROUND_AGENTS, async () => {
  return backgroundAgents.list()
})

// Phase D — tabs snapshot sync. The pill renderer broadcasts a snapshot
// whenever its tabs/activeTabId change; main re-fans to every other
// window so they can mirror state for the conversation view.
ipcMain.on(IPC.BROADCAST_TABS_SNAPSHOT, (event, payload: import('../shared/types').TabsSnapshotPayload) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    if (win.webContents.id === event.sender.id) continue
    win.webContents.send(IPC.TABS_SNAPSHOT, payload)
  }
})

// Phase C — agents IPC. Reads/writes ~/.claude/agents/<name>.md.
ipcMain.handle(IPC.LIST_AGENTS, async () => {
  const { listAgents } = await import('./claude/agents.js')
  return listAgents()
})

ipcMain.handle(IPC.WRITE_AGENT, async (_e, agent: import('../shared/types').AgentMeta) => {
  const { writeAgent } = await import('./claude/agents.js')
  return writeAgent(agent)
})

ipcMain.handle(IPC.DELETE_AGENT, async (_e, filePath: string) => {
  const { deleteAgent } = await import('./claude/agents.js')
  return deleteAgent(filePath)
})

ipcMain.handle(IPC.PATH_FOR_NEW_AGENT, async (_e, name: string) => {
  const { pathForNewAgent } = await import('./claude/agents.js')
  return pathForNewAgent(name)
})

ipcMain.handle(IPC.RESPOND_PERMISSION, (_event, { tabId, questionId, optionId }: { tabId: string; questionId: string; optionId: string }) => {
  log(`IPC RESPOND_PERMISSION: tab=${tabId} question=${questionId} option=${optionId}`)
  return controlPlane.respondToPermission(tabId, questionId, optionId)
})

/** Encode a project path to match Claude Code CLI's session directory naming.
 *  If the value is already an encoded dir name (starts with '-'), use it as-is. */
function encodeProjectPath(pathOrEncoded: string): string {
  // Already encoded (from LIST_ALL_SESSIONS results)
  if (pathOrEncoded.startsWith('-') && !pathOrEncoded.includes('/')) return pathOrEncoded
  return pathOrEncoded.replace(/[/_]/g, '-')
}

const COMPACTION_PREFIX = '__COMPACTION_DATA__'
const LOCAL_COMMAND_PREFIX = '__LOCAL_COMMAND_DATA__'

interface LocalCommandHistoryPayload {
  commandName: string
  args?: string
  output?: string
}

type LocalCommandHistoryEntry =
  | { kind: 'caveat' }
  | { kind: 'command'; commandName: string; args?: string }
  | { kind: 'stdout'; output: string }

function extractHistoryTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((block: any) => block?.type === 'text' && block.text)
      .map((block: any) => block.text)
      .join('\n')
  }
  return ''
}

function parseHistoryTimestamp(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return Date.now()
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

function extractTaggedHistoryValue(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!match) return null
  return match[1].replace(/\r\n?/g, '\n').trim()
}

function normalizeLocalCommandName(commandName: string): string {
  const trimmed = commandName.trim()
  if (!trimmed) return 'command'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function parseLocalCommandHistoryEntry(text: string): LocalCommandHistoryEntry | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (extractTaggedHistoryValue(trimmed, 'local-command-caveat') !== null) {
    return { kind: 'caveat' }
  }

  const commandName = extractTaggedHistoryValue(trimmed, 'command-name')
  if (commandName !== null) {
    const args = extractTaggedHistoryValue(trimmed, 'command-args')
    return {
      kind: 'command',
      commandName: normalizeLocalCommandName(commandName),
      args: args ? args : undefined,
    }
  }

  const output = extractTaggedHistoryValue(trimmed, 'local-command-stdout')
  if (output !== null) {
    return { kind: 'stdout', output }
  }

  return null
}

function isCompactLocalCommand(commandName: string): boolean {
  return commandName.trim().replace(/^\//, '').toLowerCase() === 'compact'
}

function isCompactLocalCommandOutput(output: string): boolean {
  return /^compacted\b/i.test(output.trim())
}

function isSyntheticCompactionHistoryEntry(obj: any, text: string): boolean {
  if (!text) return false

  if (obj?.isSynthetic === true && text.startsWith('This session is being continued from a previous conversation that ran out of context.')) {
    return true
  }

  return false
}

function buildCompactionHistoryContent(obj: any): string {
  const compactMetadata = obj?.compact_metadata && typeof obj.compact_metadata === 'object'
    ? obj.compact_metadata
    : obj?.data?.compact_metadata && typeof obj.data.compact_metadata === 'object'
      ? obj.data.compact_metadata
      : undefined

  const payload = {
    state: 'completed',
    message: 'Conversation compacted.',
    summary: typeof obj?.summary === 'string'
      ? obj.summary
      : typeof obj?.data?.summary === 'string'
        ? obj.data.summary
        : undefined,
    trigger: typeof obj?.trigger === 'string'
      ? obj.trigger
      : typeof obj?.data?.trigger === 'string'
        ? obj.data.trigger
        : typeof compactMetadata?.trigger === 'string'
          ? compactMetadata.trigger
          : undefined,
  }

  return COMPACTION_PREFIX + JSON.stringify(payload)
}

function buildLocalCommandHistoryContent(payload: LocalCommandHistoryPayload): string {
  return LOCAL_COMMAND_PREFIX + JSON.stringify(payload)
}

function extractSessionFirstMessage(obj: any): string | null {
  const text = extractHistoryTextContent(obj?.message?.content).trim()
  if (!text) return null
  if (isSyntheticCompactionHistoryEntry(obj, text)) return null
  if (parseLocalCommandHistoryEntry(text)) return null
  return text.substring(0, 100)
}

ipcMain.handle(IPC.LIST_SESSIONS, async (_e, projectPath?: string) => {
  log(`IPC LIST_SESSIONS ${projectPath ? `(path=${projectPath})` : ''}`)
  try {
    const cwd = projectPath || process.cwd()
    // Claude stores project sessions at ~/.claude/projects/<encoded-path>/
    // Path encoding: replace '/' and '_' with '-' (matching Claude Code CLI behavior)
    const encodedPath = encodeProjectPath(cwd)
    const sessionsDir = join(homedir(), '.claude', 'projects', encodedPath)
    if (!existsSync(sessionsDir)) {
      log(`LIST_SESSIONS: directory not found: ${sessionsDir}`)
      return []
    }
    const files = readdirSync(sessionsDir).filter((f: string) => f.endsWith('.jsonl'))

    const sessions: Array<{ sessionId: string; slug: string | null; firstMessage: string | null; lastTimestamp: string; size: number; projectPath: string }> = []

    // UUID v4 regex — only consider files named as valid UUIDs
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    for (const file of files) {
      // The filename (without .jsonl) IS the canonical resume ID for `claude --resume`
      const fileSessionId = file.replace(/\.jsonl$/, '')
      if (!UUID_RE.test(fileSessionId)) continue // skip non-UUID files

      const filePath = join(sessionsDir, file)
      const stat = statSync(filePath)
      if (stat.size < 100) continue // skip trivially small files

      // Read lines to extract metadata and validate transcript schema
      const meta: { validated: boolean; slug: string | null; firstMessage: string | null; lastTimestamp: string | null } = {
        validated: false, slug: null, firstMessage: null, lastTimestamp: null,
      }

      await new Promise<void>((resolve) => {
        const rl = createInterface({ input: createReadStream(filePath) })
        rl.on('line', (line: string) => {
          try {
            const obj = JSON.parse(line)
            // Validate: must have expected Claude transcript fields
            if (!meta.validated && obj.type && obj.uuid && obj.timestamp) {
              meta.validated = true
            }
            if (obj.slug && !meta.slug) meta.slug = obj.slug
            if (obj.timestamp) meta.lastTimestamp = obj.timestamp
            if (obj.type === 'user' && !meta.firstMessage) {
              meta.firstMessage = extractSessionFirstMessage(obj)
            }
          } catch {}
          // Read all lines to get the last timestamp
        })
        rl.on('close', () => resolve())
      })

      if (meta.validated) {
        sessions.push({
          sessionId: fileSessionId,
          slug: meta.slug,
          firstMessage: meta.firstMessage,
          lastTimestamp: meta.lastTimestamp || stat.mtime.toISOString(),
          size: stat.size,
          projectPath: cwd,
        })
      }
    }

    // Sort by last timestamp, most recent first
    sessions.sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime())
    return sessions.slice(0, 20) // Return top 20
  } catch (err) {
    log(`LIST_SESSIONS error: ${err}`)
    return []
  }
})

// List sessions across ALL project directories
ipcMain.handle(IPC.LIST_ALL_SESSIONS, async () => {
  log('IPC LIST_ALL_SESSIONS')
  try {
    const projectsRoot = join(homedir(), '.claude', 'projects')
    if (!existsSync(projectsRoot)) return []

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const allSessions: Array<{ sessionId: string; slug: string | null; firstMessage: string | null; lastTimestamp: string; size: number; projectPath: string }> = []

    const projectDirs = readdirSync(projectsRoot).filter((d: string) => {
      try {
        if (d.includes('clui-btw-')) return false // skip btw ephemeral sessions
        return statSync(join(projectsRoot, d)).isDirectory()
      } catch { return false }
    })

    for (const dir of projectDirs) {
      const sessionsDir = join(projectsRoot, dir)
      // The encoded dir name is the canonical project identifier.
      // We store it as-is since decoding is lossy ('/' and '_' both encode to '-').
      const encodedDir = dir

      let files: string[]
      try { files = readdirSync(sessionsDir).filter((f: string) => f.endsWith('.jsonl')) } catch { continue }

      for (const file of files) {
        const fileSessionId = file.replace(/\.jsonl$/, '')
        if (!UUID_RE.test(fileSessionId)) continue

        const filePath = join(sessionsDir, file)
        let stat: ReturnType<typeof statSync>
        try { stat = statSync(filePath) } catch { continue }
        if (stat.size < 100) continue

        const meta: { validated: boolean; slug: string | null; firstMessage: string | null; lastTimestamp: string | null; cwd: string | null } = {
          validated: false, slug: null, firstMessage: null, lastTimestamp: null, cwd: null,
        }

        await new Promise<void>((resolve) => {
          const rl = createInterface({ input: createReadStream(filePath) })
          rl.on('line', (line: string) => {
            try {
              const obj = JSON.parse(line)
              if (!meta.validated && obj.type && obj.uuid && obj.timestamp) {
                meta.validated = true
              }
              if (obj.slug && !meta.slug) meta.slug = obj.slug
              if (obj.timestamp) meta.lastTimestamp = obj.timestamp
              // Extract the real working directory — present in every JSONL entry
              if (obj.cwd && !meta.cwd) meta.cwd = obj.cwd
              if (obj.type === 'user' && !meta.firstMessage) {
                meta.firstMessage = extractSessionFirstMessage(obj)
              }
            } catch {}
          })
          rl.on('close', () => resolve())
        })

        if (meta.validated) {
          allSessions.push({
            sessionId: fileSessionId,
            slug: meta.slug,
            firstMessage: meta.firstMessage,
            lastTimestamp: meta.lastTimestamp || stat.mtime.toISOString(),
            size: stat.size,
            // Prefer the real cwd from the JSONL; fall back to encoded dir for very old sessions
            projectPath: meta.cwd || encodedDir,
          })
        }
      }
    }

    allSessions.sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime())
    return allSessions.slice(0, 30)
  } catch (err) {
    log(`LIST_ALL_SESSIONS error: ${err}`)
    return []
  }
})

// Load conversation history from a session's JSONL file
ipcMain.handle(IPC.LOAD_SESSION, async (_e, arg: { sessionId: string; projectPath?: string } | string) => {
  const sessionId = typeof arg === 'string' ? arg : arg.sessionId
  const projectPath = typeof arg === 'string' ? undefined : arg.projectPath
  log(`IPC LOAD_SESSION ${sessionId}${projectPath ? ` (path=${projectPath})` : ''}`)
  try {
    const cwd = projectPath || process.cwd()
    const encodedPath = encodeProjectPath(cwd)
    const filePath = join(homedir(), '.claude', 'projects', encodedPath, `${sessionId}.jsonl`)
    if (!existsSync(filePath)) return []

    const messages: Array<{ role: string; content: string; toolName?: string; toolId?: string; timestamp: number }> = []
    let pendingLocalCommand: (LocalCommandHistoryPayload & { timestamp: number }) | null = null
    let suppressNextCompactStdout = false

    const flushPendingLocalCommand = (timestamp?: number) => {
      if (!pendingLocalCommand) return

      const { timestamp: pendingTimestamp, ...payload } = pendingLocalCommand
      pendingLocalCommand = null
      if (isCompactLocalCommand(payload.commandName)) {
        suppressNextCompactStdout = true
        return
      }

      messages.push({
        role: 'system',
        content: buildLocalCommandHistoryContent(payload),
        timestamp: timestamp ?? pendingTimestamp,
      })
    }

    await new Promise<void>((resolve) => {
      const rl = createInterface({ input: createReadStream(filePath) })
      rl.on('line', (line: string) => {
        try {
          const obj = JSON.parse(line)
          if (obj.type === 'system' && obj.subtype === 'compact_boundary') {
            flushPendingLocalCommand()
            messages.push({
              role: 'system',
              content: buildCompactionHistoryContent(obj),
              timestamp: parseHistoryTimestamp(obj.timestamp),
            })
            return
          }

          if (obj.type === 'user') {
            const text = extractHistoryTextContent(obj.message?.content)
            const timestamp = parseHistoryTimestamp(obj.timestamp)
            const localCommand = parseLocalCommandHistoryEntry(text)

            if (localCommand) {
              if (localCommand.kind === 'caveat') return

              if (localCommand.kind === 'command') {
                flushPendingLocalCommand()
                suppressNextCompactStdout = false
                pendingLocalCommand = {
                  commandName: localCommand.commandName,
                  args: localCommand.args,
                  timestamp,
                }
                return
              }

              if (pendingLocalCommand) {
                pendingLocalCommand = {
                  ...pendingLocalCommand,
                  output: localCommand.output,
                }
                flushPendingLocalCommand(timestamp)
              } else if (suppressNextCompactStdout && isCompactLocalCommandOutput(localCommand.output)) {
                suppressNextCompactStdout = false
              } else if (localCommand.output) {
                messages.push({ role: 'system', content: localCommand.output, timestamp })
              }
              return
            }

            flushPendingLocalCommand()
            if (isSyntheticCompactionHistoryEntry(obj, text)) return
            if (text) {
              messages.push({ role: 'user', content: text, timestamp })
            }
          } else if (obj.type === 'assistant') {
            flushPendingLocalCommand()
            const content = obj.message?.content
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  messages.push({ role: 'assistant', content: block.text, timestamp: parseHistoryTimestamp(obj.timestamp) })
                } else if (block.type === 'tool_use' && block.name) {
                  messages.push({
                    role: 'tool',
                    content: '',
                    toolName: block.name,
                    toolId: block.id || undefined,
                    timestamp: parseHistoryTimestamp(obj.timestamp),
                  })
                }
              }
            }
          }
        } catch {}
      })
      rl.on('close', () => {
        flushPendingLocalCommand()
        resolve()
      })
    })
    return messages
  } catch (err) {
    log(`LOAD_SESSION error: ${err}`)
    return []
  }
})

// Extract tool results from a session JSONL file
// Returns a map of toolUseId → result text
// Sources: tool_result blocks in user messages + progress events for subagent activity
ipcMain.handle(IPC.GET_TOOL_RESULTS, async (_e, arg: { sessionId: string; projectPath: string }) => {
  const { sessionId, projectPath } = arg
  log(`IPC GET_TOOL_RESULTS ${sessionId}`)
  try {
    const encodedPath = encodeProjectPath(projectPath)
    const filePath = join(homedir(), '.claude', 'projects', encodedPath, `${sessionId}.jsonl`)
    if (!existsSync(filePath)) return {}

    const results: Record<string, string> = {}
    // Track progress events per parentToolUseID (subagent activity)
    const progressByTool: Record<string, string[]> = {}

    await new Promise<void>((resolve) => {
      const rl = createInterface({ input: createReadStream(filePath) })
      rl.on('line', (line: string) => {
        try {
          const obj = JSON.parse(line)

          // Extract tool_result from user messages
          if (obj.type === 'user') {
            const content = obj.message?.content
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'tool_result' && block.tool_use_id) {
                  const c = block.content
                  if (typeof c === 'string') {
                    results[block.tool_use_id] = c
                  } else if (Array.isArray(c)) {
                    const text = c
                      .filter((b: any) => b.type === 'text')
                      .map((b: any) => b.text)
                      .join('\n')
                    if (text) results[block.tool_use_id] = text
                  }
                }
              }
            }
          }

          // Extract progress events (subagent activity)
          if (obj.type === 'progress' && obj.parentToolUseID) {
            const ptid = obj.parentToolUseID
            const msg = obj.data?.message
            const content = msg?.message?.content
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  if (!progressByTool[ptid]) progressByTool[ptid] = []
                  progressByTool[ptid].push(block.text)
                } else if (block.type === 'tool_use' && block.name) {
                  if (!progressByTool[ptid]) progressByTool[ptid] = []
                  const input = block.input || {}
                  let detail = ''
                  if (['Read', 'Edit', 'Write'].includes(block.name)) {
                    detail = `: ${input.file_path || input.path || ''}`
                  } else if (block.name === 'Bash') {
                    detail = `: ${(input.command || '').toString().substring(0, 60)}`
                  } else if (['Grep', 'Glob'].includes(block.name)) {
                    detail = `: ${input.pattern || ''}`
                  }
                  progressByTool[ptid].push(`[${block.name}${detail}]`)
                }
              }
            }
          }
        } catch {}
      })
      rl.on('close', () => resolve())
    })

    // For tool IDs without a tool_result but with progress data, use progress as fallback
    for (const [toolId, parts] of Object.entries(progressByTool)) {
      if (!results[toolId]) {
        results[toolId] = parts.join('\n')
      }
    }

    return results
  } catch (err) {
    log(`GET_TOOL_RESULTS error: ${err}`)
    return {}
  }
})

// ─── Get context window usage by reading real session data from disk ───
// Replicates the CLI's E01() calculator: reads the session JSONL for init/result
// events, reads memory/CLAUDE.md files from disk, estimates tokens via charLength/4
// (same fallback the CLI uses when the countTokens API is unavailable).

ipcMain.handle(IPC.GET_CONTEXT, async (_e, arg: { sessionId: string; projectPath: string; sessionData?: any }) => {
  const { sessionId, projectPath, sessionData } = arg
  log(`IPC GET_CONTEXT session=${sessionId} path=${projectPath}`)

  // Fix #1: Validate sessionId is a UUID to prevent path traversal
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(sessionId)) {
    log(`GET_CONTEXT: invalid sessionId rejected: ${sessionId}`)
    return null
  }

  try {
    const { readFileSync } = require('fs')
    const cwd = projectPath === '~' ? homedir() : projectPath
    const encodedPath = encodeProjectPath(cwd)
    const projectDir = join(homedir(), '.claude', 'projects', encodedPath)

    // ── 1. Session metadata: prefer in-memory data, fall back to JSONL ──
    let model: string | null = sessionData?.model || null
    let tools: string[] = sessionData?.tools || []
    let skills: string[] = sessionData?.skills || []
    let mcpServers: Array<{ name: string; status: string }> = sessionData?.mcpServers || []
    const version: string | null = sessionData?.version || null
    const usage = sessionData?.usage || {}

    let lastInputTokens = usage.input_tokens || 0
    let lastOutputTokens = usage.output_tokens || 0
    let cacheRead = usage.cache_read_input_tokens || 0
    let cacheCreate = usage.cache_creation_input_tokens || 0

    let messageChars = sessionData?.messageChars || 0

    // If we don't have API usage data (e.g. resumed CLI session without a new message),
    // read the session JSONL to estimate message sizes from actual content
    const hasApiUsage = cacheCreate > 0 || cacheRead > 0 || lastInputTokens > 0
    if (!hasApiUsage) {
      const jsonlPath = join(projectDir, `${sessionId}.jsonl`)
      if (existsSync(jsonlPath)) {
        log('GET_CONTEXT: no API usage, falling back to JSONL message content')
        await new Promise<void>((resolve) => {
          const rl = createInterface({ input: createReadStream(jsonlPath) })
          rl.on('line', (line: string) => {
            try {
              const obj = JSON.parse(line)
              // Count message content chars
              if (obj.type === 'user' || obj.type === 'assistant') {
                const content = obj.message?.content
                if (typeof content === 'string') {
                  messageChars += content.length
                } else if (Array.isArray(content)) {
                  for (const block of content) {
                    if (block.type === 'text' && block.text) messageChars += block.text.length
                    if (block.type === 'tool_use' && block.input) messageChars += JSON.stringify(block.input).length
                    if (block.type === 'tool_result') {
                      const c = block.content
                      if (typeof c === 'string') messageChars += c.length
                      else if (Array.isArray(c)) {
                        for (const b of c) { if (b.type === 'text' && b.text) messageChars += b.text.length }
                      }
                    }
                  }
                }
              }
            } catch {}
          })
          rl.on('close', () => resolve())
        })
      }
    }

    // Separate MCP tools from built-in tools
    const mcpServerCount = mcpServers.filter((s: any) => s.status === 'connected').length
    const totalToolCount = tools.length
    const mcpToolCount = mcpServerCount > 0 ? Math.max(0, totalToolCount - 25) : 0
    const toolCount = totalToolCount - mcpToolCount

    // ── 2. Read CLAUDE.md / memory files from disk (real content sizes) ──
    const memoryFiles: Array<{ path: string; tokens: number }> = []
    let totalMemoryChars = 0

    // Project-level CLAUDE.md
    const claudeMdPaths = [
      join(cwd, 'CLAUDE.md'),
      join(cwd, '.claude', 'CLAUDE.md'),
    ]
    for (const p of claudeMdPaths) {
      if (existsSync(p)) {
        try {
          const content = readFileSync(p, 'utf-8')
          const tokens = Math.ceil(content.length / 4)
          totalMemoryChars += content.length
          memoryFiles.push({ path: p.replace(homedir(), '~'), tokens })
        } catch {}
      }
    }

    // User-level CLAUDE.md
    const userClaudeMd = join(homedir(), '.claude', 'CLAUDE.md')
    if (existsSync(userClaudeMd)) {
      try {
        const content = readFileSync(userClaudeMd, 'utf-8')
        const tokens = Math.ceil(content.length / 4)
        totalMemoryChars += content.length
        memoryFiles.push({ path: '~/.claude/CLAUDE.md', tokens })
      } catch {}
    }

    // Project memory directory (auto-memory files)
    const memoryDir = join(projectDir, 'memory')
    if (existsSync(memoryDir)) {
      try {
        const files = readdirSync(memoryDir).filter((f: string) => f.endsWith('.md'))
        for (const file of files) {
          const filePath = join(memoryDir, file)
          try {
            const content = readFileSync(filePath, 'utf-8')
            const tokens = Math.ceil(content.length / 4)
            totalMemoryChars += content.length
            memoryFiles.push({ path: join('memory', file), tokens })
          } catch {}
        }
      } catch {}
    }

    // ── 3. Read skill content from disk for real token counts ──
    const skillDetails: Array<{ name: string; tokens: number }> = []
    let totalSkillChars = 0

    // Skills live in ~/.claude/skills/<name>/SKILL.md or similar
    const skillsDir = join(homedir(), '.claude', 'skills')
    if (existsSync(skillsDir) && skills.length > 0) {
      // Fix #4: Only scan skills that are active in the current session
      const activeSkillSet = new Set(skills.map((s) => s.toLowerCase()))
      try {
        const skillDirs = readdirSync(skillsDir)
        for (const skillDir of skillDirs) {
          if (!activeSkillSet.has(skillDir.toLowerCase())) continue
          const skillMd = join(skillsDir, skillDir, 'SKILL.md')
          if (existsSync(skillMd)) {
            try {
              const content = readFileSync(skillMd, 'utf-8')
              const tokens = Math.ceil(content.length / 4)
              totalSkillChars += content.length
              skillDetails.push({ name: skillDir, tokens })
            } catch {}
          }
        }
      } catch {}
    }
    // If we found skills from the init event but couldn't read them from disk,
    // estimate using the CLI's gP6() approach: charLen/4 on the name
    for (const s of skills) {
      if (!skillDetails.some((sd) => sd.name === s)) {
        const estimated = Math.max(40, Math.ceil(s.length * 20 / 4)) // name + desc rough estimate
        totalSkillChars += estimated * 4
        skillDetails.push({ name: s, tokens: estimated })
      }
    }

    // ── 4. Use REAL API token counts from the result event ──
    //
    // From the API result event we get:
    //   cache_creation_input_tokens = system context (prompt + tools + memory + skills)
    //                                 cached on first request
    //   cache_read_input_tokens     = same system context, read from cache on subsequent requests
    //   input_tokens                = per-request tokens (messages + new content)
    //
    // The real infrastructure token count = cache_creation OR cache_read (whichever is nonzero)
    // The real message token count = input_tokens
    // Total context = all three combined

    // Context window size — infer from model name (CLI: aX())
    const isExtended = model?.includes('[1m]') || model?.includes('opus-4') || model?.includes('sonnet-4')
    const maxTokens = isExtended ? 1000000 : 200000

    // Memory file tokens (from actual file content, char/4)
    const memoryTokens = Math.ceil(totalMemoryChars / 4)

    // Skill tokens (from actual file content, char/4)
    const skillTokens = Math.ceil(totalSkillChars / 4)

    // Autocompact buffer: CLI uses min(maxOutput, 20000) + 13000 = 33000
    const autocompactBuffer = 33000

    let systemPromptTokens: number
    let builtInToolTokens: number
    let mcpToolTokens: number
    let msgTokens: number
    let totalUsed: number

    if (hasApiUsage) {
      // ── Path A: Real API token counts available ──
      const infraTokens = Math.max(cacheCreate, cacheRead)
      msgTokens = lastInputTokens
      totalUsed = infraTokens + msgTokens

      // Derive system prompt + tools from infrastructure minus known categories
      const systemAndToolTokens = Math.max(0, infraTokens - memoryTokens - skillTokens)

      // Split system prompt vs tools proportionally
      const estSys = 5500
      const estTools = toolCount * 250 + mcpToolCount * 200
      const total = estSys + estTools || 1
      systemPromptTokens = Math.round(systemAndToolTokens * (estSys / total))
      builtInToolTokens = Math.round(systemAndToolTokens * (Math.max(0, estTools - mcpToolCount * 200) / total))
      mcpToolTokens = mcpToolCount > 0 ? Math.round(systemAndToolTokens * (mcpToolCount * 200 / total)) : 0

      log(`GET_CONTEXT: [API] infra=${infraTokens} (cache_create=${cacheCreate}, cache_read=${cacheRead}), msgs=${msgTokens}`)
    } else {
      // ── Path B: No API data — estimate from content sizes (CLI's char/4 fallback) ──
      systemPromptTokens = 5500
      builtInToolTokens = toolCount * 250
      mcpToolTokens = mcpToolCount * 200
      msgTokens = Math.ceil(messageChars / 4)
      totalUsed = systemPromptTokens + builtInToolTokens + mcpToolTokens + memoryTokens + skillTokens + msgTokens

      log(`GET_CONTEXT: [estimated] sysProm=${systemPromptTokens}, tools=${builtInToolTokens}, msgs=${msgTokens} (${messageChars} chars)`)
    }

    // Free space
    const freeTokens = Math.max(0, maxTokens - totalUsed - autocompactBuffer)
    const usagePercent = maxTokens > 0 ? Math.round((totalUsed / maxTokens) * 100) : 0

    // ── 5. Build category array ──
    const pct = (t: number) => maxTokens > 0 ? (t / maxTokens) * 100 : 0

    const categories = [
      { label: 'System prompt', tokens: systemPromptTokens, percent: pct(systemPromptTokens) },
      { label: 'System tools', tokens: builtInToolTokens, percent: pct(builtInToolTokens) },
    ]
    if (mcpToolTokens > 0) {
      categories.push({ label: 'MCP tools', tokens: mcpToolTokens, percent: pct(mcpToolTokens) })
    }
    categories.push(
      { label: 'Memory files', tokens: memoryTokens, percent: pct(memoryTokens) },
      { label: 'Skills', tokens: skillTokens, percent: pct(skillTokens) },
      { label: 'Messages', tokens: msgTokens, percent: pct(msgTokens) },
      { label: 'Free space', tokens: freeTokens, percent: pct(freeTokens) },
      { label: 'Autocompact buffer', tokens: autocompactBuffer, percent: pct(autocompactBuffer) },
    )

    log(`GET_CONTEXT: model=${model}, total=${totalUsed}/${maxTokens} (${usagePercent}%), source=${hasApiUsage ? 'API' : 'estimated'}`)

    return {
      model,
      maxTokens,
      usagePercent,
      totalUsed,
      categories,
      memoryFiles,
      skills: skillDetails,
      inputTokens: lastInputTokens,
      outputTokens: lastOutputTokens,
      cacheRead,
      cacheCreate,
      version,
      isEstimated: !hasApiUsage,
    }
  } catch (err) {
    log(`GET_CONTEXT error: ${err}`)
    return null
  }
})

ipcMain.handle(IPC.LIST_DIR, async (_e, dirPath: string) => {
  try {
    // Normalize and resolve the path to prevent traversal attacks
    const resolved = resolve(normalize(dirPath))
    // Constrain to user's home directory
    const home = homedir()
    if (!resolved.startsWith(home)) return []
    if (!existsSync(resolved)) return []

    const entries = await readdir(resolved, { withFileTypes: true })
    const results: Array<{ name: string; isDirectory: boolean }> = []
    for (const entry of entries) {
      // Skip hidden files/folders
      if (entry.name.startsWith('.')) continue
      results.push({ name: entry.name, isDirectory: entry.isDirectory() })
    }
    // Sort: directories first, then alphabetical
    results.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return results
  } catch {
    return []
  }
})

ipcMain.handle(IPC.SELECT_DIRECTORY, async () => {
  if (!mainWindow) return null
  // macOS: activate app so unparented dialog appears on top (not behind other apps).
  // Unparented avoids modal dimming on the transparent overlay.
  // Activation is fine here — user is actively interacting with Clui.
  if (process.platform === 'darwin') app.focus()
  // Electron 42 tightened OpenDialogOptions.properties to a literal-union
  // mutable array. `as const` makes it readonly which the tight type rejects.
  const options: Electron.OpenDialogOptions = { properties: ['openDirectory'] }
  const result = process.platform === 'darwin'
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(mainWindow, options)
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(IPC.OPEN_EXTERNAL, async (_event, url: string) => {
  try {
    // Only allow http(s) links from markdown content.
    if (!/^https?:\/\//i.test(url)) return false
    await shell.openExternal(url)
    return true
  } catch {
    return false
  }
})

ipcMain.handle(IPC.ATTACH_FILES, async () => {
  if (!mainWindow) return null
  // macOS: activate app so unparented dialog appears on top
  if (process.platform === 'darwin') app.focus()
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
      { name: 'Code', extensions: ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'md', 'json', 'yaml', 'toml'] },
    ],
  }
  const result = process.platform === 'darwin'
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(mainWindow, options)
  if (result.canceled || result.filePaths.length === 0) return null

  const { basename, extname } = require('path')
  const { readFileSync, statSync } = require('fs')

  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
  const mimeMap: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
    '.json': 'application/json', '.yaml': 'text/yaml', '.toml': 'text/toml',
  }

  return result.filePaths.map((fp: string) => {
    const ext = extname(fp).toLowerCase()
    const mime = mimeMap[ext] || 'application/octet-stream'
    const stat = statSync(fp)
    let dataUrl: string | undefined

    // Generate preview data URL for images (max 2MB to keep IPC fast)
    if (IMAGE_EXTS.has(ext) && stat.size < 2 * 1024 * 1024) {
      try {
        const buf = readFileSync(fp)
        dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      } catch {}
    }

    return {
      id: crypto.randomUUID(),
      type: IMAGE_EXTS.has(ext) ? 'image' : 'file',
      name: basename(fp),
      path: fp,
      mimeType: mime,
      dataUrl,
      size: stat.size,
    }
  })
})

/**
 * Windows region screenshot: invoke the OS Snipping Tool via the `ms-screenclip:`
 * URI, then poll the clipboard for the resulting PNG. Returns null on cancel/timeout.
 *
 * Why this approach: Windows has no CLI equivalent of macOS's `screencapture -i`.
 * Building a custom selection overlay is ~150 lines of UI code; ms-screenclip
 * gives us the OS-native experience for free, including multi-monitor handling
 * and the freeform/window/fullscreen mode toggles in the Snipping Tool toolbar.
 */
async function takeWindowsRegionScreenshot(): Promise<any> {
  // Snapshot existing clipboard image so we can detect a NEW snip vs. pre-existing image.
  const previousImage = clipboard.readImage()
  const previousHash = previousImage.isEmpty() ? '' : previousImage.toPNG().toString('base64').slice(0, 64)

  // Hide the pill so it's not in the snipping target.
  if (mainWindow) {
    mainWindow.hide()
    await new Promise((r) => setTimeout(r, 150))
  }

  // Trigger the Windows Snipping Tool. shell.openExternal dispatches the URI to
  // the OS handler (ms-screenclip → SnippingTool.exe on Win10 1809+ / Win11).
  try {
    await shell.openExternal('ms-screenclip:')
  } catch (err) {
    log(`[screenshot] failed to open ms-screenclip: ${(err as Error).message}`)
    if (mainWindow) mainWindow.show()
    broadcast(IPC.WINDOW_SHOWN)
    return null
  }

  // Poll the clipboard for up to 60 seconds. The user may take a while to drag-select.
  const deadline = Date.now() + 60_000
  const POLL_MS = 200
  let snippedImage: Electron.NativeImage | null = null

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    const cur = clipboard.readImage()
    if (cur.isEmpty()) continue
    const curHash = cur.toPNG().toString('base64').slice(0, 64)
    if (curHash === previousHash) continue
    snippedImage = cur
    break
  }

  // Restore pill regardless of outcome.
  if (mainWindow) mainWindow.show()
  broadcast(IPC.WINDOW_SHOWN)

  if (!snippedImage) {
    log('[screenshot] region capture cancelled or timed out')
    return null
  }

  const { join } = require('path')
  const { tmpdir } = require('os')
  const { writeFileSync } = require('fs')
  const png = snippedImage.toPNG()
  const screenshotPath = join(tmpdir(), `clui-screenshot-${Date.now()}.png`)
  writeFileSync(screenshotPath, png)

  return {
    id: crypto.randomUUID(),
    type: 'image',
    name: `screenshot ${++screenshotCounter}.png`,
    path: screenshotPath,
    mimeType: 'image/png',
    dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    size: png.length,
  }
}

ipcMain.handle(IPC.TAKE_SCREENSHOT, async (_event, mode?: 'region' | 'fullscreen') => {
  if (!mainWindow) return null

  // Default mode: region on Windows (Snipping Tool), fullscreen elsewhere.
  const resolvedMode: 'region' | 'fullscreen' =
    mode ?? (process.platform === 'win32' ? 'region' : 'fullscreen')

  if (resolvedMode === 'region' && process.platform === 'win32') {
    return takeWindowsRegionScreenshot()
  }

  if (SPACES_DEBUG) snapshotWindowState('screenshot pre-hide')
  mainWindow.hide()
  await new Promise((r) => setTimeout(r, 300))

  try {
    const { execSync } = require('child_process')
    const { join } = require('path')
    const { tmpdir } = require('os')
    const { readFileSync, writeFileSync, existsSync } = require('fs')

    const timestamp = Date.now()
    const screenshotPath = join(tmpdir(), `clui-screenshot-${timestamp}.png`)

    if (process.platform === 'win32') {
      // Windows: capture the full screen via Electron's desktopCapturer.
      // Picks the display under the cursor (or the primary if none).
      const cursor = screen.getCursorScreenPoint()
      const display = screen.getDisplayNearestPoint(cursor) || screen.getPrimaryDisplay()
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(display.size.width * display.scaleFactor),
          height: Math.round(display.size.height * display.scaleFactor),
        },
      })
      // Match by display id when available; fall back to first source.
      const target =
        sources.find((s) => String((s as any).display_id) === String(display.id)) || sources[0]
      if (!target) return null
      const png = target.thumbnail.toPNG()
      writeFileSync(screenshotPath, png)
      return {
        id: crypto.randomUUID(),
        type: 'image',
        name: `screenshot ${++screenshotCounter}.png`,
        path: screenshotPath,
        mimeType: 'image/png',
        dataUrl: `data:image/png;base64,${png.toString('base64')}`,
        size: png.length,
      }
    }

    execSync(`/usr/sbin/screencapture -i "${screenshotPath}"`, {
      timeout: 30000,
      stdio: 'ignore',
    })

    if (!existsSync(screenshotPath)) {
      return null
    }

    // Return structured attachment with data URL preview
    const buf = readFileSync(screenshotPath)
    return {
      id: crypto.randomUUID(),
      type: 'image',
      name: `screenshot ${++screenshotCounter}.png`,
      path: screenshotPath,
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
      size: buf.length,
    }
  } catch {
    return null
  } finally {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.webContents.focus()
    }
    broadcast(IPC.WINDOW_SHOWN)
    if (SPACES_DEBUG) {
      log('[spaces] screenshot restore show+focus')
      snapshotWindowState('screenshot restore immediate')
      setTimeout(() => snapshotWindowState('screenshot restore +200ms'), 200)
    }
  }
})

let pasteCounter = 0
ipcMain.handle(IPC.PASTE_IMAGE, async (_event, dataUrl: string) => {
  try {
    const { writeFileSync } = require('fs')
    const { join } = require('path')
    const { tmpdir } = require('os')

    // Parse data URL: "data:image/png;base64,..."
    const match = dataUrl.match(/^data:(image\/(\w+));base64,(.+)$/)
    if (!match) return null

    const [, mimeType, ext, base64Data] = match
    const buf = Buffer.from(base64Data, 'base64')
    const timestamp = Date.now()
    const filePath = join(tmpdir(), `clui-paste-${timestamp}.${ext}`)
    writeFileSync(filePath, buf)

    return {
      id: crypto.randomUUID(),
      type: 'image',
      name: `pasted image ${++pasteCounter}.${ext}`,
      path: filePath,
      mimeType,
      dataUrl,
      size: buf.length,
    }
  } catch {
    return null
  }
})

ipcMain.handle(IPC.TRANSCRIBE_AUDIO, async (_event, audioBase64: string) => {
  const { writeFileSync, existsSync, unlinkSync, readFileSync } = require('fs')
  const { execSync } = require('child_process')
  const { join } = require('path')
  const { tmpdir } = require('os')

  const tmpWav = join(tmpdir(), `clui-voice-${Date.now()}.wav`)
  try {
    const buf = Buffer.from(audioBase64, 'base64')
    writeFileSync(tmpWav, buf)

    // Find whisper-cli (whisper-cpp homebrew) or whisper (python)
    const candidates = [
      '/opt/homebrew/bin/whisper-cli',
      '/usr/local/bin/whisper-cli',
      '/opt/homebrew/bin/whisper',
      '/usr/local/bin/whisper',
      join(homedir(), '.local/bin/whisper'),
    ]

    let whisperBin = ''
    for (const c of candidates) {
      if (existsSync(c)) { whisperBin = c; break }
    }

    if (!whisperBin) {
      try {
        whisperBin = execSync('/bin/zsh -lc "whence -p whisper-cli"', { encoding: 'utf-8' }).trim()
      } catch {}
    }
    if (!whisperBin) {
      try {
        whisperBin = execSync('/bin/zsh -lc "whence -p whisper"', { encoding: 'utf-8' }).trim()
      } catch {}
    }

    if (!whisperBin) {
      return {
        error: 'Whisper not found',
        errorType: 'whisper_not_found',
        transcript: null,
      }
    }

    const isWhisperCpp = whisperBin.includes('whisper-cli')

    // Find model file — prefer multilingual (auto-detect language) over .en (English-only)
    const modelCandidates = [
      join(homedir(), '.local/share/whisper/ggml-base.bin'),
      join(homedir(), '.local/share/whisper/ggml-tiny.bin'),
      '/opt/homebrew/share/whisper-cpp/models/ggml-base.bin',
      '/opt/homebrew/share/whisper-cpp/models/ggml-tiny.bin',
      // Fall back to English-only models if multilingual not available
      join(homedir(), '.local/share/whisper/ggml-base.en.bin'),
      join(homedir(), '.local/share/whisper/ggml-tiny.en.bin'),
      '/opt/homebrew/share/whisper-cpp/models/ggml-base.en.bin',
      '/opt/homebrew/share/whisper-cpp/models/ggml-tiny.en.bin',
    ]

    let modelPath = ''
    for (const m of modelCandidates) {
      if (existsSync(m)) { modelPath = m; break }
    }

    // Detect if using an English-only model (.en suffix) — force English if so
    const isEnglishOnly = modelPath.includes('.en.')
    log(`Transcribing with: ${whisperBin} (model: ${modelPath || 'default'}, lang: ${isEnglishOnly ? 'en' : 'auto'})`)

    let output: string
    if (isWhisperCpp) {
      // whisper-cpp: whisper-cli -m model -f file --no-timestamps
      if (!modelPath) {
        return {
          error: 'Whisper model not found',
          errorType: 'model_not_found',
          transcript: null,
        }
      }
      const langFlag = isEnglishOnly ? '-l en' : '-l auto'
      output = execSync(
        `"${whisperBin}" -m "${modelPath}" -f "${tmpWav}" --no-timestamps ${langFlag}`,
        { encoding: 'utf-8', timeout: 30000 }
      )
    } else {
      // Python whisper: auto-detect language unless English-only model
      const langFlag = isEnglishOnly ? '--language en' : ''
      output = execSync(
        `"${whisperBin}" "${tmpWav}" --model tiny ${langFlag} --output_format txt --output_dir "${tmpdir()}"`,
        { encoding: 'utf-8', timeout: 30000 }
      )
      // Python whisper writes .txt file
      const txtPath = tmpWav.replace('.wav', '.txt')
      if (existsSync(txtPath)) {
        const transcript = readFileSync(txtPath, 'utf-8').trim()
        try { unlinkSync(txtPath) } catch {}
        return { error: null, transcript }
      }
      // File not created — Python whisper failed silently
      return {
        error: `Whisper output file not found at ${txtPath}. Check disk space and permissions.`,
        transcript: null,
      }
    }

    // whisper-cpp prints to stdout directly
    // Strip timestamp patterns and known hallucination outputs
    const HALLUCINATIONS = /^\s*(\[BLANK_AUDIO\]|you\.?|thank you\.?|thanks\.?)\s*$/i
    const transcript = output
      .replace(/\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/g, '')
      .trim()

    if (HALLUCINATIONS.test(transcript)) {
      return { error: null, transcript: '' }
    }

    return { error: null, transcript: transcript || '' }
  } catch (err: any) {
    log(`Transcription error: ${err.message}`)
    return {
      error: `Transcription failed: ${err.message}`,
      transcript: null,
    }
  } finally {
    try { unlinkSync(tmpWav) } catch {}
  }
})

ipcMain.handle(IPC.FIX_WHISPER, async () => {
  const { existsSync, mkdirSync } = require('fs')
  const { execSync } = require('child_process')
  const { join } = require('path')
  const { exec } = require('child_process')

  try {
    // Check if whisper binary exists
    const binCandidates = [
      '/opt/homebrew/bin/whisper-cli',
      '/usr/local/bin/whisper-cli',
      '/opt/homebrew/bin/whisper',
      '/usr/local/bin/whisper',
      join(homedir(), '.local/bin/whisper'),
    ]
    let whisperBin = ''
    for (const c of binCandidates) {
      if (existsSync(c)) { whisperBin = c; break }
    }
    if (!whisperBin) {
      try { whisperBin = execSync('/bin/zsh -lc "whence -p whisper-cli"', { encoding: 'utf-8' }).trim() } catch {}
    }
    if (!whisperBin) {
      try { whisperBin = execSync('/bin/zsh -lc "whence -p whisper"', { encoding: 'utf-8' }).trim() } catch {}
    }

    // Install whisper-cpp via brew if missing
    if (!whisperBin) {
      log('FIX_WHISPER: Installing whisper-cpp via brew...')
      await new Promise<void>((resolve, reject) => {
        exec('/bin/zsh -lc "brew install whisper-cpp"', { timeout: 300000 }, (err: any) => {
          if (err) reject(new Error(`brew install failed: ${err.message}`))
          else resolve()
        })
      })
      log('FIX_WHISPER: whisper-cpp installed')
    }

    // Check if model exists
    const modelCandidates = [
      join(homedir(), '.local/share/whisper/ggml-base.bin'),
      join(homedir(), '.local/share/whisper/ggml-tiny.bin'),
      '/opt/homebrew/share/whisper-cpp/models/ggml-base.bin',
      '/opt/homebrew/share/whisper-cpp/models/ggml-tiny.bin',
      join(homedir(), '.local/share/whisper/ggml-base.en.bin'),
      join(homedir(), '.local/share/whisper/ggml-tiny.en.bin'),
      '/opt/homebrew/share/whisper-cpp/models/ggml-base.en.bin',
      '/opt/homebrew/share/whisper-cpp/models/ggml-tiny.en.bin',
    ]
    let modelFound = false
    for (const m of modelCandidates) {
      if (existsSync(m)) { modelFound = true; break }
    }

    // Download tiny model if missing
    if (!modelFound) {
      const modelDir = join(homedir(), '.local/share/whisper')
      mkdirSync(modelDir, { recursive: true })
      const modelDest = join(modelDir, 'ggml-tiny.bin')
      log('FIX_WHISPER: Downloading ggml-tiny.bin...')
      await new Promise<void>((resolve, reject) => {
        exec(
          `curl -L -o "${modelDest}" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"`,
          { timeout: 300000 },
          (err: any) => {
            if (err) reject(new Error(`Model download failed: ${err.message}`))
            else resolve()
          }
        )
      })
      log('FIX_WHISPER: Model downloaded')
    }

    return { ok: true }
  } catch (err: any) {
    log(`FIX_WHISPER error: ${err.message}`)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle(IPC.GET_DIAGNOSTICS, () => {
  const { readFileSync, existsSync } = require('fs')
  const health = controlPlane.getHealth()

  let recentLogs = ''
  if (existsSync(LOG_FILE)) {
    try {
      const content = readFileSync(LOG_FILE, 'utf-8')
      const lines = content.split('\n')
      recentLogs = lines.slice(-100).join('\n')
    } catch {}
  }

  return {
    health,
    logPath: LOG_FILE,
    recentLogs,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    appVersion: app.getVersion(),
    transport: INTERACTIVE_PTY ? 'pty' : 'stream-json',
  }
})

ipcMain.handle(IPC.LIST_INSTALLED_TERMINALS, async () => {
  return (await getInstalledTerminals()).map(({ id, label }) => ({ id, label }))
})

ipcMain.handle(IPC.OPEN_IN_TERMINAL, async (_event, arg: string | null | { sessionId?: string | null; projectPath?: string; terminalId?: PreferredTerminalId | TerminalId | null }) => {

  // Support both old (string) and new ({ sessionId, projectPath }) calling convention
  let sessionId: string | null = null
  let projectPath: string = homedir()
  let terminalId: PreferredTerminalId | TerminalId | null = null
  if (typeof arg === 'string') {
    sessionId = arg
  } else if (arg && typeof arg === 'object') {
    sessionId = arg.sessionId ?? null
    projectPath = arg.projectPath && arg.projectPath !== '~' ? arg.projectPath : homedir()
    terminalId = arg.terminalId ?? null
  }

  const terminal = await findInstalledTerminal(terminalId)
  const sysDefault = process.platform === 'win32' ? 'Windows Terminal' : 'macOS default'
  const logLabel = terminal ? terminal.label : terminalId && terminalId !== 'auto' ? `${sysDefault} (fallback from ${terminalId})` : sysDefault

  try {
    if (terminal) {
      await launchTerminal(terminal, sessionId, projectPath)
    } else {
      await launchDefaultTerminal(sessionId, projectPath)
    }
    log(`Opened terminal with ${logLabel}: ${buildClaudeShellCommand(projectPath, sessionId)}`)
    return true
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    log(`Failed to open terminal (${logLabel}): ${message}`)
    return false
  }
})

// ─── Marketplace IPC ───

ipcMain.handle(IPC.MARKETPLACE_FETCH, async (_event, { forceRefresh } = {}) => {
  log('IPC MARKETPLACE_FETCH')
  return fetchCatalog(forceRefresh)
})

ipcMain.handle(IPC.MARKETPLACE_INSTALLED, async () => {
  log('IPC MARKETPLACE_INSTALLED')
  return listInstalled()
})

ipcMain.handle(IPC.MARKETPLACE_INSTALL, async (_event, { repo, pluginName, marketplace, sourcePath, isSkillMd }: { repo: string; pluginName: string; marketplace: string; sourcePath?: string; isSkillMd?: boolean }) => {
  log(`IPC MARKETPLACE_INSTALL: ${pluginName} from ${repo} (isSkillMd=${isSkillMd})`)
  return installPlugin(repo, pluginName, marketplace, sourcePath, isSkillMd)
})

ipcMain.handle(IPC.MARKETPLACE_UNINSTALL, async (_event, { pluginName }: { pluginName: string }) => {
  log(`IPC MARKETPLACE_UNINSTALL: ${pluginName}`)
  return uninstallPlugin(pluginName)
})

// ─── Theme Detection ───

ipcMain.handle(IPC.GET_THEME, () => {
  return { isDark: nativeTheme.shouldUseDarkColors }
})

nativeTheme.on('updated', () => {
  broadcast(IPC.THEME_CHANGED, nativeTheme.shouldUseDarkColors)
})

// ─── Permission Preflight ───
// Request all required macOS permissions upfront on first launch so the user
// is never interrupted mid-session by a permission prompt.

async function requestPermissions(): Promise<void> {
  if (process.platform !== 'darwin') return

  // ── Microphone (for voice input via Whisper) ──
  try {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    if (micStatus === 'not-determined') {
      await systemPreferences.askForMediaAccess('microphone')
    }
  } catch (err: any) {
    log(`Permission preflight: microphone check failed — ${err.message}`)
  }

  // ── Accessibility (for global ⌥+Space shortcut) ──
  // globalShortcut works without it on modern macOS; Cmd+Shift+K is always the fallback.
  // Screen Recording: not requested upfront — macOS 15 Sequoia shows an alarming
  // "bypass private window picker" dialog. Let the OS prompt naturally if/when
  // the screenshot feature is actually used.
}

// ─── App Lifecycle ───

app.whenReady().then(async () => {
  // macOS: become an accessory app. Accessory apps can have key windows (keyboard works)
  // without deactivating the currently active app (hover preserved in browsers).
  // This is how Spotlight, Alfred, Raycast work.
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }

  // Windows: setting the AppUserModelId is required for the tray icon, notifications,
  // and JumpList to associate with the correct app identity (matches build.appId).
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.clui.app')
    try {
      app.setJumpList([
        {
          type: 'tasks',
          items: [
            {
              type: 'task',
              title: 'Toggle Clui',
              program: process.execPath,
              args: '--toggle',
              iconPath: process.execPath,
              iconIndex: 0,
              description: 'Show or hide the Clui overlay',
            },
            {
              type: 'task',
              title: 'New session',
              program: process.execPath,
              args: '--new',
              iconPath: process.execPath,
              iconIndex: 0,
              description: 'Start a new Claude session',
            },
          ],
        },
      ])
    } catch (err) {
      log(`[jumplist] failed to set: ${(err as Error).message}`)
    }
  }

  // Register custom protocol for serving local file thumbnails to the renderer.
  // Usage: <img src="clui-local:///path/to/image.png" />
  protocol.handle('clui-local', (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname)
    return net.fetch(`file://${filePath}`)
  })

  // Request permissions upfront so the user is never interrupted mid-session.
  await requestPermissions()

  // Skill provisioning — non-blocking, streams status to renderer
  ensureSkills((status: SkillStatus) => {
    log(`Skill ${status.name}: ${status.state}${status.error ? ` — ${status.error}` : ''}`)
    broadcast(IPC.SKILL_STATUS, status)
  }).catch((err: Error) => log(`Skill provisioning error: ${err.message}`))

  void refreshInstalledTerminals().catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    log(`Terminal discovery warmup failed: ${message}`)
  })

  createWindow()
  snapshotWindowState('after createWindow')

  if (SPACES_DEBUG) {
    mainWindow?.on('show', () => snapshotWindowState('event window show'))
    mainWindow?.on('hide', () => snapshotWindowState('event window hide'))
    mainWindow?.on('focus', () => snapshotWindowState('event window focus'))
    mainWindow?.on('blur', () => snapshotWindowState('event window blur'))
    mainWindow?.webContents.on('focus', () => snapshotWindowState('event webContents focus'))
    mainWindow?.webContents.on('blur', () => snapshotWindowState('event webContents blur'))

    app.on('browser-window-focus', () => snapshotWindowState('event app browser-window-focus'))
    app.on('browser-window-blur', () => snapshotWindowState('event app browser-window-blur'))

    screen.on('display-added', (_e, display) => {
      log(`[spaces] event display-added id=${display.id}`)
      snapshotWindowState('event display-added')
    })
    screen.on('display-removed', (_e, display) => {
      log(`[spaces] event display-removed id=${display.id}`)
      snapshotWindowState('event display-removed')
    })
    screen.on('display-metrics-changed', (_e, display, changedMetrics) => {
      log(`[spaces] event display-metrics-changed id=${display.id} changed=${changedMetrics.join(',')}`)
      snapshotWindowState('event display-metrics-changed')
    })
  }


  // Primary: Option+Space on macOS (doesn't conflict with shell, system, or Anthropic's Claude Desktop).
  // On Windows, Alt+Space is the system title-bar menu and Ctrl+Alt+Space is Claude Desktop's default;
  // Ctrl+Alt+C avoids both and is semantic ("C for Clui").
  // Fallback: Cmd/Ctrl+Shift+K as secondary shortcut, also a global toggle.
  const primaryShortcut = process.platform === 'darwin' ? 'Alt+Space' : 'Control+Alt+C'
  const registered = globalShortcut.register(primaryShortcut, () => toggleWindow(`shortcut ${primaryShortcut}`))
  if (!registered) {
    log(`${primaryShortcut} shortcut registration failed — another app may claim it`)
  }
  globalShortcut.register('CommandOrControl+Shift+K', () => toggleWindow('shortcut Cmd/Ctrl+Shift+K'))

  // Phase 0.1 — toggle the host window. Temporary keybind during the
  // multi-window migration; the host will eventually open whenever the
  // user expands the pill (Ctrl+/) and this debug shortcut goes away.
  const hostShortcut = process.platform === 'darwin' ? 'Alt+Shift+Space' : 'Control+Alt+H'
  globalShortcut.register(hostShortcut, () => toggleHostWindow())

  // Per-tab summon shortcuts: Ctrl+Alt+1 .. Ctrl+Alt+9 (Cmd+Alt+1..9 on macOS).
  // Brings the pill forward AND switches to tab N (1-indexed). If tab N doesn't
  // exist, the renderer ignores the index. This lets you keep multiple agents in
  // different directories and jump straight to a specific one.
  for (let i = 1; i <= 9; i++) {
    const accelerator =
      process.platform === 'darwin' ? `Command+Alt+${i}` : `Control+Alt+${i}`
    globalShortcut.register(accelerator, () => {
      showWindow(`shortcut ${accelerator}`)
      broadcast(IPC.ACTIVATE_TAB_BY_INDEX, i - 1)
    })
  }

  // Windows uses a multi-res .ico; macOS uses a template PNG that auto-inverts for menu bar.
  const trayIconFile = process.platform === 'win32' ? 'tray.ico' : 'trayTemplate.png'
  const trayIconPath = join(__dirname, '../../resources', trayIconFile)
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  if (process.platform === 'darwin') trayIcon.setTemplateImage(true)
  tray = new Tray(trayIcon)
  tray.setToolTip('Clui — Claude Code UI')
  tray.on('click', () => toggleWindow('tray click'))

  let pendingUpdateVersion: string | null = null

  rebuildTrayMenu = function rebuildTrayMenuImpl(): void {
    if (!tray) return
    const hostShortcutLabel = process.platform === 'darwin' ? 'Alt+Shift+Space' : 'Ctrl+Alt+H'
    const hostVisible = !!(hostWindow && !hostWindow.isDestroyed() && hostWindow.isVisible())
    const items: Electron.MenuItemConstructorOptions[] = [
      { label: 'Show Clui', click: () => showWindow('tray menu') },
      {
        label: hostVisible ? `Hide host window (${hostShortcutLabel})` : `Show host window (${hostShortcutLabel})`,
        click: () => toggleHostWindow(),
      },
    ]
    // ─── Background agents — running list ───
    // Show running agents inline so the user can stop or jump to one without
    // opening the launcher. Once an agent finishes the registry evicts it
    // (after ~30s) and the entry disappears.
    const runningAgents = backgroundAgents.list().filter((a) => a.status === 'running')
    if (runningAgents.length > 0) {
      items.push({ type: 'separator' })
      items.push({ label: `Background agents (${runningAgents.length})`, enabled: false })
      for (const agent of runningAgents) {
        const goalShort = agent.goal.length > 40 ? agent.goal.slice(0, 37) + '…' : agent.goal
        items.push({
          label: goalShort,
          submenu: [
            {
              label: 'Open chat',
              click: () => {
                showWindow('tray submenu')
                if (hostWindow && !hostWindow.isDestroyed()) {
                  hostWindow.show()
                  hostWindow.focus()
                }
                broadcast(IPC.ACTIVATE_TAB_BY_ID, agent.tabId)
              },
            },
            {
              label: 'Stop',
              click: () => { backgroundAgents.stop(agent.tabId).catch(() => {}) },
            },
          ],
        })
      }
    }
    if (pendingUpdateVersion) {
      items.push({ type: 'separator' })
      items.push({
        label: `Restart to update (v${pendingUpdateVersion})`,
        click: () => { setImmediate(() => { forceQuit = true; autoUpdater.quitAndInstall() }) },
      })
    }
    items.push({ type: 'separator' })
    items.push({ label: 'Quit', click: () => { app.quit() } })
    tray.setContextMenu(Menu.buildFromTemplate(items))
  }

  rebuildTrayMenu()

  // ─── Auto-updater ───
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = { info: (m: string) => log(`[updater] ${m}`), warn: (m: string) => log(`[updater] WARN ${m}`), error: (m: string) => log(`[updater] ERROR ${m}`), debug: (m: string) => log(`[updater] ${m}`) }

  autoUpdater.on('update-available', (info) => {
    log(`[updater] update available: v${info.version}`)
    broadcast(IPC.UPDATE_AVAILABLE, { version: info.version })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log(`[updater] update downloaded: v${info.version}`)
    pendingUpdateVersion = info.version
    rebuildTrayMenu()
    broadcast(IPC.UPDATE_DOWNLOADED, { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    log(`[updater] error: ${err.message}`)
    broadcast(IPC.UPDATE_ERROR, { message: err.message })
  })

  ipcMain.handle(IPC.CHECK_FOR_UPDATE, () => autoUpdater.checkForUpdates())
  ipcMain.handle(IPC.INSTALL_UPDATE, () => {
    // Defer quitAndInstall so the IPC response is sent before the app quits.
    // Calling it synchronously inside handle() deadlocks: the renderer awaits
    // the response while quitAndInstall() tries to close the window mid-reply.
    setImmediate(() => {
      forceQuit = true
      autoUpdater.quitAndInstall()
    })
  })

  // Initial check + periodic check every 30 minutes
  autoUpdater.checkForUpdates().catch((err: Error) => log(`[updater] initial check failed: ${err.message}`))
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => log(`[updater] periodic check failed: ${err.message}`))
  }, 30 * 60 * 1000)

  // app 'activate' fires when macOS brings the app to the foreground (e.g. after
  // webContents.focus() triggers applicationDidBecomeActive on some macOS versions).
  // Using showWindow here instead of toggleWindow prevents the re-entry race where
  // a summon immediately hides itself because activate fires mid-show.
  app.on('activate', () => showWindow('app activate'))
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  controlPlane.shutdown()
  flushLogs()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
