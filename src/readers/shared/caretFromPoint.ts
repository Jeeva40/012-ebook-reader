/** Firefox never ships caretRangeFromPoint (WebKit/Blink only); it instead
 * implements the spec-track CaretPosition API. Not currently reachable in
 * this app (entry is gated on File System Access support, which Firefox
 * doesn't have either), but cheap to support correctly rather than assume
 * Chromium forever. */
interface CaretPositionFromPointDocument {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
}

/**
 * Finds the exact text position under a point, as a collapsed Range —
 * the primitive both long-press placement and handle-dragging are built on.
 * `doc` and (x, y) must be in the same coordinate space: for the PDF reader
 * that's the top-level document; for EPUB it's a chapter iframe's own
 * document, since touch events dispatched inside an iframe already carry
 * iframe-relative coordinates.
 */
export function getCaretRangeFromPoint(doc: Document, x: number, y: number): Range | null {
  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(x, y)
  }
  const withCaretPosition = doc as CaretPositionFromPointDocument
  if (typeof withCaretPosition.caretPositionFromPoint === 'function') {
    const pos = withCaretPosition.caretPositionFromPoint(x, y)
    if (!pos) return null
    const range = doc.createRange()
    range.setStart(pos.offsetNode, pos.offset)
    range.collapse(true)
    return range
  }
  return null
}

/** Compares an arbitrary point against a Range boundary (node + offset),
 * the same way Range.comparePoint compares against a whole range: -1 if the
 * point comes before the boundary, 0 if equal, 1 if after. Used while
 * dragging a handle to detect the drag crossing over the *other* handle, at
 * which point the two swap roles (matches native handle behavior). */
export function comparePointToBoundary(
  doc: Document,
  pointContainer: Node,
  pointOffset: number,
  boundaryContainer: Node,
  boundaryOffset: number,
): number {
  const probe = doc.createRange()
  try {
    probe.setStart(boundaryContainer, boundaryOffset)
    probe.collapse(true)
    return probe.comparePoint(pointContainer, pointOffset)
  } catch {
    // Nodes from different trees (e.g. a stale range after the DOM
    // underneath it changed) — treat as "no change" rather than throwing
    // mid-drag.
    return 0
  }
}
