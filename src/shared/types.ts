// ─── Claude Code Stream Event Types (verified from v2.1.63) ───

export interface BaseSystemEvent {
  type: 'system'
  subtype: string
  session_id?: string
  uuid: string
  [key: string]: unknown
}

export interface InitEvent extends BaseSystemEvent {
  subtype: 'init'
  cwd: string
  session_id: string
  tools: string[]
  mcp_servers: Array<{ name: string; status: string }>
  model: string
  permissionMode: string
  agents: string[]
  skills: string[]
  plugins: string[]
  claude_code_version: string
  fast_mode_state: string
  uuid: string
}

export interface StatusEvent extends BaseSystemEvent {
  subtype: 'status'
  message?: string
  status?: string
  compact_result?: string
  content?: string
  data?: {
    message?: string
    status?: string
    compact_result?: string
    content?: string
    [key: string]: unknown
  }
}

export interface CompactBoundaryEvent extends BaseSystemEvent {
  subtype: 'compact_boundary'
  message?: string
  summary?: string
  content?: string
  trigger?: string
  compacted_messages?: number
  compact_metadata?: {
    trigger?: string
    pre_tokens?: number
    post_tokens?: number
    duration_ms?: number
    [key: string]: unknown
  }
  data?: {
    message?: string
    summary?: string
    content?: string
    trigger?: string
    compacted_messages?: number
    compact_metadata?: {
      trigger?: string
      pre_tokens?: number
      post_tokens?: number
      duration_ms?: number
      [key: string]: unknown
    }
    [key: string]: unknown
  }
}

export interface StreamEvent {
  type: 'stream_event'
  event: StreamSubEvent
  session_id: string
  parent_tool_use_id: string | null
  uuid: string
}

export type StreamSubEvent =
  | { type: 'message_start'; message: AssistantMessagePayload }
  | { type: 'content_block_start'; index: number; content_block: ContentBlock }
  | { type: 'content_block_delta'; index: number; delta: ContentDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string | null }; usage: UsageData; context_management?: unknown }
  | { type: 'message_stop' }

export interface ContentBlock {
  type: 'text' | 'tool_use'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

export type ContentDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'input_json_delta'; partial_json: string }

export interface AssistantEvent {
  type: 'assistant'
  message: AssistantMessagePayload
  parent_tool_use_id: string | null
  session_id: string
  uuid: string
}

export interface AssistantMessagePayload {
  model: string
  id: string
  role: 'assistant'
  content: ContentBlock[]
  stop_reason: string | null
  usage: UsageData
}

export interface RateLimitEvent {
  type: 'rate_limit_event'
  rate_limit_info: {
    status: string
    resetsAt: number
    rateLimitType: string
  }
  session_id: string
  uuid: string
}

