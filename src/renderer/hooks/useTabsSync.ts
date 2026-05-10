import { useEffect, useRef } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import type { TabSnapshot, TabsSnapshotPayload, TabState } from '../../shared/types'

/**
 * Phase D — cross-window tab state sync.
 *
 * The pill is the canonical owner of tab metadata. Other windows (host,
 * card) need to know the tab list + activeTabId to render the
 * conversation view. We broadcast a small snapshot (just metadata, no
 * messages) every time pill's tabs/activeTabId change; messages and
 * runtime state continue to flow through the existing event broadcast
 * (handleNormalizedEvent applies updates to whichever window's store
 * already has the tab).
 *
 * Snapshot payload is intentionally tiny so this can fire on every
 * store change without bandwidth concern.
 */

export function useBroadcastTabsSnapshot(): void {
  const lastPayloadRef = useRef<string>('')

  useEffect(() => {
    const send = (state: ReturnType<typeof useSessionStore.getState>) => {
      const payload: TabsSnapshotPayload = {
        tabs: state.tabs.map<TabSnapshot>((t) => ({
          id: t.id,
          workingDirectory: t.workingDirectory,
          hasChosenDirectory: t.hasChosenDirectory,
          status: t.status,
        })),
        activeTabId: state.activeTabId,
      }
      const serialized = JSON.stringify(payload)
      if (serialized === lastPayloadRef.current) return
      lastPayloadRef.current = serialized
      window.clui.broadcastTabsSnapshot?.(payload)
    }

    // Send the current state immediately so any already-open windows
    // pick up where we are.
    send(useSessionStore.getState())

    return useSessionStore.subscribe((state) => send(state))
  }, [])
}

interface ReceiverOptions {
  /** If set, this window's local activeTabId stays pinned to this value
   *  regardless of what the pill broadcasts (used by card windows that
   *  are bound to one specific tab). Omit on the host so its chat view
   *  follows the pill's selection. */
  pinnedActiveTabId?: string
}

export function useReceiveTabsSnapshot(opts: ReceiverOptions = {}): void {
  const { pinnedActiveTabId } = opts

  useEffect(() => {
    return window.clui.onTabsSnapshot((payload) => {
      useSessionStore.setState((s) => {
        const byId = new Map(s.tabs.map((t) => [t.id, t]))
        const merged = payload.tabs.map((snap) => {
          const existing = byId.get(snap.id)
          if (existing) {
            return {
              ...existing,
              workingDirectory: snap.workingDirectory,
              hasChosenDirectory: snap.hasChosenDirectory,
              status: snap.status,
            }
          }
          // Build a stub for tabs we haven't seen before. Messages and
          // session metadata will fill in as events arrive.
          return makeStubTab(snap)
        })
        return {
          tabs: merged,
          activeTabId: pinnedActiveTabId ?? payload.activeTabId,
        }
      })
    })
  }, [pinnedActiveTabId])
}

function makeStubTab(snap: TabSnapshot): TabState {
  return {
    id: snap.id,
    claudeSessionId: null,
    status: snap.status,
    activeRequestId: null,
    hasUnread: false,
    currentActivity: '',
    permissionQueue: [],
    permissionDenied: null,
    attachments: [],
    messages: [],
    title: snap.workingDirectory.split(/[\\/]/).pop() || 'Tab',
    lastResult: null,
    sessionModel: null,
    sessionTools: [],
    sessionMcpServers: [],
    sessionSkills: [],
    sessionVersion: null,
    queuedPrompts: [],
    workingDirectory: snap.workingDirectory,
    hasChosenDirectory: snap.hasChosenDirectory,
    additionalDirs: [],
    todos: {},
    todoMessageId: null,
    isCompacting: false,
    compactionMessageId: null,
  }
}
