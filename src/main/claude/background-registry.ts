/**
 * Background-agent registry — Phase E (goal-driven autonomous work).
 *
 * The user fires off a goal with a budget (max turns + wall-clock cap),
 * we start a normal Claude run with --max-turns set, and a watchdog
 * timer hard-cancels if wall-clock expires before the run finishes.
 *
 * State machine:
 *   running ─task_complete──> completed (with cost / turn count)
 *           ─task_failed────> failed
 *           ─wall-clock fire> budget_exceeded
 *           ─user cancel────> cancelled
 *
 * The registry doesn't own the run itself — it asks ControlPlane to
 * submit a prompt under a fresh requestId, then watches the same event
 * stream every other tab uses. That keeps the runtime path identical
 * to a foreground run.
 */
import type {
  BackgroundAgentRecord,
  StartBackgroundAgentInput,
  NormalizedEvent,
} from '../../shared/types'
import type { ControlPlane } from './control-plane'
import * as crypto from 'node:crypto'
import { EventEmitter } from 'node:events'

interface ActiveAgent {
  record: BackgroundAgentRecord
  requestId: string
  watchdog: NodeJS.Timeout
}

export class BackgroundAgentRegistry extends EventEmitter {
  private agents = new Map<string, ActiveAgent>()
  private controlPlane: ControlPlane

  constructor(controlPlane: ControlPlane) {
    super()
    this.controlPlane = controlPlane

    // Subscribe to the event stream so we can mark agents complete
    // when their tab's run finishes naturally.
    this.controlPlane.on('event', (tabId: string, event: NormalizedEvent) => {
      this.onTabEvent(tabId, event)
    })

    this.controlPlane.on('tab-status-change', (tabId: string, newStatus: string) => {
      // If a backgrounded run goes to 'failed' or 'completed', reflect that.
      const active = this.agents.get(tabId)
      if (!active) return
      if (newStatus === 'completed') {
        // task_complete should have already fired; this is a safety net.
        if (active.record.status === 'running') {
          this.markFinished(tabId, 'completed', null)
        }
      } else if (newStatus === 'failed') {
        if (active.record.status === 'running') {
          this.markFinished(tabId, 'failed', 'run failed')
        }
      }
    })
  }

  list(): BackgroundAgentRecord[] {
    return [...this.agents.values()].map((a) => ({ ...a.record }))
  }

  activeCount(): number {
    let n = 0
    for (const a of this.agents.values()) {
      if (a.record.status === 'running') n++
    }
    return n
  }

  async start(input: StartBackgroundAgentInput): Promise<BackgroundAgentRecord> {
    const { tabId, goal, maxTurns, maxWallClockMs, projectPath, model } = input

    const existing = this.agents.get(tabId)
    if (existing && existing.record.status === 'running') {
      throw new Error(`Tab ${tabId} already has an active background agent`)
    }

    const record: BackgroundAgentRecord = {
      tabId,
      goal,
      maxTurns,
      maxWallClockMs,
      startedAt: Date.now(),
      status: 'running',
      costUsd: null,
      turnsUsed: null,
      finishedAt: null,
      failureReason: null,
    }

    const requestId = crypto.randomUUID()
    const watchdog = setTimeout(() => {
      this.onWallClockExpired(tabId)
    }, maxWallClockMs)

    this.agents.set(tabId, { record, requestId, watchdog })
    this.emit('update', record)

    try {
      await this.controlPlane.submitPrompt(tabId, requestId, {
        prompt: goal,
        projectPath,
        maxTurns,
        ...(model ? { model } : {}),
      })
    } catch (err) {
      clearTimeout(watchdog)
      this.markFinished(tabId, 'failed', err instanceof Error ? err.message : String(err))
      throw err
    }

    return { ...record }
  }

  async stop(tabId: string): Promise<void> {
    const active = this.agents.get(tabId)
    if (!active) return
    if (active.record.status !== 'running') return
    clearTimeout(active.watchdog)
    this.controlPlane.cancel(active.requestId)
    this.markFinished(tabId, 'cancelled', null)
  }

  private onTabEvent(tabId: string, event: NormalizedEvent): void {
    const active = this.agents.get(tabId)
    if (!active) return
    if (active.record.status !== 'running') return

    if (event.type === 'task_complete') {
      const completion = event as Extract<NormalizedEvent, { type: 'task_complete' }>
      active.record.costUsd = completion.costUsd ?? null
      active.record.turnsUsed = completion.numTurns ?? null
      this.markFinished(tabId, 'completed', null)
    }
  }

  private onWallClockExpired(tabId: string): void {
    const active = this.agents.get(tabId)
    if (!active) return
    if (active.record.status !== 'running') return
    this.controlPlane.cancel(active.requestId)
    this.markFinished(tabId, 'budget_exceeded', `wall clock ${active.record.maxWallClockMs}ms exceeded`)
  }

  private markFinished(
    tabId: string,
    status: BackgroundAgentRecord['status'],
    failureReason: string | null,
  ): void {
    const active = this.agents.get(tabId)
    if (!active) return
    clearTimeout(active.watchdog)
    active.record.status = status
    active.record.finishedAt = Date.now()
    active.record.failureReason = failureReason
    this.emit('update', { ...active.record })
    // Keep the record in the map for a bit so the renderer can render
    // the final state, then evict.
    setTimeout(() => {
      const cur = this.agents.get(tabId)
      if (cur && cur.record.status !== 'running') {
        this.agents.delete(tabId)
        this.emit('removed', tabId)
      }
    }, 30_000)
  }
}
