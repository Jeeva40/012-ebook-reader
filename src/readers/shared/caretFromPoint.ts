/** Firefox never ships caretRangeFromPoint (WebKit/Blink only); it instead
 * implements the spec-track CaretPosition API. Not currently reachable in
 * this app (entry is gated on File System Access support, which Firefox
 * doesn't have either), but cheap to support correctly rather than assume
 * Chromium forever. */
interface CaretPositionFromPointDocument {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
}

function firstTextDescendant(node: Node): Text | null {
  let n: Node | null = node
  while (n && n.nodeType !== Node.TEXT_NODE) n = n.firstChild
  return n as Text | null
}

function lastTextDescendant(node: Node): Text | null {
  let n: Node | null = node
  while (n && n.nodeType !== Node.TEXT_NODE) n = n.lastChild
  return n as Text | null
}

/** Finds the nearest actual text-node position for a boundary point that
 * caretRangeFromPoint anchored to an *element* instead (offset is then a
 * child index, not a character offset) — e.g. right at a text node's edge,
 * Chrome can hand back "(span, 1)" (after the span's one child) rather than
 * "(textNode, textNode.length)" for what is visually the exact same spot.
 * Left as an element+child-index boundary, that point is unusable together
 * with a text-node-anchored one: comparing or spanning a Range between them
 * silently misbehaves (see comparePointToBoundary's doc comment, and the
 * Range.setStart/setEnd spec's ancestor-adjustment step, which can collapse
 * a Range built from mismatched boundary "levels" even when both points are
 * visually valid and correctly ordered). Text nodes pass through unchanged. */
function normalizeToTextBoundary(container: Node, offset: number): { node: Node; offset: number } {
  if (container.nodeType === Node.TEXT_NODE) return { node: container, offset }

  const children = container.childNodes

  // Prefer descending forward into the child the boundary sits directly
  // before, landing at that text's very start.
  if (offset < children.length) {
    const text = firstTextDescendant(children[offset])
    if (text) return { node: text, offset: 0 }
  }
  // That child has no text inside it — e.g. a <br> between two lines in
  // pdf.js's text layer, or offset is past the last child. Fall back to
  // whatever text sits immediately *before* the boundary, landing at its
  // very end: for the <br> case that's "end of the previous line", the
  // correct, expected snap for a point that visually sits right at a line
  // break.
  for (let i = offset - 1; i >= 0; i--) {
    const text = lastTextDescendant(children[i])
    if (text) return { node: text, offset: text.length }
  }
  // Nothing before it either (boundary was at the very start) — fall back
  // to the first text found after.
  for (let i = offset; i < children.length; i++) {
    const text = firstTextDescendant(children[i])
    if (text) return { node: text, offset: 0 }
  }
  // No text descendant anywhere in this container — nothing better to fall
  // back to than the original, unusable-but-valid boundary.
  return { node: container, offset }
}

function rectOf(doc: Document, node: Node): DOMRect | null {
  if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).getBoundingClientRect()
  if (node.nodeType === Node.TEXT_NODE) {
    const r = doc.createRange()
    r.selectNodeContents(node)
    return r.getBoundingClientRect()
  }
  return null
}

/** When the raw hit lands on a coarse container boundary (offset is a
 * *child index*, not a character offset — see normalizeToTextBoundary), the
 * usual reason is that (x, y) is just outside every child's actual
 * rendered box: a fraction of a pixel past a line's edge into padding, or
 * between two sibling elements, not because the point is genuinely
 * ambiguous between lines. Re-querying with the point clamped into
 * whichever text-bearing child is vertically closest lets the browser's
 * own glyph-aware resolution do the real work, instead of guessing from
 * tree structure alone. Falls through to normalizeToTextBoundary's
 * sibling-walk if even that doesn't land on real text. */
function resolveViaNearestLine(doc: Document, container: Node, x: number, y: number): Range | null {
  if (container.nodeType !== Node.ELEMENT_NODE) return null
  let best: { rect: DOMRect; distY: number } | null = null
  for (const child of Array.from(container.childNodes)) {
    if (!firstTextDescendant(child)) continue
    const rect = rectOf(doc, child)
    if (!rect || rect.width === 0) continue
    const distY = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
    if (!best || distY < best.distY) best = { rect, distY }
  }
  if (!best) return null

  const clampedX = Math.min(Math.max(x, best.rect.left + 0.5), best.rect.right - 0.5)
  const clampedY = (best.rect.top + best.rect.bottom) / 2
  const retry = rawCaretRangeFromPoint(doc, clampedX, clampedY)
  return retry && retry.startContainer.nodeType === Node.TEXT_NODE ? retry : null
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
  const raw = rawCaretRangeFromPoint(doc, x, y)
  if (!raw) return null
  if (raw.startContainer.nodeType === Node.TEXT_NODE) return raw

  const viaNearestLine = resolveViaNearestLine(doc, raw.startContainer, x, y)
  if (viaNearestLine) return viaNearestLine

  const { node, offset } = normalizeToTextBoundary(raw.startContainer, raw.startOffset)
  const normalized = doc.createRange()
  normalized.setStart(node, offset)
  normalized.collapse(true)
  return normalized
}

function rawCaretRangeFromPoint(doc: Document, x: number, y: number): Range | null {
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

const LINE_SLOP_PX = 4

function collapsedPointRect(doc: Document, container: Node, offset: number): DOMRect | null {
  const probe = doc.createRange()
  try {
    probe.setStart(container, offset)
    probe.collapse(true)
  } catch {
    return null
  }
  // A collapsed range's own getClientRects() gives the caret's actual
  // rendered position (browsers compute this to draw carets); fall back to
  // getBoundingClientRect for the rare case that list is empty.
  return probe.getClientRects()[0] ?? probe.getBoundingClientRect()
}

/** Compares an arbitrary point against a Range boundary (node + offset) by
 * *rendered position* — top-to-bottom, then left-to-right — rather than DOM
 * tree order: -1 if the point renders before the boundary, 0 if effectively
 * the same spot, 1 if after. Used while dragging a handle to detect the drag
 * crossing over the *other* handle, at which point the two swap roles
 * (matches native handle behavior).
 *
 * Deliberately not implemented via Range.comparePoint(), which compares by
 * DOM tree position: caretRangeFromPoint can hand back a boundary anchored
 * to an *element* (e.g. "before its Nth child") right next to one anchored
 * to a *text node* a level deeper for the exact same visual spot, and the
 * DOM spec's tie-break for that ("an ancestor precedes its descendant")
 * doesn't track reading order — it produced exactly backwards comparisons
 * here, silently breaking handle-drag direction. Comparing the two points'
 * actual rendered rects sidesteps that entirely. */
export function comparePointToBoundary(
  doc: Document,
  pointContainer: Node,
  pointOffset: number,
  boundaryContainer: Node,
  boundaryOffset: number,
): number {
  const pointRect = collapsedPointRect(doc, pointContainer, pointOffset)
  const boundaryRect = collapsedPointRect(doc, boundaryContainer, boundaryOffset)
  if (!pointRect || !boundaryRect) return 0

  if (Math.abs(pointRect.top - boundaryRect.top) > LINE_SLOP_PX) {
    return pointRect.top < boundaryRect.top ? -1 : 1
  }
  if (Math.abs(pointRect.left - boundaryRect.left) < 0.5) return 0
  return pointRect.left < boundaryRect.left ? -1 : 1
}
