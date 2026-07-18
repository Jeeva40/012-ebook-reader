import { useCallback, useEffect, useRef, useState } from 'react'
import { comparePointToBoundary, getCaretRangeFromPoint } from './caretFromPoint'
import { expandRangeToWord } from './wordBoundary'
import type { OverlayRect } from './SelectionOverlay'

const LONG_PRESS_MS = 450
const MOVE_CANCEL_PX = 10

/** Everything needed to place/read a Range in one "container" (the PDF
 * scroll area, or one EPUB chapter iframe's document) and map its
 * coordinates into top-level screen space for rendering. `meta` is opaque
 * to the hook — each reader stashes whatever extra context it needs to
 * finalize a highlight later (EPUB stashes the epub.js Contents instance,
 * for cfiFromRange/section lookup; PDF doesn't need any, so it's null). */
export interface SelectionTarget<TMeta> {
  doc: Document
  toScreenPoint: (x: number, y: number) => { x: number; y: number }
  /** Inverse of toScreenPoint — maps a top-level screen point back into
   * this target's own document coordinate space. Needed because handle
   * drags are tracked entirely in screen space (see DragState.grabOffset)
   * but getCaretRangeFromPoint needs coordinates in the target document's
   * own space (iframe-relative for EPUB). Identity for PDF. */
  toDocPoint: (x: number, y: number) => { x: number; y: number }
  meta: TMeta
}

export interface TouchSelectionState<TMeta> {
  range: Range
  meta: TMeta
  overlayRects: OverlayRect[]
  anchorRect: DOMRect
  /** Where to draw the handle's teardrop — the bottom corner of its
   * boundary rect, matching native mobile handle style. */
  startHandle: { x: number; y: number }
  endHandle: { x: number; y: number }
  /** Where to *test* for that handle's drag, in getCaretRangeFromPoint
   * terms — the vertical *center* of its boundary rect, not the bottom
   * edge. The bottom edge is exactly where the rect's hit-testable area
   * ends, so a point computed as "exactly at the bottom" can round or drift
   * a fraction of a pixel outside the text and resolve to an ancestor
   * element instead (see grabOffset's doc comment for how this gets used). */
  startHitAnchor: { x: number; y: number }
  endHitAnchor: { x: number; y: number }
}

interface UseTouchSelectionOptions {
  /** Only start a long-press gesture if it began on an element this
   * accepts — e.g. PDF gates on being inside a page; EPUB (already scoped
   * to one chapter's iframe per bound container) accepts everything. */
  isSelectableTarget: (target: EventTarget | null) => boolean
}

interface Gesture<TMeta> {
  startX: number
  startY: number
  moved: boolean
  target: SelectionTarget<TMeta>
}

type DragHandle = 'start' | 'end'

interface DragState<TMeta> {
  which: DragHandle
  target: SelectionTarget<TMeta>
  /** Screen-space offset between where the finger actually touched down
   * and the handle's *hit-test* anchor (TouchSelectionState.startHitAnchor/
   * endHitAnchor — the vertical center of the boundary rect, not the
   * handle's visual bottom-edge position). The handle's touch target sits
   * well below the text line it anchors to (stem + generous hit padding —
   * see SelectionHandles) and the visual anchor is right at the text's
   * bottom edge, so without this correction every subsequent touchmove's
   * raw coordinates land at or below the text and can resolve to the
   * page/section wrapper instead of the actual text, breaking range
   * placement. Applied on every move so dragging tracks the finger
   * consistently regardless of exactly where within the handle it
   * grabbed. */
  grabOffset: { x: number; y: number }
}