export interface ResultEvent {
  type: 'result'
  subtype: 'success' | 'error'
  is_error: boolean
  duration_ms: number
  num_turns: number
  result: string
  total_cost_usd: number
  session_id: string
  usage: UsageData & {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  permission_denials: string[]
  uuid: string
}

export interface UsageData {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  service_tier?: string
}

export interface PermissionEvent {
  type: 'permission_request'
  tool: { name: string; description?: string; input?: Record<string, unknown> }
  question_id: string
  options: Array<{ id: string; label: string; kind?: string }>
  session_id: string
  uuid: string
}

export interface UserEvent {
  type: 'user'
  message?: {
    role?: 'user'
    content?: string | Array<{ type?: string; text?: string; [key: string]: unknown }>
  }
  session_id?: string
  parent_tool_use_id?: string | null
  timestamp?: string
  isReplay?: boolean
  isSynthetic?: boolean
  uuid?: string
}

// Union of all possible top-level events
export type ClaudeEvent = InitEvent | StatusEvent | CompactBoundaryEvent | StreamEvent | AssistantEvent | RateLimitEvent | ResultEvent | PermissionEvent | UserEvent | UnknownEvent

export interface UnknownEvent {
  type: string
  [key: string]: unknown
}

// ─── Tab State Machine (v2 — from execution plan) ───

export type TabStatus = 'connecting' | 'idle' | 'running' | 'completed' | 'failed' | 'dead' | 'background'

/** Phase E — goal-driven background agent record. */
export interface BackgroundAgentRecord {
  tabId: string
  goal: string
  maxTurns: number
  maxWallClockMs: number
  startedAt: number
  status: 'running' | 'completed' | 'failed' | 'budget_exceeded' | 'cancelled'
  costUsd: number | null
  turnsUsed: number | null
  finishedAt: number | null
  failureReason: string | null
}

export interface StartBackgroundAgentInput {
  tabId: string
  goal: string
  maxTurns: number
  maxWallClockMs: number
  projectPath: string
  model?: string
}

export interface PermissionRequest {
  questionId: string
  toolTitle: string
  toolDescription?: string
  toolInput?: Record<string, unknown>
  options: Array<{ optionId: string; kind?: string; label: string }>
}

export interface Attachment {
  id: string
  type: 'image' | 'file'
  name: string
  path: string
  mimeType?: string
  /** Base64 data URL for image previews */
  dataUrl?: string
  /** File size in bytes */
  size?: number
}

export interface TabState {
  id: string
  claudeSessionId: string | null
  status: TabStatus
  activeRequestId: string | null
  hasUnread: boolean
  currentActivity: string
  permissionQueue: PermissionRequest[]
  /** Fallback card when tools were denied and no interactive permission is available */
  permissionDenied: { tools: Array<{ toolName: string; toolUseId: string }> } | null
  attachments: Attachment[]
  messages: Message[]
  title: string
  /** Last run's result data (cost, tokens, duration) */
  lastResult: RunResult | null
  /** Session metadata from init event */
  sessionModel: string | null
  sessionTools: string[]
  sessionMcpServers: Array<{ name: string; status: string }>
  sessionSkills: string[]
  sessionVersion: string | null
  /** Prompts waiting behind the current run (display text + optional attachments) */
  queuedPrompts: Array<{ prompt: string; attachments?: Attachment[] }>
  /** Working directory for this tab's Claude sessions */
  workingDirectory: string
  /** Whether the user explicitly chose a directory (vs. using default home) */
  hasChosenDirectory: boolean
  /** Extra directories accessible via --add-dir (session-preserving) */
  additionalDirs: string[]
  /** Live todo/task state built from TodoWrite tool completions */
  todos: Record<string, TodoTask>
  /** Message ID of the injected TodoCard system message, updated in-place */
  todoMessageId: string | null
  /** True while Claude is compacting the conversation for the current run */
  isCompacting: boolean
  /** Message ID of the live compaction notice, updated in-place */
  compactionMessageId: string | null
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolName?: string
  toolInput?: string
  toolId?: string
  toolResult?: string
  toolStatus?: 'running' | 'completed' | 'error'
  timestamp: number
  /** Attachments sent with this user message (images / files) */
  attachments?: Attachment[]
}

export interface RunResult {
  totalCostUsd: number
  durationMs: number
  numTurns: number
  usage: UsageData
  sessionId: string
}

// ─── Terminal Integration ───

export type TerminalId = string
export type PreferredTerminalId = 'auto' | TerminalId

export interface TerminalInstallation {
  id: TerminalId
  label: string
}

// ─── Todo/Task State ───

export interface TodoTask {
  id: string
  subject: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'deleted'
  blockedBy?: string[]
  blocks?: string[]
}

// ─── Canonical Events (normalized from raw stream) ───

export type NormalizedEvent =
  | { type: 'session_init'; sessionId: string; tools: string[]; model: string; mcpServers: Array<{ name: string; status: string }>; skills: string[]; version: string; isWarmup?: boolean }
  | { type: 'status_update'; message: string; sessionId?: string | null; status?: string; isCompaction?: boolean }
  | { type: 'compact_boundary'; sessionId?: string | null; summary?: string; trigger?: string; compactedMessages?: number }
  | { type: 'text_chunk'; text: string; parentToolUseId?: string | null }
  | { type: 'tool_call'; toolName: string; toolId: string; index: number; parentToolUseId?: string | null }
  | { type: 'tool_call_update'; toolId: string; partialInput: string; parentToolUseId?: string | null }
  | { type: 'tool_call_complete'; index: number; parentToolUseId?: string | null }
  | { type: 'agent_progress'; toolUseId: string; content: string }
  | { type: 'task_update'; message: AssistantMessagePayload }
  | { type: 'task_complete'; result: string; costUsd: number; durationMs: number; numTurns: number; usage: UsageData; sessionId: string; permissionDenials?: Array<{ toolName: string; toolUseId: string }> }
  | { type: 'error'; message: string; isError: boolean; sessionId?: string }
  | { type: 'session_dead'; exitCode: number | null; signal: string | null; stderrTail: string[] }
  | { type: 'rate_limit'; status: string; resetsAt: number; rateLimitType: string }
  | { type: 'usage'; usage: UsageData }
  | { type: 'permission_request'; questionId: string; toolName: string; toolDescription?: string; toolInput?: Record<string, unknown>; options: Array<{ id: string; label: string; kind?: string }> }

// ─── BTW Side Question ───

export interface BtwOptions {
  btwId: string
  question: string
  projectPath: string
}

export interface BtwEvent {
  btwId: string
  type: 'chunk' | 'done' | 'error'
  text?: string
  errorMessage?: string
}

// ─── Run Options ───

export interface RunOptions {
  prompt: string
  projectPath: string
  sessionId?: string
  allowedTools?: string[]
  maxTurns?: number
  maxBudgetUsd?: number
  systemPrompt?: string
  model?: string
  /** Path to Clui-scoped settings file with hook config (passed via --settings) */
  hookSettingsPath?: string
  /** Extra directories to add via --add-dir (session-preserving) */
  addDirs?: string[]
}

// ─── Control Plane Types ───

export interface TabRegistryEntry {
  tabId: string
  claudeSessionId: string | null
  status: TabStatus
  activeRequestId: string | null
  runPid: number | null
  createdAt: number
  lastActivityAt: number
  promptCount: number
}

export interface HealthReport {
  tabs: Array<{
    tabId: string
    status: TabStatus
    activeRequestId: string | null
    claudeSessionId: string | null
    alive: boolean
  }>
  queueDepth: number
}

export interface EnrichedError {
  message: string
  stderrTail: string[]
  stdoutTail?: string[]
  exitCode: number | null
  elapsedMs: number
  toolCallCount: number
  sawPermissionRequest?: boolean
  permissionDenials?: Array<{ tool_name: string; tool_use_id: string }>
}

// ─── Search ───

export interface SearchResult {
  sessionId: string
  projectPath: string
  score: number
  snippet: string
  firstMessage: string | null
  lastTimestamp: string
  slug: string | null
}

export interface SearchIndexStatus {
  state: 'idle' | 'downloading' | 'indexing' | 'ready' | 'error'
  indexed?: number
  total?: number
  progress?: number  // 0-100, used during 'downloading' state
  error?: string
}

// ─── Session History ───

export interface SessionMeta {
  sessionId: string
  slug: string | null
  firstMessage: string | null
  lastTimestamp: string
  size: number
  /** Project identifier — a real filesystem path (from LIST_SESSIONS) or
   *  an encoded directory name like "-Users-foo-bar" (from LIST_ALL_SESSIONS). */
  projectPath?: string
}

export interface SessionLoadMessage {
  role: string
  content: string
  toolName?: string
  toolId?: string
  timestamp: number
}

// ─── Marketplace / Plugin Types ───

export type PluginStatus = 'not_installed' | 'checking' | 'installing' | 'installed' | 'failed'

export interface CatalogPlugin {
  id: string              // unique: `${repo}/${skillPath}` e.g. 'anthropics/skills/skills/xlsx'
  name: string            // from SKILL.md or plugin.json
  description: string     // from SKILL.md or plugin.json
  version: string         // from plugin.json or '0.0.0'
  author: string          // from plugin.json or marketplace entry
  marketplace: string     // marketplace name from marketplace.json
  repo: string            // 'anthropics/skills'
  sourcePath: string      // path within repo, e.g. 'skills/xlsx'
  installName: string     // individual skill name for SKILL.md skills, bundle name for CLI plugins
  category: string        // 'Agent Skills' | 'Knowledge Work' | 'Financial Services'
  tags: string[]          // Semantic use-case tags derived from name/description (e.g. 'Design', 'Finance')
  isSkillMd: boolean      // true = individual SKILL.md (direct install), false = CLI plugin (bundle install)
}

// ─── Overlay Window Geometry Constants ───
// Single source of truth shared between main and renderer to prevent snap/clamp drift.

// Phase 0.1 stage 2e — pill window dimensions are now sized to fit the
// visible chrome only. Previously the window was 1040×720 with the pill
// at the bottom; the rest was a transparent canvas reserved for the old
// in-pill conversation view (now lives in cards). That huge empty
// canvas was responsible for: native -webkit-app-region drag failing
// (transparent + setIgnoreMouseEvents quirks), DWM rendering a phantom
// frame at the top, and tactile lag from the IPC drag fallback.
//
// Width: 460 content column + ~158 left circle stack + ~46 right hub
// circle + ~10 gap on each side ≈ 720, with 10px shadow margin per side.
// Height: ~50 toolbar + 70 input pill (60 + 10 buffer) + ~20 shadow ≈ 150.
export const OVERLAY_BAR_WIDTH = 740
export const OVERLAY_PILL_HEIGHT = 160
export const OVERLAY_PILL_BOTTOM_MARGIN = 16

// ─── IPC Channel Names ───

export const IPC = {
  // Request-response (renderer → main)
  START: 'clui:start',
  CREATE_TAB: 'clui:create-tab',
  PROMPT: 'clui:prompt',
  CANCEL: 'clui:cancel',
  STOP_TAB: 'clui:stop-tab',
  RETRY: 'clui:retry',
  STATUS: 'clui:status',
  TAB_HEALTH: 'clui:tab-health',
  CLOSE_TAB: 'clui:close-tab',
  SELECT_DIRECTORY: 'clui:select-directory',
  OPEN_EXTERNAL: 'clui:open-external',
  OPEN_IN_TERMINAL: 'clui:open-in-terminal',
  LIST_INSTALLED_TERMINALS: 'clui:list-installed-terminals',
  ATTACH_FILES: 'clui:attach-files',
  TAKE_SCREENSHOT: 'clui:take-screenshot',
  TRANSCRIBE_AUDIO: 'clui:transcribe-audio',
  PASTE_IMAGE: 'clui:paste-image',
  GET_DIAGNOSTICS: 'clui:get-diagnostics',
  RESPOND_PERMISSION: 'clui:respond-permission',
  INIT_SESSION: 'clui:init-session',
  RESET_TAB_SESSION: 'clui:reset-tab-session',
  ANIMATE_HEIGHT: 'clui:animate-height',
  LIST_SESSIONS: 'clui:list-sessions',
  LIST_ALL_SESSIONS: 'clui:list-all-sessions',
  LOAD_SESSION: 'clui:load-session',
  GET_TOOL_RESULTS: 'clui:get-tool-results',
  GET_CONTEXT: 'clui:get-context',
  LIST_DIR: 'clui:list-dir',

  // One-way events (main → renderer)
  TEXT_CHUNK: 'clui:text-chunk',
  TOOL_CALL: 'clui:tool-call',
  TOOL_CALL_UPDATE: 'clui:tool-call-update',
  TOOL_CALL_COMPLETE: 'clui:tool-call-complete',
  TASK_UPDATE: 'clui:task-update',
  TASK_COMPLETE: 'clui:task-complete',
  SESSION_DEAD: 'clui:session-dead',
  SESSION_INIT: 'clui:session-init',
  ERROR: 'clui:error',
  RATE_LIMIT: 'clui:rate-limit',

  // Window management
  RESIZE_HEIGHT: 'clui:resize-height',
  SET_WINDOW_WIDTH: 'clui:set-window-width',
  HIDE_WINDOW: 'clui:hide-window',
  WINDOW_SHOWN: 'clui:window-shown',
  ACTIVATE_TAB_BY_INDEX: 'clui:activate-tab-by-index',
  RESET_WINDOW_POSITION: 'clui:reset-window-position',
  IS_VISIBLE: 'clui:is-visible',

  // Skill provisioning (main → renderer)
  SKILL_STATUS: 'clui:skill-status',

  // Theme
  GET_THEME: 'clui:get-theme',
  THEME_CHANGED: 'clui:theme-changed',

  // Whisper setup
  FIX_WHISPER: 'clui:fix-whisper',

  // Marketplace
  MARKETPLACE_FETCH: 'clui:marketplace-fetch',
  MARKETPLACE_INSTALLED: 'clui:marketplace-installed',
  MARKETPLACE_INSTALL: 'clui:marketplace-install',
  MARKETPLACE_UNINSTALL: 'clui:marketplace-uninstall',

  // Search
  SEARCH_SESSIONS: 'clui:search-sessions',
  SEARCH_BUILD_INDEX: 'clui:search-build-index',
  SEARCH_INDEX_STATUS: 'clui:search-index-status',

  // BTW side question
  BTW_PROMPT: 'clui:btw-prompt',
  BTW_EVENT: 'clui:btw-event',

  // Permission mode
  SET_PERMISSION_MODE: 'clui:set-permission-mode',

  // Model registry (Phase A — adaptive model detection)
  LIST_MODELS: 'clui:list-models',

  // Phase G — Claude CLI version check + install
  CHECK_CLAUDE_VERSION: 'clui:check-claude-version',
  UPGRADE_CLAUDE_CLI: 'clui:upgrade-claude-cli',

  // Settings + CLAUDE.md bridge (Phase B — parity with Claude CLI config)
  READ_CLAUDE_SETTINGS: 'clui:read-claude-settings',
  WRITE_CLAUDE_SETTINGS: 'clui:write-claude-settings',
  READ_GLOBAL_CLAUDEMD: 'clui:read-global-claudemd',
  WRITE_GLOBAL_CLAUDEMD: 'clui:write-global-claudemd',
  READ_PROJECT_CLAUDEMD: 'clui:read-project-claudemd',
  WRITE_PROJECT_CLAUDEMD: 'clui:write-project-claudemd',
  CLAUDE_SETTINGS_CHANGED: 'clui:claude-settings-changed',

  // Agents bridge (Phase C — native /agents UI)
  LIST_AGENTS: 'clui:list-agents',
  WRITE_AGENT: 'clui:write-agent',
  DELETE_AGENT: 'clui:delete-agent',
  PATH_FOR_NEW_AGENT: 'clui:path-for-new-agent',

  // Phase D — cross-window tab state sync. Pill is the canonical source
  // of tab metadata; the host (and future card) renderers mirror via
  // these snapshot broadcasts so the conversation view can render in
  // any window.
  BROADCAST_TABS_SNAPSHOT: 'clui:broadcast-tabs-snapshot',
  TABS_SNAPSHOT: 'clui:tabs-snapshot',

  // Phase E — goal-driven background agents
  START_BACKGROUND_AGENT: 'clui:start-background-agent',
  STOP_BACKGROUND_AGENT: 'clui:stop-background-agent',
  LIST_BACKGROUND_AGENTS: 'clui:list-background-agents',
  BACKGROUND_AGENT_UPDATE: 'clui:background-agent-update',

  // Phase H — Tailscale-peer session sharing
  PEER_SERVER_STATE: 'clui:peer-server-state',
  PEER_SERVER_START: 'clui:peer-server-start',
  PEER_SERVER_STOP: 'clui:peer-server-stop',
  PEER_LIST_SESSIONS: 'clui:peer-list-sessions',
  PEER_IMPORT_SESSION: 'clui:peer-import-session',
  PEER_GENERATE_SECRET: 'clui:peer-generate-secret',
  PEER_GET_LOCAL_INFO: 'clui:peer-get-local-info',

  // Phase 0.1 — tethered host window (separate solid BrowserWindow that
  // holds Conversation/Settings/Marketplace/etc., decoupled from the pill's
  // transparent canvas to eliminate shadow-bleed and give the user a real
  // resizable surface). Pill stays as the always-on-top summon.
  TOGGLE_HOST_WINDOW: 'clui:toggle-host-window',
  SHOW_HOST_WINDOW: 'clui:show-host-window',
  HIDE_HOST_WINDOW: 'clui:hide-host-window',
  HOST_WINDOW_VISIBILITY: 'clui:host-window-visibility',
  GET_HOST_VISIBILITY: 'clui:get-host-visibility',

  // Auto-update
  CHECK_FOR_UPDATE: 'clui:check-for-update',
  INSTALL_UPDATE: 'clui:install-update',
  UPDATE_AVAILABLE: 'clui:update-available',
  UPDATE_DOWNLOADED: 'clui:update-downloaded',
  UPDATE_ERROR: 'clui:update-error',

  // Legacy (kept for backward compat during migration)
  STREAM_EVENT: 'clui:stream-event',
  RUN_COMPLETE: 'clui:run-complete',
  RUN_ERROR: 'clui:run-error',
} as const

/**
 * ModelInfo — Phase A. A single model entry exposed by the registry.
 *
 *  - `kind: 'alias'`   stable name like 'sonnet' / 'opus' / 'haiku' that the
 *                      Claude CLI auto-routes to the latest version.
 *  - `kind: 'pinned'`  full model ID like 'claude-sonnet-4-6' for reproducible
 *                      runs.
 *
 * The renderer treats both uniformly when passing to `--model` at spawn time.
 */
/**
 * ClaudeSettings — Phase B. Read/write surface for `~/.claude/settings.json`.
 *
 * Intentionally typed as a loose Record rather than a strict shape — Claude
 * CLI's settings schema isn't published, evolves often, and clui needs to
 * round-trip unknown keys faithfully (read-modify-write must not drop fields
 * it doesn't recognize).
 */
export type ClaudeSettings = Record<string, unknown>
export type ClaudeSettingsChangeKind = 'settings' | 'claudemd'

/** Phase D — minimal tab metadata broadcast across windows so non-pill
 * windows can render the conversation list / view without owning the
 * canonical tab state themselves. Messages and runtime state propagate
 * via the existing event flow. */
export interface TabSnapshot {
  id: string
  workingDirectory: string
  hasChosenDirectory: boolean
  status: TabStatus
}

export interface TabsSnapshotPayload {
  tabs: TabSnapshot[]
  activeTabId: string
}

/** Phase H — peer session metadata fetched from a remote clui. */
export interface PeerSessionMeta {
  sessionId: string
  projectPath: string
  lastTimestamp: string
  size: number
  firstMessage: string | null
}

export interface PeerServerState {
  running: boolean
  port: number
  hostname: string | null
  /** First chars of the secret — for display, not for auth. */
  secretPrefix: string | null
}

export interface PeerImportRequest {
  hostname: string
  secret: string
  port?: number
  projectPath: string
  sessionId: string
}

/** Phase C — Subagent definition stored in ~/.claude/agents/<name>.md. */
export interface AgentMeta {
  name: string
  description: string
  tools: string | null
  body: string
  filePath: string
}

/** Phase G — Claude CLI version check result. */
export interface ClaudeVersionInfo {
  installed: string | null
  latest: string | null
  updateAvailable: boolean
  compareResult: -1 | 0 | 1 | null
  upgradeCommand: string
  checkedAt: number
}

export interface ModelInfo {
  /** Value passed to `--model` flag */
  id: string
  /** User-facing name */
  label: string
  /** Family grouping for UI sorting */
  family: 'opus' | 'sonnet' | 'haiku' | 'other'
  kind: 'alias' | 'pinned'
  isDefault?: boolean
  /** Token context window if known */
  contextWindow?: number
}
