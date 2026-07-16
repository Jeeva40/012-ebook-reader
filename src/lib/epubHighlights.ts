import type JSZip from 'jszip'
import { EpubCFI } from 'epubjs'
import { HIGHLIGHT_COLORS, HIGHLIGHT_OPACITY, type HighlightColor } from './highlightColors'

export interface EpubHighlight {
  id: string
  /** Zip-internal path (spine-item location) the highlight lives in. */
  href: string
  color: HighlightColor
  /** Short text snippet, for the highlights panel. */
  text: string
}

const HIGHLIGHT_CLASS = 'highlight'
const SNIPPET_MAX_LENGTH = 140

/**
 * Highlight ids are minted here (not via a bare crypto.randomUUID()) for two
 * spec-compliance reasons epubcheck catches that lenient parsers don't:
 *  - A UUID can start with a digit, which is invalid as an XML `id` (Name
 *    production requires a letter, `_`, or `:` first) — epubcheck rejects it
 *    outright ("value of attribute id is invalid").
 *  - Custom `data-*` attributes (e.g. a `data-highlight-id` grouping
 *    attribute) aren't declared in the XHTML 1.1 DTD many EPUB2 books
 *    validate against, so we group same-highlight spans via a `class` token
 *    instead (see highlightSelector below) — `class` is CDATA in every
 *    XHTML DTD variant, so any value round-trips cleanly.
 */
export function createHighlightId(): string {
  return `hl-${crypto.randomUUID()}`
}

/** Selects every span belonging to the highlight group `id` (a highlight
 * spanning an existing tag boundary produces multiple spans sharing one
 * id). Matches on `class`, not `data-*`, for the DTD reasons above. */
function highlightSelector(id: string): string {
  return `[class~="${id}"]`
}

/**
 * The EPUB Open Container Format spec requires the "mimetype" entry to be
 * the zip's first file, stored with no compression. JSZip's loadAsync()
 * doesn't remember each entry's original compression method, so a later
 * generateAsync({ compression: 'DEFLATE' }) — needed to keep the rest of the
 * archive compact — would silently deflate "mimetype" too, producing a file
 * that strict readers (notably Apple Books) refuse to recognize as a valid
 * EPUB. Call this once right after loading a zip, before any edits.
 */
export async function ensureMimetypeStored(zip: JSZip): Promise<void> {
  const entry = zip.file('mimetype')
  if (!entry) return
  const bytes = await entry.async('uint8array')
  zip.file('mimetype', bytes, { compression: 'STORE' })
}

