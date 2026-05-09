import { useEffect, type MutableRefObject, type RefObject } from 'react'

/**
 * useWindowDrag — Phase 0.1 stage 2d rewrite.
 *
 * Earlier the hook tracked relative `movementX/Y` and streamed deltas to
 * main. Two failure modes surfaced:
 *  1. Crossing monitors with different DPI scales caused `movementX`
 *     values to be in mismatched coord systems for one or two events,
 *     producing an instantaneous jump where the pill "shot off into the
 *     distance" and effectively had to be reopened.
 *  2. If the cursor briefly left the window mid-drag (transparent +
 *     setIgnoreMouseEvents region), no further mousemoves arrived and
 *     the drag stalled — felt like the pill couldn't move very far.
 *
 * The rewrite uses absolute screen coordinates and pointer capture:
 *  - `setPointerCapture` keeps move events flowing even if the cursor
 *    leaves the window or hovers a transparent region.
 *  - On pointerdown we record the cursor's screen position and the
 *    window's screen position once. Every subsequent pointermove
 *    computes `target = initialWindowPos + (currentScreenPos -
 *    initialScreenPos)` — a single absolute target. No accumulation,
 *    no per-event drift.
 *  - Main clamps the target to the union of all displays + a 60px
 *    on-screen margin, so the pill can roam across monitors freely but
 *    can't be lost off the edge.
 *
 * The hook still bails out on common interactive descendants
 * (button / input / textarea / select / a / contenteditable) and on
 * any explicit `data-clui-no-drag="true"` ancestor.
 */
export function useWindowDrag(
  ref: RefObject<HTMLElement> | MutableRefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onPointerDown = (e: PointerEvent): void => {
      // Left button only (button === 0 on pointerdown).
      if (e.button !== 0) return

      // Walk up from target to host: bail if any ancestor is marked
      // no-drag (textareas, buttons, dropdowns).
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

      // Capture pointer so move/up keep firing even when the cursor
      // leaves the (transparent) window or hovers a click-through zone.
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // ignore — fall back to bubbled events
      }

      const initialScreenX = e.screenX
      const initialScreenY = e.screenY
      // window.screenX/Y is the OS-level outer position of the renderer
      // window in screen coordinates (CSS pixels). For a frameless
      // transparent window this is identical to the BrowserWindow's
      // x/y on every platform we ship to.
      const initialWindowX = window.screenX
      const initialWindowY = window.screenY

      // Prevent text selection / focus shifts during drag.
      e.preventDefault()

      let lastSentX = initialWindowX
      let lastSentY = initialWindowY
      let rafScheduled = false
      let pendingX = lastSentX
      let pendingY = lastSentY

      const flush = (): void => {
        rafScheduled = false
        if (pendingX === lastSentX && pendingY === lastSentY) return
        lastSentX = pendingX
        lastSentY = pendingY
        try {
          window.clui?.moveWindowTo?.(pendingX, pendingY)
        } catch {
          // Renderer not connected (e.g. browser preview) — drop silently
        }
      }

      const onPointerMove = (mv: PointerEvent): void => {
        // Absolute target: where would the window be if we shift it by
        // exactly the cursor's screen-space delta since pointerdown?
        // No drift across monitor crossings because both coords are in
        // the same virtual-screen system.
        pendingX = initialWindowX + (mv.screenX - initialScreenX)
        pendingY = initialWindowY + (mv.screenY - initialScreenY)
        if (!rafScheduled) {
          rafScheduled = true
          requestAnimationFrame(flush)
        }
      }

      const cleanup = (): void => {
        el.removeEventListener('pointermove', onPointerMove)
        el.removeEventListener('pointerup', cleanup)
        el.removeEventListener('pointercancel', cleanup)
        try {
          el.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
      }

      el.addEventListener('pointermove', onPointerMove)
      el.addEventListener('pointerup', cleanup)
      el.addEventListener('pointercancel', cleanup)
    }

    el.addEventListener('pointerdown', onPointerDown)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
    }
  }, [ref])
}
