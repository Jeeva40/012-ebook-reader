// Used only as a fallback where Intl.Segmenter isn't available. Mirrors the
// class of characters a word-level Segmenter would treat as separators:
// whitespace and common punctuation.
const WORD_BOUNDARY_RE = /[\s.,;:!?"'“”‘’()[\]{}<>/\\|—–-]/

/**
 * Expands a collapsed Range (as produced by caretRangeFromPoint) to cover
 * the whole word at that position, in place — the "select the word you
 * long-pressed on" behavior users expect from native selection, which this
 * replaces entirely. No-ops (leaves the range collapsed) if the point isn't
 * inside a text node, or lands exactly on a boundary character (e.g.
 * whitespace) with no word on either side.
 */
export function expandRangeToWord(range: Range): void {
  const container = range.startContainer
  if (container.nodeType !== Node.TEXT_NODE) return
  const text = container.textContent ?? ''
  const offset = range.startOffset
  if (text.length === 0) return

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
    const segments = Array.from(segmenter.segment(text))
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const segStart = seg.index
      const segEnd = seg.index + seg.segment.length
      if (offset < segStart || offset >= segEnd) continue
      if (seg.isWordLike) {
        range.setStart(container, segStart)
        range.setEnd(container, segEnd)
        return
      }
      // Landed exactly on a non-word segment (whitespace/punctuation) at
      // its very start — that's the same boundary as "end of the previous
      // word" (e.g. long-pressing right at a word's trailing edge, a very
      // easy spot to land on and not meaningfully different from pressing
      // the word itself). Prefer that word if there is one, rather than
      // leaving the range collapsed.
      if (offset === segStart && i > 0 && segments[i - 1].isWordLike) {
        const prev = segments[i - 1]
        range.setStart(container, prev.index)
        range.setEnd(container, prev.index + prev.segment.length)
      }
      return
    }
    return
  }

  let start = offset
  while (start > 0 && !WORD_BOUNDARY_RE.test(text[start - 1])) start--
  let end = offset
  while (end < text.length && !WORD_BOUNDARY_RE.test(text[end])) end++
  if (start === end) return
  range.setStart(container, start)
  range.setEnd(container, end)
}
