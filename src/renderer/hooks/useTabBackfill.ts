import { useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import type { Message, TabState } from '../../shared/types'

/**
 * Backfill a tab's history into the local store via one-shot replay
 * from the pill (canonical owner). Used by hub + popout windows that
 * open after a conversation already has messages — without this they'd
 * only see events fired *after* mount.
 *
 * Each tabId is backfilled at most once per window lifetime. If the
 * replay request fails the tabId is removed from the in-flight set so
 * the next focus can retry.
 *
 * Race handling: events that stream in between the replay request and
 * its reply may already be in the local store. We dedupe by message id
 * and merge — the replay snapshot is treated as authoritative for tab
 * metadata, but message lists are unioned to avoid clobbering events
 * that arrived during the round-trip.
 */
const backfilledTabIds = new Set<string>()

export function useTabBackfill(tabId: string | null | undefined): void {
  useEffect(() => {
    if (!tabId) return
    if (backfilledTabIds.has(tabId)) return
    backfilledTabIds.add(tabId)

    let cancelled = false
    void window.clui.requestTabReplay?.(tabId).then((reply) => {
      if (cancelled || !reply) return
      const replayed = reply as TabState
      useSessionStore.setState((s) => {
        const idx = s.tabs.findIndex((t) => t.id === tabId)
        if (idx === -1) {
          return { tabs: [...s.tabs, replayed] }
        }
        const existing = s.tabs[idx]
        const merged: TabState = {
          ...existing,
          ...replayed,
          id: existing.id,
          messages: mergeMessages(replayed.messages, existing.messages),
        }
        const next = [...s.tabs]
        next[idx] = merged
        return { tabs: next }
      })
    }).catch(() => {
      backfilledTabIds.delete(tabId)
    })
    return () => { cancelled = true }
  }, [tabId])
}

function mergeMessages(a: Message[], b: Message[]): Message[] {
  const seen = new Set<string>()
  const out: Message[] = []
  for (const list of [a, b]) {
    for (const m of list) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      out.push(m)
    }
  }
  return out.sort((x, y) => x.timestamp - y.timestamp)
}