function computeState<TMeta>(
  range: Range,
  target: SelectionTarget<TMeta>,
): TouchSelectionState<TMeta> | null {
  const rawRects = Array.from(range.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5)
  if (rawRects.length === 0) return null

  const overlayRects: OverlayRect[] = rawRects.map((r) => {
    const p = target.toScreenPoint(r.left, r.top)
    return { left: p.x, top: p.y, width: r.width, height: r.height }
  })

  const bounding = range.getBoundingClientRect()
  const boundingScreen = target.toScreenPoint(bounding.left, bounding.top)
  const anchorRect = new DOMRect(boundingScreen.x, boundingScreen.y, bounding.width, bounding.height)

  const first = rawRects[0]
  const last = rawRects[rawRects.length - 1]
  const startHandle = target.toScreenPoint(first.left, first.bottom)
  const endHandle = target.toScreenPoint(last.right, last.bottom)
  const startHitAnchor = target.toScreenPoint(first.left, (first.top + first.bottom) / 2)
  const endHitAnchor = target.toScreenPoint(last.right, (last.top + last.bottom) / 2)

  return {
    range,
    meta: target.meta,
    overlayRects,
    anchorRect,
    startHandle,
    endHandle,
    startHitAnchor,
    endHitAnchor,
  }
}

/**
 * Fully custom long-press-to-select + drag-handle touch selection, replacing
 * the browser's native Selection entirely on coarse pointers. The native
 * Selection can't be used at all here (not even briefly): the moment one
 * exists, Android/iOS may show their own Copy/Share/Select-all action bar
 * before any of our JS gets a chance to react — so every Range this
 * produces is a plain, disconnected Range object, never passed to
 * `window.getSelection().addRange()`.
 *
 * A single hook instance tracks at most one in-progress or finalized
 * selection, sourced from however many "containers" are bound to it via
 * `bindContainer` — the PDF reader binds one (the scroll area); the EPUB
 * reader binds one per currently-rendered chapter iframe, since touch
 * events inside an iframe never reach listeners outside it.
 */