function hexToRgba(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const STYLE_MARKER_COMMENT = '/* ebook-reader-highlight-styles */'

function buildHighlightCss(): string {
  const rules = HIGHLIGHT_COLORS.filter((c) => !c.isEraser)
    .map((c) => `.highlight-${c.id} { background-color: ${hexToRgba(c.swatch, HIGHLIGHT_OPACITY)}; }`)
    .join('\n')
  return `${STYLE_MARKER_COMMENT}\n.highlight { border-radius: 0.15em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }\n${rules}`
}

/** Idempotent — safe to call on every highlight mutation. XHTML 1.1's DTD
 * gives `<style>` a restricted attribute list that excludes even `id` (only
 * dir/lang/media/title/type/xml:lang/xml:space are allowed), so idempotency
 * can't be marked via an attribute at all — a leading CSS comment in the
 * element's *content* is the only DTD-safe way to recognize "already
 * injected" on a later pass. `type` is declared because XHTML 1.1 requires
 * it, unlike HTML5 where it's implied. */
export function ensureHighlightStyleInjected(doc: Document): void {
  const existing = doc.querySelectorAll('style')
  for (const s of existing) {
    if (s.textContent?.includes(STYLE_MARKER_COMMENT)) return
  }
  const style = doc.createElement('style')
  style.setAttribute('type', 'text/css')
  style.textContent = buildHighlightCss()
  doc.head?.appendChild(style)
}

function snippetFor(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > SNIPPET_MAX_LENGTH
    ? `${trimmed.slice(0, SNIPPET_MAX_LENGTH)}…`
    : trimmed
}

/**
 * Wraps every text-node portion inside `range` with a highlight span,
 * splitting text nodes at the range's boundaries and leaving surrounding
 * tags otherwise untouched. A selection crossing an existing tag boundary
 * (e.g. into an <em>) produces multiple spans sharing the same id — that's
 * expected, and mirrors how browsers' own find-in-page highlighting works.
 */
export function wrapRangeWithHighlight(
  doc: Document,
  range: Range,
  id: string,
  colorId: string,
): void {
  // Capture boundaries up front: splitting text nodes as we go can cause the
  // browser to silently re-point a *live* range's own boundaries, so we
  // compare against these fixed references instead of re-reading `range`.
  const startContainer = range.startContainer
  const startOffset = range.startOffset
  const endContainer = range.endContainer
  const endOffset = range.endOffset

  const walkRoot =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? (range.commonAncestorContainer.parentNode ?? range.commonAncestorContainer)
      : range.commonAncestorContainer

  const textNodes: Text[] = []
  const walker = doc.createTreeWalker(walkRoot, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (range.intersectsNode(node)) textNodes.push(node as Text)
    node = walker.nextNode()
  }

  let first = true
  for (const textNode of textNodes) {
    let target: Text = textNode

    if (target === endContainer && endOffset < target.length) {
      target.splitText(endOffset)
    }
    if (target === startContainer && startOffset > 0) {
      target = target.splitText(startOffset)
    }
    if (!target.textContent) continue

    const span = doc.createElement('span')
    span.className = `${HIGHLIGHT_CLASS} highlight-${colorId} ${id}`
    if (first) {
      span.id = id
      first = false
    }
    target.parentNode?.insertBefore(span, target)
    span.appendChild(target)
  }

  ensureHighlightStyleInjected(doc)
}

export function unwrapHighlight(doc: Document, id: string): void {
  const spans = doc.querySelectorAll(highlightSelector(id))
  spans.forEach((span) => {
    const parent = span.parentNode
    if (!parent) return
    while (span.firstChild) parent.insertBefore(span.firstChild, span)
    parent.removeChild(span)
    parent.normalize()
  })
}

export function recolorHighlight(doc: Document, id: string, newColorId: string): void {
  const spans = doc.querySelectorAll(highlightSelector(id))
  spans.forEach((span) => {
    const kept = Array.from(span.classList).filter((c) => !c.startsWith('highlight-'))
    kept.push(`highlight-${newColorId}`)
    span.className = kept.join(' ')
  })
}

const XML_DECLARATION_RE = /^\s*<\?xml[^>]*\?>\s*/i
/**
 * HTML parsing mode (see parserTypeFor below) doesn't understand XML
 * processing instructions and turns a leading `<?xml ... ?>` into a "bogus
 * comment" node (`<!--?xml ... ?-->`) instead of discarding it. Left in
 * place, that comment round-trips through every future edit and a fresh one
 * gets added each time, so a handful of highlight edits leaves a file with a
 * pile of duplicate declarations stacked before the doctype. Stripped here
 * so it never enters the DOM, and matched again below to clean out any that
 * already made it into a previously-saved file.
 */
const BOGUS_XML_COMMENT_RE = /<!--\?xml[^>]*\?-->\s*/gi

/**
 * epub.js itself parses spine content documents in either strict XML or
 * lenient HTML mode depending on file extension (see its Archive.request /
 * handleResponse). CFIs it generates are step-paths into whichever DOM that
 * parse produced, so *resolving* a CFI must mirror the same parser choice or
 * it can point at the wrong node.
 *
 * BUT that lenient HTML parse is not safe to write back to disk. Content
 * documents are XHTML, which allows self-closing non-void elements like
 * `<a id="x"/>`. HTML5 parsing doesn't treat that as self-closing for a
 * non-void element — it leaves the tag open, and if the parser later needs
 * to un-nest it (e.g. a block element appears where only inline content is
 * allowed inside an open `<a>`), the "adoption agency" algorithm splits it
 * into two elements that both carry the original id. epub.js's own
 * rendering throws that duplicated tree away after painting it, so it never
 * notices. We don't have that luxury — whatever tree we serialize IS the
 * saved file, permanently, and duplicate ids compound with every edit.
 *
 * So: resolve the CFI against the html-mode parse (to correctly locate the
 * highlighted text), but perform the actual edit — and everything we
 * persist — against a strict, spec-correct XHTML reparse instead.
 */
function parserTypeFor(path: string): DOMParserSupportedType {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'xhtml') return 'application/xhtml+xml'
  if (ext === 'xml' || ext === 'opf' || ext === 'ncx') return 'text/xml'
  return 'text/html'
}

