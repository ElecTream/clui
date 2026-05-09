import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react'

/**
 * useWindowDrag — Phase 0.2 (Major Upgrade plan)
 *
 * Wires a frameless overlay window's drag behavior on Windows / Linux. macOS
 * could in theory rely on `-webkit-app-region: drag`, but the existing
 * Electron build uses `transparent: true` + `frame: false` + `setIgnoreMouseEvents`
 * + per-element click-through, which makes the native CSS region unreliable
 * (the OS sees a partially-transparent client area and refuses to start a
 * non-client drag). Instead we capture mousedown ourselves and stream
 * `movementX / movementY` deltas to the main process via
 * `window.clui.startWindowDrag(dx, dy)`. The IPC handler in `main/index.ts`
 * does `setPosition(current + delta)` and clamps to the work area.
 *
 * The hook attaches to a single ref. The element receives drag IFF the
 * pointerdown target is the element itself or a descendant marked with
 * `data-clui-drag="true"` AND no ancestor up to the element is marked
 * `data-clui-no-drag="true"` (so buttons, inputs, dropdowns inside the
 * drag area opt out without prop drilling).
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null)
 *   useWindowDrag(ref)
 *   <div ref={ref} data-clui-drag="true" />
 *
 * Children that should NOT drag the window:
 *   <button data-clui-no-drag="true" ...>
 */
export function useWindowDrag(
  ref: RefObject<HTMLElement> | MutableRefObject<HTMLElement | null>,
): void {
  const dragStateRef = useRef<{ dragging: boolean; pendingX: number; pendingY: number; rafId: number | null }>(
    { dragging: false, pendingX: 0, pendingY: 0, rafId: null },
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const flushDrag = (): void => {
      const state = dragStateRef.current
      state.rafId = null
      if (!state.dragging) return
      if (state.pendingX === 0 && state.pendingY === 0) return
      const dx = state.pendingX
      const dy = state.pendingY
      state.pendingX = 0
      state.pendingY = 0
      try {
        window.clui?.startWindowDrag?.(dx, dy)
      } catch {
        // IPC not available (e.g. in browser preview) — silently drop
      }
    }

    const scheduleFlush = (): void => {
      const state = dragStateRef.current
      if (state.rafId !== null) return
      state.rafId = requestAnimationFrame(flushDrag)
    }

    const onMouseDown = (e: MouseEvent): void => {
      // Left button only
      if (e.button !== 0) return

      // Walk up from target to host: bail if any ancestor is marked no-drag
      // (buttons, inputs, dropdowns). Check both data-clui-no-drag and
      // common interactive elements as a belt-and-suspenders fallback.
      let node: HTMLElement | null = e.target as HTMLElement | null
      while (node && node !== el) {
        if (node.dataset.cluiNoDrag === 'true') return
        const tag = node.tagName
        if (
          tag === 'BUTTON' ||
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          tag === 'A' ||
          node.isContentEditable
        ) {
          return
        }
        node = node.parentElement
      }

      // Begin drag
      const state = dragStateRef.current
      state.dragging = true
      state.pendingX = 0
      state.pendingY = 0

      // Prevent default to avoid text selection / focus shifts during drag
      e.preventDefault()

      const onMouseMove = (mv: MouseEvent): void => {
        if (!state.dragging) return
        // Use movementX/Y (relative deltas) to avoid drift from the window
        // moving out from under the cursor between events
        state.pendingX += mv.movementX
        state.pendingY += mv.movementY
        scheduleFlush()
      }

      const onMouseUp = (): void => {
        state.dragging = false
        if (state.rafId !== null) {
          cancelAnimationFrame(state.rafId)
          state.rafId = null
        }
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.removeEventListener('mouseleave', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      document.addEventListener('mouseleave', onMouseUp)
    }

    el.addEventListener('mousedown', onMouseDown)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      const state = dragStateRef.current
      if (state.rafId !== null) {
        cancelAnimationFrame(state.rafId)
        state.rafId = null
      }
    }
  }, [ref])
}