export function useTouchSelection<TMeta>({ isSelectableTarget }: UseTouchSelectionOptions) {
  const [selection, setSelection] = useState<TouchSelectionState<TMeta> | null>(null)

  const gestureRef = useRef<Gesture<TMeta> | null>(null)
  const longPressTimerRef = useRef<number | undefined>(undefined)
  const rangeRef = useRef<Range | null>(null)
  const activeTargetRef = useRef<SelectionTarget<TMeta> | null>(null)
  // Latest screen-space *hit-test* anchors (vertical center of each
  // boundary rect, not the handle's visual bottom-edge position — see
  // TouchSelectionState.startHitAnchor), kept alongside activeTargetRef
  // purely so a fresh handle-grab can compute its offset from them (see
  // DragState.grabOffset).
  const lastHitAnchorsRef = useRef<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(
    null,
  )
  const draggingRef = useRef<DragState<TMeta> | null>(null)

  const clear = useCallback(() => {
    window.clearTimeout(longPressTimerRef.current)
    gestureRef.current = null
    rangeRef.current = null
    activeTargetRef.current = null
    lastHitAnchorsRef.current = null
    draggingRef.current = null
    setSelection(null)
  }, [])

  const applyRange = useCallback((range: Range, target: SelectionTarget<TMeta>) => {
    const state = computeState(range, target)
    if (!state) return
    rangeRef.current = range
    activeTargetRef.current = target
    lastHitAnchorsRef.current = { start: state.startHitAnchor, end: state.endHitAnchor }
    setSelection(state)
  }, [])

  const bindContainer = useCallback(
    (el: HTMLElement | Document, target: SelectionTarget<TMeta>) => {
      function onTouchStart(e: TouchEvent) {
        if (e.touches.length !== 1) return
        if (!isSelectableTarget(e.target)) return
        const touch = e.touches[0]
        gestureRef.current = { startX: touch.clientX, startY: touch.clientY, moved: false, target }
        window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = window.setTimeout(() => {
          const g = gestureRef.current
          gestureRef.current = null
          if (!g || g.moved) return
          if (!window.matchMedia('(pointer: coarse)').matches) return
          const range = getCaretRangeFromPoint(g.target.doc, g.startX, g.startY)
          if (!range) return
          expandRangeToWord(range)
          if (range.collapsed) return
          applyRange(range, g.target)
        }, LONG_PRESS_MS)
      }

      // Not the same gesture that placed the selection — that one is
      // deliberately left alone once long-press fires (see bindContainer's
      // onTouchStart above): the expected flow is lift finger, then drag a
      // handle as its own separate gesture. Here we only need to cancel a
      // *pending* (not-yet-fired) long-press if the finger moves — that's a
      // scroll/swipe, not a long-press, and scrolling must keep working
      // normally (these listeners are passive, so nothing here blocks it).
      function onTouchMove(e: TouchEvent) {
        const g = gestureRef.current
        if (!g) return
        const touch = e.touches[0]
        if (!touch) return
        const dx = touch.clientX - g.startX
        const dy = touch.clientY - g.startY
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
          g.moved = true
          window.clearTimeout(longPressTimerRef.current)
        }
      }

      function onTouchEnd() {
        window.clearTimeout(longPressTimerRef.current)
        gestureRef.current = null
      }

      el.addEventListener('touchstart', onTouchStart as EventListener, { passive: true })
      el.addEventListener('touchmove', onTouchMove as EventListener, { passive: true })
      el.addEventListener('touchend', onTouchEnd as EventListener, { passive: true })
      el.addEventListener('touchcancel', onTouchEnd as EventListener, { passive: true })

      return () => {
        el.removeEventListener('touchstart', onTouchStart as EventListener)
        el.removeEventListener('touchmove', onTouchMove as EventListener)
        el.removeEventListener('touchend', onTouchEnd as EventListener)
        el.removeEventListener('touchcancel', onTouchEnd as EventListener)
      }
    },
    [isSelectableTarget, applyRange],
  )

  // Handle-drag touchmove/touchend are attached once, globally, rather than
  // per-handle-element: the finger can move well outside a 44px handle's
  // bounds mid-drag (that's normal — you're dragging past other text), and
  // a listener scoped to the handle itself would stop receiving events the
  // moment the touch point leaves it.
  useEffect(() => {
    function onDocMove(e: TouchEvent) {
      const d = draggingRef.current
      const current = rangeRef.current
      if (!d || !current) return
      const touch = e.touches[0]
      if (!touch) return
      e.preventDefault()

      // Correct for where within the handle's (much larger than the text
      // line) touch target the finger actually is — see grabOffset's doc
      // comment. Without this, dragging tracks a point well below the
      // text and can miss it (and any text-node comparisons built from
      // that miss) entirely.
      const screenX = touch.clientX - d.grabOffset.x
      const screenY = touch.clientY - d.grabOffset.y
      const docPoint = d.target.toDocPoint(screenX, screenY)

      const pointRange = getCaretRangeFromPoint(d.target.doc, docPoint.x, docPoint.y)
      if (!pointRange) return
      const doc = d.target.doc
      const newRange = doc.createRange()

      if (d.which === 'start') {
        const cmp = comparePointToBoundary(
          doc,
          pointRange.startContainer,
          pointRange.startOffset,
          current.endContainer,
          current.endOffset,
        )
        if (cmp > 0) {
          // Dragged the start handle past the end — they swap roles, same
          // as native handles do when you drag one past the other.
          newRange.setStart(current.endContainer, current.endOffset)
          newRange.setEnd(pointRange.startContainer, pointRange.startOffset)
          draggingRef.current = { ...d, which: 'end' }
        } else {
          newRange.setStart(pointRange.startContainer, pointRange.startOffset)
          newRange.setEnd(current.endContainer, current.endOffset)
        }
      } else {
        const cmp = comparePointToBoundary(
          doc,
          pointRange.startContainer,
          pointRange.startOffset,
          current.startContainer,
          current.startOffset,
        )
        if (cmp < 0) {
          newRange.setStart(pointRange.startContainer, pointRange.startOffset)
          newRange.setEnd(current.startContainer, current.startOffset)
          draggingRef.current = { ...d, which: 'start' }
        } else {
          newRange.setStart(current.startContainer, current.startOffset)
          newRange.setEnd(pointRange.startContainer, pointRange.startOffset)
        }
      }

      applyRange(newRange, d.target)
    }

    function onDocEnd() {
      draggingRef.current = null
    }

    // Not passive: dragging a handle must suppress the page's own touch
    // scrolling underneath it (see e.preventDefault() above).
    document.addEventListener('touchmove', onDocMove, { passive: false })
    document.addEventListener('touchend', onDocEnd)
    document.addEventListener('touchcancel', onDocEnd)
    return () => {
      document.removeEventListener('touchmove', onDocMove)
      document.removeEventListener('touchend', onDocEnd)
      document.removeEventListener('touchcancel', onDocEnd)
    }
  }, [applyRange])

  // The overlay and handles are rendered with position: fixed (they live
  // outside any scrolling ancestor — the highlight has to be drawn on top
  // of everything, including reader chrome), so unlike position: absolute
  // inside a scrolling container, the browser never repositions them on its
  // own when the page scrolls. Without this, both the overlay and the
  // handles stay glued to their initial screen position while the actual
  // text scrolls out from under them — and a handle grabbed from that now
  // wrong position computes drag coordinates relative to the wrong anchor,
  // so a drag stops tracking the finger correctly (or worse, jumps the
  // selection to unrelated text). Recomputing straight from the live Range
  // fixes both: Range.getClientRects() always reflects the current
  // scrolled layout, no matter which container scrolled or how.
  useEffect(() => {
    let scheduled = false
    function onScroll() {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        const range = rangeRef.current
        const target = activeTargetRef.current
        if (!range || !target) return
        const state = computeState(range, target)
        if (!state) return
        lastHitAnchorsRef.current = { start: state.startHitAnchor, end: state.endHitAnchor }
        setSelection(state)
      })
    }
    // capture: true so this catches scroll on *any* scrollable descendant
    // in the document (scroll events don't bubble, but capture-phase
    // listeners on an ancestor still see them) — covers the PDF reader's
    // own scroll container and epub.js's internally-managed one without
    // needing each reader to wire this up itself.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, true)
  }, [])

  // Plain functions (not React props) meant to be wired up via a raw
  // addEventListener({ passive: false }) on the rendered handle elements —
  // React registers its own onTouchStart/onTouchMove props as passive for
  // scroll-perf reasons, which would silently swallow preventDefault() here
  // and let the browser synthesize a stray click right after the drag
  // starts (see SelectionHandles).
  const startHandleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 1 || !activeTargetRef.current || !lastHitAnchorsRef.current) return
    e.stopPropagation()
    e.preventDefault()
    const touch = e.touches[0]
    const anchor = lastHitAnchorsRef.current.start
    draggingRef.current = {
      which: 'start',
      target: activeTargetRef.current,
      grabOffset: { x: touch.clientX - anchor.x, y: touch.clientY - anchor.y },
    }
  }, [])

  const endHandleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 1 || !activeTargetRef.current || !lastHitAnchorsRef.current) return
    e.stopPropagation()
    e.preventDefault()
    const touch = e.touches[0]
    const anchor = lastHitAnchorsRef.current.end
    draggingRef.current = {
      which: 'end',
      target: activeTargetRef.current,
      grabOffset: { x: touch.clientX - anchor.x, y: touch.clientY - anchor.y },
    }
  }, [])

  return {
    selection,
    clear,
    bindContainer,
    startHandleTouchStart,
    endHandleTouchStart,
  }
}

export type UseTouchSelectionResult<TMeta> = ReturnType<typeof useTouchSelection<TMeta>>
