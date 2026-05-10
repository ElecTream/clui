import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  RunOptions,
  NormalizedEvent,
  HealthReport,
  EnrichedError,
  Attachment,
  SessionMeta,
  CatalogPlugin,
  SessionLoadMessage,
  BtwOptions,
  BtwEvent,
  SearchResult,
  SearchIndexStatus,
  PreferredTerminalId,
  TerminalInstallation,
  ModelInfo,
  ClaudeSettings,
  ClaudeSettingsChangeKind,
  ClaudeVersionInfo,
  AgentMeta,
  TabsSnapshotPayload,
  BackgroundAgentRecord,
  StartBackgroundAgentInput,
  PeerSessionMeta,
  PeerServerState,
  PeerImportRequest,
  DiscoveredPeer,
} from '../shared/types'

export interface CluiAPI {
  // ─── Request-response (renderer → main) ───
  start(): Promise<{ version: string; auth: { email?: string; subscriptionType?: string; authMethod?: string }; mcpServers: string[]; projectPath: string; homePath: string }>
  createTab(): Promise<{ tabId: string }>
  prompt(tabId: string, requestId: string, options: RunOptions): Promise<void>
  cancel(requestId: string): Promise<boolean>
  stopTab(tabId: string): Promise<boolean>
  retry(tabId: string, requestId: string, options: RunOptions): Promise<void>
  status(): Promise<HealthReport>
  tabHealth(): Promise<HealthReport>
  closeTab(tabId: string): Promise<void>
  selectDirectory(): Promise<string | null>
  openExternal(url: string): Promise<boolean>
  openInTerminal(sessionId: string | null, projectPath?: string, terminalId?: PreferredTerminalId | null): Promise<boolean>
  listInstalledTerminals(): Promise<TerminalInstallation[]>
  attachFiles(): Promise<Attachment[] | null>
  takeScreenshot(mode?: 'region' | 'fullscreen'): Promise<Attachment | null>
  pasteImage(dataUrl: string): Promise<Attachment | null>
  transcribeAudio(audioBase64: string): Promise<{ error: string | null; errorType?: string; transcript: string | null }>
  fixWhisper(): Promise<{ ok: boolean; error?: string }>
  getDiagnostics(): Promise<any>
  respondPermission(tabId: string, questionId: string, optionId: string): Promise<boolean>
  initSession(tabId: string): void
  resetTabSession(tabId: string): void
  listSessions(projectPath?: string): Promise<SessionMeta[]>
  listAllSessions(): Promise<SessionMeta[]>
  loadSession(sessionId: string, projectPath?: string): Promise<SessionLoadMessage[]>
  getToolResults(sessionId: string, projectPath: string): Promise<Record<string, string>>
  getContext(sessionId: string, projectPath: string, sessionData?: any): Promise<any>
  listDir(dirPath: string): Promise<Array<{ name: string; isDirectory: boolean }>>
  fetchMarketplace(forceRefresh?: boolean): Promise<{ plugins: CatalogPlugin[]; error: string | null }>
  listInstalledPlugins(): Promise<string[]>
  installPlugin(repo: string, pluginName: string, marketplace: string, sourcePath?: string, isSkillMd?: boolean): Promise<{ ok: boolean; error?: string }>
  uninstallPlugin(pluginName: string): Promise<{ ok: boolean; error?: string }>
  setPermissionMode(mode: string): void
  /** Phase A — list models the Claude CLI accepts */
  listModels(): Promise<{ models: ModelInfo[]; cliVersion: string | null }>
  // ─── Phase B: settings + CLAUDE.md bridge ───
  readClaudeSettings(): Promise<ClaudeSettings>
  writeClaudeSettings(patch: ClaudeSettings): Promise<ClaudeSettings>
  readGlobalCLAUDEMd(): Promise<string>
  writeGlobalCLAUDEMd(content: string): Promise<void>
  readProjectCLAUDEMd(projectPath: string): Promise<string>
  writeProjectCLAUDEMd(projectPath: string, content: string): Promise<void>
  /** Subscribe to ~/.claude file changes from external editors / Claude CLI. */
  onClaudeSettingsChanged(callback: (kind: ClaudeSettingsChangeKind) => void): () => void
  // ─── Phase C: agents bridge ───
  listAgents(): Promise<AgentMeta[]>
  writeAgent(agent: AgentMeta): Promise<AgentMeta>
  deleteAgent(filePath: string): Promise<void>
  pathForNewAgent(name: string): Promise<string>

  // ─── Phase D: cross-window tab state sync ───
  broadcastTabsSnapshot(payload: TabsSnapshotPayload): void
  onTabsSnapshot(callback: (payload: TabsSnapshotPayload) => void): () => void