async function readRaw(
  zip: JSZip,
  path: string,
): Promise<{ text: string; xmlDeclaration: string } | null> {
  const entry = zip.file(path)
  if (!entry) return null
  const raw = await entry.async('string')
  const match = raw.match(XML_DECLARATION_RE)
  const xmlDeclaration = match ? match[0].trim() : ''
  const text = (match ? raw.slice(match[0].length) : raw).replace(BOGUS_XML_COMMENT_RE, '')
  return { text, xmlDeclaration }
}

/** Parsed the same way epub.js parses this file for rendering — use only to
 * resolve a CFI into a location, never to produce bytes we write back. */
async function readXhtmlForCfi(
  zip: JSZip,
  path: string,
): Promise<{ doc: Document; xmlDeclaration: string } | null> {
  const raw = await readRaw(zip, path)
  if (!raw) return null
  const doc = new DOMParser().parseFromString(raw.text, parserTypeFor(path))
  if (doc.querySelector('parsererror')) return null
  return { doc, xmlDeclaration: raw.xmlDeclaration }
}

/** Always strict XHTML, regardless of file extension — content documents
 * are XHTML by spec no matter what a publisher named the file. This is what
 * every edit actually mutates and what gets written back to the zip. */
async function readXhtmlStrict(
  zip: JSZip,
  path: string,
): Promise<{ doc: Document; xmlDeclaration: string } | null> {
  const raw = await readRaw(zip, path)
  if (!raw) return null
  const doc = new DOMParser().parseFromString(raw.text, 'application/xhtml+xml')
  if (doc.querySelector('parsererror')) return null
  return { doc, xmlDeclaration: raw.xmlDeclaration }
}

/** Character offset of a range boundary, counted across all text nodes
 * under `root` in document order. Structure-independent: as long as two
 * parses of the same source produce the same overall text content (true for
 * the html-mode/strict-mode split above — the parsing quirk it works around
 * only duplicates elements, never text), an offset computed against one
 * parse locates the same text in the other. */
function textOffsetOf(root: Node, container: Node, offset: number): number {
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let node = walker.nextNode()
  while (node) {
    if (node === container) return total + offset
    total += node.textContent?.length ?? 0
    node = walker.nextNode()
  }
  return total
}

/** Inverse of textOffsetOf: builds a Range spanning [startOffset, endOffset)
 * of `root`'s concatenated text content. Returns null if the document
 * doesn't have enough text to cover the span. */
function rangeAtTextOffset(root: Node, startOffset: number, endOffset: number): Range | null {
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let startContainer: Text | null = null
  let startLocalOffset = 0
  let endContainer: Text | null = null
  let endLocalOffset = 0
  let node = walker.nextNode()
  while (node && (!startContainer || !endContainer)) {
    const len = node.textContent?.length ?? 0
    if (!startContainer && total + len >= startOffset) {
      startContainer = node as Text
      startLocalOffset = startOffset - total
    }
    if (!endContainer && total + len >= endOffset) {
      endContainer = node as Text
      endLocalOffset = endOffset - total
    }
    total += len
    node = walker.nextNode()
  }
  if (!startContainer || !endContainer) return null
  const range = doc.createRange()
  range.setStart(startContainer, startLocalOffset)
  range.setEnd(endContainer, endLocalOffset)
  return range
}

function serializeXhtml(doc: Document, xmlDeclaration: string): string {
  const serialized = new XMLSerializer().serializeToString(doc)
  return xmlDeclaration ? `${xmlDeclaration}\n${serialized}` : serialized
}

/**
 * Cleans up files saved before the bogus-XML-comment fix above: strips any
 * `<!--?xml ... ?-->` leftovers by re-running the file through the (now
 * fixed) read/serialize round-trip. Returns true if anything was rewritten,
 * so the caller knows whether the zip needs re-persisting. Uses the strict
 * parse — this only ever touches the persisted copy, never CFI resolution.
 */
export async function healZipXhtml(zip: JSZip, hrefs: string[]): Promise<boolean> {
  let healed = false
  for (const href of hrefs) {
    const entry = zip.file(href)
    if (!entry) continue
    const raw = await entry.async('string')
    BOGUS_XML_COMMENT_RE.lastIndex = 0
    if (!BOGUS_XML_COMMENT_RE.test(raw)) continue
    const parsed = await readXhtmlStrict(zip, href)
    if (!parsed) continue
    zip.file(href, serializeXhtml(parsed.doc, parsed.xmlDeclaration))
    healed = true
  }
  return healed
}

export async function addHighlightToZip(
  zip: JSZip,
  href: string,
  cfiRange: string,
  color: HighlightColor,
  id: string = createHighlightId(),
): Promise<EpubHighlight | null> {
  // Resolve the CFI against the same parse epub.js used to generate it...
  const cfiParsed = await readXhtmlForCfi(zip, href)
  if (!cfiParsed) return null
  let cfiRangeResolved: Range
  try {
    cfiRangeResolved = new EpubCFI(cfiRange).toRange(cfiParsed.doc)
  } catch {
    return null
  }
  const text = cfiRangeResolved.toString()
  if (!text.trim()) return null
  const startOffset = textOffsetOf(
    cfiParsed.doc.body ?? cfiParsed.doc.documentElement,
    cfiRangeResolved.startContainer,
    cfiRangeResolved.startOffset,
  )

  // ...but only ever edit and persist a strict, spec-correct reparse. The
  // CFI-mode parse above may have a structurally different (even duplicated)
  // tree if this file uses XML self-closing syntax on non-void elements —
  // see the comment on parserTypeFor. Locating by text offset sidesteps
  // that: it doesn't care which tree produced the number.
  const parsed = await readXhtmlStrict(zip, href)
  if (!parsed) return null
  const strictRoot = parsed.doc.body ?? parsed.doc.documentElement
  const range = rangeAtTextOffset(strictRoot, startOffset, startOffset + text.length)
  if (!range || range.toString() !== text) return null

  wrapRangeWithHighlight(parsed.doc, range, id, color.id)
  zip.file(href, serializeXhtml(parsed.doc, parsed.xmlDeclaration))

  return { id, href, color, text: snippetFor(text) }
}

export async function removeHighlightFromZip(
  zip: JSZip,
  highlight: EpubHighlight,
): Promise<void> {
  const parsed = await readXhtmlStrict(zip, highlight.href)
  if (!parsed) return
  const { doc, xmlDeclaration } = parsed
  unwrapHighlight(doc, highlight.id)
  zip.file(highlight.href, serializeXhtml(doc, xmlDeclaration))
}

export async function recolorHighlightInZip(
  zip: JSZip,
  highlight: EpubHighlight,
  newColor: HighlightColor,
): Promise<EpubHighlight> {
  const parsed = await readXhtmlStrict(zip, highlight.href)
  if (!parsed) return highlight
  const { doc, xmlDeclaration } = parsed
  recolorHighlight(doc, highlight.id, newColor.id)
  zip.file(highlight.href, serializeXhtml(doc, xmlDeclaration))
  return { ...highlight, color: newColor }
}

export async function readHighlightsFromZip(
  zip: JSZip,
  hrefs: string[],
): Promise<EpubHighlight[]> {
  const highlights: EpubHighlight[] = []

  for (const href of hrefs) {
    const parsed = await readXhtmlStrict(zip, href)
    if (!parsed) continue
    const { doc } = parsed

    const seen = new Set<string>()
    const spans = doc.querySelectorAll(`.${HIGHLIGHT_CLASS}`)
    spans.forEach((span) => {
      const id = Array.from(span.classList).find((c) => c.startsWith('hl-'))
      if (!id || seen.has(id)) return
      seen.add(id)

      const colorClass = Array.from(span.classList).find((c) => c.startsWith('highlight-'))
      const colorId = colorClass?.slice('highlight-'.length)
      const color = HIGHLIGHT_COLORS.find((c) => c.id === colorId) ?? HIGHLIGHT_COLORS[0]

      const groupText = Array.from(doc.querySelectorAll(highlightSelector(id)))
        .map((el) => el.textContent ?? '')
        .join(' ')

      highlights.push({ id, href, color, text: snippetFor(groupText) })
    })
  }

  return highlights
}