  // ─── Phase E: background agents ───
  startBackgroundAgent(input: StartBackgroundAgentInput): Promise<BackgroundAgentRecord>
  stopBackgroundAgent(tabId: string): Promise<void>
  listBackgroundAgents(): Promise<BackgroundAgentRecord[]>
  onBackgroundAgentUpdate(callback: (record: BackgroundAgentRecord) => void): () => void

  // ─── Phase H: Tailscale-peer session sharing ───
  peerGetLocalInfo(): Promise<PeerServerState>
  peerServerStart(): Promise<PeerServerState>
  peerServerStop(): Promise<PeerServerState>
  peerGenerateSecret(): Promise<PeerServerState>
  peerListSessions(args: { hostname: string; secret: string; port?: number }): Promise<PeerSessionMeta[]>
  peerListTailscalePeers(): Promise<DiscoveredPeer[]>

  // ─── Per-tab pop-out viewports ───
  popoutTab(tabId: string): Promise<void>
  closePopout(tabId?: string): Promise<void>
  /** Pop-out asks for a full state replay of one tab from the pill. */
  requestTabReplay(tabId: string): Promise<unknown | null>
  /** Pill listens for replay requests forwarded from popouts. */
  onReplayTabStateRequest(callback: (replyId: string, tabId: string) => void): () => void
  /** Pill replies to a replay request with the full tab state. */
  sendTabStateReplay(replyId: string, state: unknown | null): void
  peerImportSession(args: PeerImportRequest): Promise<void>
  onPeerServerState(callback: (state: PeerServerState) => void): () => void
  /** Phase G — installed vs latest Claude CLI; cached 1h. */
  checkClaudeVersion(force?: boolean): Promise<ClaudeVersionInfo>
  /** Phase G — open a terminal and run the upgrade command. */
  upgradeClaudeCLI(command?: string): Promise<boolean>
  btwPrompt(opts: BtwOptions): Promise<void>
  onBtwEvent(callback: (event: BtwEvent) => void): () => void
  // ─── Search ───
  searchSessions(query: string): Promise<SearchResult[]>
  triggerSearchIndex(): void
  onSearchIndexStatus(cb: (status: SearchIndexStatus) => void): () => void

  getTheme(): Promise<{ isDark: boolean }>
  onThemeChange(callback: (isDark: boolean) => void): () => void

  // ─── Window management ───
  resizeHeight(height: number): void
  setWindowWidth(width: number): void
  animateHeight(from: number, to: number, durationMs: number): Promise<void>
  hideWindow(): void
  isVisible(): Promise<boolean>
  /** Reset overlay to its default bottom-center position */
  resetWindowPosition(): void

  /** Phase 0.1 — toggle / show / hide the host window from the renderer. */
  toggleHostWindow(): void
  showHostWindow(): void
  hideHostWindow(): void
  /** One-shot read of current host visibility. Use on mount to seed UI
   *  state before the first onHostWindowVisibility broadcast. */
  getHostVisibility(): Promise<boolean>
  /** Subscribe to host visibility changes (broadcast on show/hide). */
  onHostWindowVisibility(callback: (visible: boolean) => void): () => void

  // ─── Event listeners (main → renderer) ───
  onEvent(callback: (tabId: string, event: NormalizedEvent) => void): () => void
  onTabStatusChange(callback: (tabId: string, newStatus: string, oldStatus: string) => void): () => void
  onError(callback: (tabId: string, error: EnrichedError) => void): () => void
  onSkillStatus(callback: (status: { name: string; state: string; error?: string; reason?: string }) => void): () => void
  onWindowShown(callback: () => void): () => void
  onActivateTabByIndex(callback: (index: number) => void): () => void
  onActivateTabById(callback: (tabId: string) => void): () => void

  // ─── Auto-update ───
  checkForUpdate(): Promise<void>
  installUpdate(): Promise<void>
  onUpdateAvailable(callback: (info: { version: string }) => void): () => void
  onUpdateDownloaded(callback: (info: { version: string }) => void): () => void
}

const api: CluiAPI = {
  // ─── Request-response ───
  start: () => ipcRenderer.invoke(IPC.START),
  createTab: () => ipcRenderer.invoke(IPC.CREATE_TAB),
  prompt: (tabId, requestId, options) => ipcRenderer.invoke(IPC.PROMPT, { tabId, requestId, options }),
  cancel: (requestId) => ipcRenderer.invoke(IPC.CANCEL, requestId),
  stopTab: (tabId) => ipcRenderer.invoke(IPC.STOP_TAB, tabId),
  retry: (tabId, requestId, options) => ipcRenderer.invoke(IPC.RETRY, { tabId, requestId, options }),
  status: () => ipcRenderer.invoke(IPC.STATUS),
  tabHealth: () => ipcRenderer.invoke(IPC.TAB_HEALTH),
  closeTab: (tabId) => ipcRenderer.invoke(IPC.CLOSE_TAB, tabId),
  selectDirectory: () => ipcRenderer.invoke(IPC.SELECT_DIRECTORY),
  openExternal: (url) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  openInTerminal: (sessionId, projectPath, terminalId) => ipcRenderer.invoke(IPC.OPEN_IN_TERMINAL, { sessionId, projectPath, terminalId }),
  listInstalledTerminals: () => ipcRenderer.invoke(IPC.LIST_INSTALLED_TERMINALS),
  attachFiles: () => ipcRenderer.invoke(IPC.ATTACH_FILES),
  takeScreenshot: (mode?: 'region' | 'fullscreen') => ipcRenderer.invoke(IPC.TAKE_SCREENSHOT, mode),
  pasteImage: (dataUrl) => ipcRenderer.invoke(IPC.PASTE_IMAGE, dataUrl),
  transcribeAudio: (audioBase64) => ipcRenderer.invoke(IPC.TRANSCRIBE_AUDIO, audioBase64),
  fixWhisper: () => ipcRenderer.invoke(IPC.FIX_WHISPER),
  getDiagnostics: () => ipcRenderer.invoke(IPC.GET_DIAGNOSTICS),
  respondPermission: (tabId, questionId, optionId) =>
    ipcRenderer.invoke(IPC.RESPOND_PERMISSION, { tabId, questionId, optionId }),
  initSession: (tabId) => ipcRenderer.send(IPC.INIT_SESSION, tabId),
  resetTabSession: (tabId) => ipcRenderer.send(IPC.RESET_TAB_SESSION, tabId),
  listSessions: (projectPath?: string) => ipcRenderer.invoke(IPC.LIST_SESSIONS, projectPath),
  listAllSessions: () => ipcRenderer.invoke(IPC.LIST_ALL_SESSIONS),
  loadSession: (sessionId: string, projectPath?: string) => ipcRenderer.invoke(IPC.LOAD_SESSION, { sessionId, projectPath }),
  getToolResults: (sessionId: string, projectPath: string) => ipcRenderer.invoke(IPC.GET_TOOL_RESULTS, { sessionId, projectPath }),
  getContext: (sessionId: string, projectPath: string, sessionData?: any) => ipcRenderer.invoke(IPC.GET_CONTEXT, { sessionId, projectPath, sessionData }),
  listDir: (dirPath: string) => ipcRenderer.invoke(IPC.LIST_DIR, dirPath),
  fetchMarketplace: (forceRefresh) => ipcRenderer.invoke(IPC.MARKETPLACE_FETCH, { forceRefresh }),
  listInstalledPlugins: () => ipcRenderer.invoke(IPC.MARKETPLACE_INSTALLED),
  installPlugin: (repo, pluginName, marketplace, sourcePath, isSkillMd) =>
    ipcRenderer.invoke(IPC.MARKETPLACE_INSTALL, { repo, pluginName, marketplace, sourcePath, isSkillMd }),
  uninstallPlugin: (pluginName) =>
    ipcRenderer.invoke(IPC.MARKETPLACE_UNINSTALL, { pluginName }),
  setPermissionMode: (mode) => ipcRenderer.send(IPC.SET_PERMISSION_MODE, mode),
  listModels: () => ipcRenderer.invoke(IPC.LIST_MODELS),
  // Phase B — settings + CLAUDE.md bridge
  readClaudeSettings: () => ipcRenderer.invoke(IPC.READ_CLAUDE_SETTINGS),
  writeClaudeSettings: (patch) => ipcRenderer.invoke(IPC.WRITE_CLAUDE_SETTINGS, patch),
  readGlobalCLAUDEMd: () => ipcRenderer.invoke(IPC.READ_GLOBAL_CLAUDEMD),
  writeGlobalCLAUDEMd: (content) => ipcRenderer.invoke(IPC.WRITE_GLOBAL_CLAUDEMD, content),
  readProjectCLAUDEMd: (projectPath) => ipcRenderer.invoke(IPC.READ_PROJECT_CLAUDEMD, projectPath),
  writeProjectCLAUDEMd: (projectPath, content) =>
    ipcRenderer.invoke(IPC.WRITE_PROJECT_CLAUDEMD, { projectPath, content }),
  onClaudeSettingsChanged: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, kind: ClaudeSettingsChangeKind) => callback(kind)
    ipcRenderer.on(IPC.CLAUDE_SETTINGS_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.CLAUDE_SETTINGS_CHANGED, handler)
  },
  checkClaudeVersion: (force) => ipcRenderer.invoke(IPC.CHECK_CLAUDE_VERSION, force),
  upgradeClaudeCLI: (command) => ipcRenderer.invoke(IPC.UPGRADE_CLAUDE_CLI, command),
  // Phase C — agents bridge
  listAgents: () => ipcRenderer.invoke(IPC.LIST_AGENTS),
  writeAgent: (agent) => ipcRenderer.invoke(IPC.WRITE_AGENT, agent),
  deleteAgent: (filePath) => ipcRenderer.invoke(IPC.DELETE_AGENT, filePath),
  pathForNewAgent: (name) => ipcRenderer.invoke(IPC.PATH_FOR_NEW_AGENT, name),
  // Phase D — cross-window tab state sync
  broadcastTabsSnapshot: (payload) => ipcRenderer.send(IPC.BROADCAST_TABS_SNAPSHOT, payload),
  onTabsSnapshot: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: TabsSnapshotPayload) => callback(payload)
    ipcRenderer.on(IPC.TABS_SNAPSHOT, handler)
    return () => ipcRenderer.removeListener(IPC.TABS_SNAPSHOT, handler)
  },
  // Phase E — background agents
  startBackgroundAgent: (input) => ipcRenderer.invoke(IPC.START_BACKGROUND_AGENT, input),
  stopBackgroundAgent: (tabId) => ipcRenderer.invoke(IPC.STOP_BACKGROUND_AGENT, tabId),
  listBackgroundAgents: () => ipcRenderer.invoke(IPC.LIST_BACKGROUND_AGENTS),
  onBackgroundAgentUpdate: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, record: BackgroundAgentRecord) => callback(record)
    ipcRenderer.on(IPC.BACKGROUND_AGENT_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.BACKGROUND_AGENT_UPDATE, handler)
  },
  // Phase H — peer session sharing
  peerGetLocalInfo: () => ipcRenderer.invoke(IPC.PEER_GET_LOCAL_INFO),
  peerServerStart: () => ipcRenderer.invoke(IPC.PEER_SERVER_START),
  peerServerStop: () => ipcRenderer.invoke(IPC.PEER_SERVER_STOP),
  peerGenerateSecret: () => ipcRenderer.invoke(IPC.PEER_GENERATE_SECRET),
  peerListSessions: (args) => ipcRenderer.invoke(IPC.PEER_LIST_SESSIONS, args),
  peerListTailscalePeers: () => ipcRenderer.invoke(IPC.PEER_LIST_TAILSCALE_PEERS),

  popoutTab: (tabId: string) => ipcRenderer.invoke(IPC.POPOUT_TAB, tabId),
  closePopout: (tabId?: string) => ipcRenderer.invoke(IPC.CLOSE_POPOUT, tabId),
  requestTabReplay: (tabId: string) => ipcRenderer.invoke(IPC.REQUEST_TAB_REPLAY, tabId),
  onReplayTabStateRequest: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, replyId: string, tabId: string) =>
      callback(replyId, tabId)
    ipcRenderer.on(IPC.REPLAY_TAB_STATE_REQUEST, handler)
    return () => ipcRenderer.removeListener(IPC.REPLAY_TAB_STATE_REQUEST, handler)
  },
  sendTabStateReplay: (replyId: string, state: unknown | null) => {
    ipcRenderer.send(IPC.TAB_STATE_REPLAY, replyId, state)
  },
  peerImportSession: (args) => ipcRenderer.invoke(IPC.PEER_IMPORT_SESSION, args),
  onPeerServerState: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, state: PeerServerState) => callback(state)
    ipcRenderer.on(IPC.PEER_SERVER_STATE, handler)
    return () => ipcRenderer.removeListener(IPC.PEER_SERVER_STATE, handler)
  },
  // Search
  searchSessions: (query: string) => ipcRenderer.invoke(IPC.SEARCH_SESSIONS, query),
  triggerSearchIndex: () => ipcRenderer.send(IPC.SEARCH_BUILD_INDEX),
  onSearchIndexStatus: (cb: (status: SearchIndexStatus) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, status: SearchIndexStatus) => cb(status)
    ipcRenderer.on(IPC.SEARCH_INDEX_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.SEARCH_INDEX_STATUS, handler)
  },
  btwPrompt: (opts) => ipcRenderer.invoke(IPC.BTW_PROMPT, opts),
  onBtwEvent: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, event: BtwEvent) => callback(event)
    ipcRenderer.on(IPC.BTW_EVENT, handler)
    return () => ipcRenderer.removeListener(IPC.BTW_EVENT, handler)
  },
  getTheme: () => ipcRenderer.invoke(IPC.GET_THEME),
  onThemeChange: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, isDark: boolean) => callback(isDark)
    ipcRenderer.on(IPC.THEME_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.THEME_CHANGED, handler)
  },

  // ─── Window management ───
  resizeHeight: (height) => ipcRenderer.send(IPC.RESIZE_HEIGHT, height),
  animateHeight: (from, to, durationMs) =>
    ipcRenderer.invoke(IPC.ANIMATE_HEIGHT, { from, to, durationMs }),
  hideWindow: () => ipcRenderer.send(IPC.HIDE_WINDOW),
  isVisible: () => ipcRenderer.invoke(IPC.IS_VISIBLE),
  resetWindowPosition: () => ipcRenderer.send(IPC.RESET_WINDOW_POSITION),
  setWindowWidth: (width) => ipcRenderer.send(IPC.SET_WINDOW_WIDTH, width),
  toggleHostWindow: () => ipcRenderer.send(IPC.TOGGLE_HOST_WINDOW),
  showHostWindow: () => ipcRenderer.send(IPC.SHOW_HOST_WINDOW),
  hideHostWindow: () => ipcRenderer.send(IPC.HIDE_HOST_WINDOW),
  getHostVisibility: () => ipcRenderer.invoke(IPC.GET_HOST_VISIBILITY),
  onHostWindowVisibility: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, visible: boolean) => callback(visible)
    ipcRenderer.on(IPC.HOST_WINDOW_VISIBILITY, handler)
    return () => ipcRenderer.removeListener(IPC.HOST_WINDOW_VISIBILITY, handler)
  },

  // ─── Event listeners ───
  onEvent: (callback) => {
    const channels = [
      IPC.TEXT_CHUNK, IPC.TOOL_CALL, IPC.TOOL_CALL_UPDATE,
      IPC.TOOL_CALL_COMPLETE, IPC.TASK_UPDATE, IPC.TASK_COMPLETE,
      IPC.SESSION_DEAD, IPC.SESSION_INIT, IPC.ERROR, IPC.RATE_LIMIT,
    ]
    // Single unified handler — all normalized events come through one channel
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, event: NormalizedEvent) => callback(tabId, event)
    ipcRenderer.on('clui:normalized-event', handler)
    return () => ipcRenderer.removeListener('clui:normalized-event', handler)
  },

  onTabStatusChange: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, newStatus: string, oldStatus: string) =>
      callback(tabId, newStatus, oldStatus)
    ipcRenderer.on('clui:tab-status-change', handler)
    return () => ipcRenderer.removeListener('clui:tab-status-change', handler)
  },

  onError: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, error: EnrichedError) =>
      callback(tabId, error)
    ipcRenderer.on('clui:enriched-error', handler)
    return () => ipcRenderer.removeListener('clui:enriched-error', handler)
  },

  onSkillStatus: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, status: any) => callback(status)
    ipcRenderer.on(IPC.SKILL_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.SKILL_STATUS, handler)
  },

  onWindowShown: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.WINDOW_SHOWN, handler)
    return () => ipcRenderer.removeListener(IPC.WINDOW_SHOWN, handler)
  },

  onActivateTabByIndex: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, index: number) => callback(index)
    ipcRenderer.on(IPC.ACTIVATE_TAB_BY_INDEX, handler)
    return () => ipcRenderer.removeListener(IPC.ACTIVATE_TAB_BY_INDEX, handler)
  },

  onActivateTabById: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string) => callback(tabId)
    ipcRenderer.on(IPC.ACTIVATE_TAB_BY_ID, handler)
    return () => ipcRenderer.removeListener(IPC.ACTIVATE_TAB_BY_ID, handler)
  },

  // ─── Auto-update ───
  checkForUpdate: () => ipcRenderer.invoke(IPC.CHECK_FOR_UPDATE),
  installUpdate: () => ipcRenderer.invoke(IPC.INSTALL_UPDATE),
  onUpdateAvailable: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { version: string }) => callback(info)
    ipcRenderer.on(IPC.UPDATE_AVAILABLE, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_AVAILABLE, handler)
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { version: string }) => callback(info)
    ipcRenderer.on(IPC.UPDATE_DOWNLOADED, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_DOWNLOADED, handler)
  },
}

contextBridge.exposeInMainWorld('clui', api)
