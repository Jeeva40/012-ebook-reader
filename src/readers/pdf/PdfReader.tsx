import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getDocument,
  type PageViewport,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import {
  queryWritePermission,
  requestWritePermission,
  writeBytesToHandle,
  type FileSyncStatus,
} from '../../lib/fileSystemAccess'
import type { HighlightColor } from '../../lib/highlightColors'
import {
  addHighlightToDoc,
  findHighlightsOverlappingQuads,
  readHighlightsFromDoc,
  recolorHighlightInDoc,
  removeHighlightFromDoc,
  type Highlight,
  type Quad,
} from '../../lib/pdfHighlights'
import { updateBookFile, updateBookProgress, type BookRecord } from '../../lib/storage'
import GrantAccessPrompt from '../shared/GrantAccessPrompt'
import HighlightPopover from '../shared/HighlightPopover'
import SelectionToolbar from '../shared/SelectionToolbar'
import { clientRectToQuad } from './geometry'
import HighlightsPanel from './HighlightsPanel'
import PdfPage from './PdfPage'
import { PDFJS_DOCUMENT_PARAMS } from './pdfjsSetup'
import ReaderToolbar from './ReaderToolbar'

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const ZOOM_STEP = 0.25
const EMPTY_HIGHLIGHTS: Highlight[] = []
const MEASURE_BATCH_SIZE = 24
// How far outside the viewport a page starts rendering, as a multiple of
// viewport height. Needs to comfortably exceed how far a page can scroll in
// the time it takes pdf.js to render one (including touch-momentum flicks,
// which cover much more distance per frame than mouse-wheel scrolling) —
// otherwise a page enters view mid-render and the user sees it blank.
const RENDER_MARGIN_VH_MULTIPLIER = 1.5

function computeRenderMargin(): string {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const margin = Math.round(vh * RENDER_MARGIN_VH_MULTIPLIER)
  return `${margin}px 0px ${margin}px 0px`
}

/**
 * Every page's exact (unscaled) size, fetched up front. pdf.js can report a
 * page's viewport straight from its /MediaBox without decoding or rendering
 * it, so this is cheap even for large PDFs — and it means placeholders can
 * reserve each page's *real* final height from their very first paint,
 * instead of guessing (e.g. assuming every page matches page 1, which is
 * wrong for any PDF with mixed page sizes and was the root cause of pages
 * mounting and shifting everything below them). Batches with a yield in
 * between so measuring a huge PDF doesn't block the main thread.
 */
async function measurePageSizes(
  pdf: PDFDocumentProxy,
  isCancelled: () => boolean,
): Promise<PageSize[]> {
  const sizes: PageSize[] = new Array(pdf.numPages)
  for (let start = 0; start < pdf.numPages; start += MEASURE_BATCH_SIZE) {
    if (isCancelled()) return sizes
    const end = Math.min(start + MEASURE_BATCH_SIZE, pdf.numPages)
    // allSettled, not all: one corrupted page dictionary shouldn't take the
    // whole book down with it. sizeFor() already falls back to basePageSize
    // for any index this leaves empty.
    const results = await Promise.allSettled(
      Array.from({ length: end - start }, (_, i) => pdf.getPage(start + i + 1)),
    )
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'fulfilled') {
        const vp = result.value.getViewport({ scale: 1 })
        sizes[start + i] = { width: vp.width, height: vp.height }
      } else {
        console.error(`Failed to measure PDF page ${start + i + 1}`, result.reason)
      }
    }
    if (end < pdf.numPages) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return sizes
}

interface PageSize {
  width: number
  height: number
}

interface SelectionInfo {
  pageIndex: number
  quads: Quad[]
  anchorRect: DOMRect
}

interface PopoverInfo {
  id: string
  x: number
  y: number
}

export default function PdfReader({ book }: { book: BookRecord }) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [basePageSize, setBasePageSize] = useState<PageSize | null>(null)
  const [pageSizes, setPageSizes] = useState<PageSize[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [scale, setScale] = useState(1.25)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null)
  const [activePopover, setActivePopover] = useState<PopoverInfo | null>(null)
  const [highlightsPanelOpen, setHighlightsPanelOpen] = useState(false)

  const [toolbarVisible, setToolbarVisible] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set([0]))
  const [fileSyncStatus, setFileSyncStatus] = useState<FileSyncStatus>(null)
  const [renderMargin, setRenderMargin] = useState(computeRenderMargin)

  const pdfLibDocRef = useRef<PDFDocument | null>(null)
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const viewportsRef = useRef<Map<number, PageViewport>>(new Map())
  const wrapperElsRef = useRef<Map<number, HTMLDivElement>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastScrollTopRef = useRef(0)
  const tickingRef = useRef(false)
  const progressTimeoutRef = useRef<number>(undefined)
  const restoredRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError(null)
      try {
        const libBytes = new Uint8Array(await book.file.arrayBuffer())
        const pdfLibDoc = await PDFDocument.load(libBytes, { updateMetadata: false })
        if (cancelled) return
        pdfLibDocRef.current = pdfLibDoc
        setHighlights(readHighlightsFromDoc(pdfLibDoc))

        const jsBytes = new Uint8Array(await book.file.arrayBuffer())
        const loadingTask = getDocument({ data: jsBytes, ...PDFJS_DOCUMENT_PARAMS })
        loadingTaskRef.current = loadingTask
        const pdf = await loadingTask.promise
        if (cancelled) {
          loadingTask.destroy()
          return
        }
        setPdfDoc(pdf)
        setNumPages(pdf.numPages)

        const firstPage = await pdf.getPage(1)
        const vp = firstPage.getViewport({ scale: 1 })
        if (cancelled) return
        setBasePageSize({ width: vp.width, height: vp.height })

        const sizes = await measurePageSizes(pdf, () => cancelled)
        if (!cancelled) setPageSizes(sizes)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF')
        }
      }
    }

    load()

    return () => {
      cancelled = true
      loadingTaskRef.current?.destroy()
    }
  }, [book.id, book.file])

  useEffect(() => {
    let cancelled = false
    async function checkPermission() {
      const state = await queryWritePermission(book.fileHandle)
      if (!cancelled) setFileSyncStatus(state === 'granted' ? 'granted' : 'needs-permission')
    }
    checkPermission()
    return () => {
      cancelled = true
    }
  }, [book.fileHandle])

  // Viewport height drives the render margin (see computeRenderMargin), so
  // keep it current across resizes and orientation changes rather than
  // freezing whatever it was when the reader first mounted.
  useEffect(() => {
    function onResize() {
      setRenderMargin(computeRenderMargin())
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  async function handleGrantFileAccess() {
    try {
      const state = await requestWritePermission(book.fileHandle)
      setFileSyncStatus(state === 'granted' ? 'granted' : 'needs-permission')
    } catch {
      setFileSyncStatus('needs-permission')
    }
  }

  const registerWrapper = useCallback((pageIndex: number, el: HTMLDivElement | null) => {
    const observer = observerRef.current
    const prev = wrapperElsRef.current.get(pageIndex)
    if (prev && observer) observer.unobserve(prev)
    if (el) {
      el.dataset.pageIndex = String(pageIndex)
      wrapperElsRef.current.set(pageIndex, el)
      observer?.observe(el)
    } else {
      wrapperElsRef.current.delete(pageIndex)
    }
  }, [])

  useEffect(() => {
    const root = scrollRef.current
    if (!root || numPages === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          let changed = false
          const next = new Set(prev)
          for (const entry of entries) {
            const idx = Number((entry.target as HTMLElement).dataset.pageIndex)
            if (entry.isIntersecting) {
              if (!next.has(idx)) {
                next.add(idx)
                changed = true
              }
            } else if (next.has(idx)) {
              next.delete(idx)
              changed = true
            }
          }
          return changed ? next : prev
        })
      },
      { root, rootMargin: renderMargin },
    )
    observerRef.current = observer
    for (const el of wrapperElsRef.current.values()) observer.observe(el)

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
    // scrollRef only becomes non-null once basePageSize is also set (that's
    // what gates rendering the scroll container instead of the loading
    // state), so this must re-run when either becomes available. Also
    // re-runs when the render margin changes (viewport resize/rotation) so
    // the buffer stays proportional to the current screen height.
  }, [numPages, basePageSize, renderMargin])

  useEffect(() => {
    if (restoredRef.current) return
    if (!basePageSize || numPages === 0) return
    restoredRef.current = true
    const saved = book.lastReadPosition ? Number.parseInt(book.lastReadPosition, 10) : null
    if (saved && saved > 1 && saved <= numPages) {
      requestAnimationFrame(() => {
        wrapperElsRef.current.get(saved - 1)?.scrollIntoView({ block: 'start' })
      })
    }
  }, [basePageSize, numPages, book.lastReadPosition])

  const handleViewportReady = useCallback((pageIndex: number, viewport: PageViewport | null) => {
    if (viewport) viewportsRef.current.set(pageIndex, viewport)
    else viewportsRef.current.delete(pageIndex)
  }, [])

  // pageSizes is fully populated before the reader ever renders (see the
  // load effect and the loading gate below), so every placeholder gets its
  // exact final size from the start — never an estimate that later changes.
  function sizeFor(pageIndex: number): PageSize {
    return pageSizes?.[pageIndex] ?? basePageSize ?? { width: 600, height: 800 }
  }

  function computeCurrentPage(): number {
    const root = scrollRef.current
    if (!root) return 1
    const rootRect = root.getBoundingClientRect()
    const target = rootRect.top + 80
    let best = currentPage
    let bestDist = Infinity
    for (const [idx, el] of wrapperElsRef.current) {
      const r = el.getBoundingClientRect()
      if (r.bottom < rootRect.top || r.top > rootRect.bottom) continue
      const dist = Math.abs(r.top - target)
      if (dist < bestDist) {
        bestDist = dist
        best = idx + 1
      }
    }
    return best
  }

  function handleScroll() {
    if (tickingRef.current) return
    tickingRef.current = true
    requestAnimationFrame(() => {
      tickingRef.current = false
      const root = scrollRef.current
      if (!root) return
      const st = root.scrollTop
      const delta = st - lastScrollTopRef.current
      if (st < 40) setToolbarVisible(true)
      else if (delta > 8) setToolbarVisible(false)
      else if (delta < -8) setToolbarVisible(true)
      lastScrollTopRef.current = st

      const page = computeCurrentPage()
      setCurrentPage(page)

      window.clearTimeout(progressTimeoutRef.current)
      progressTimeoutRef.current = window.setTimeout(() => {
        if (numPages > 0) {
          updateBookProgress(book.id, {
            progress: page / numPages,
            lastReadPosition: String(page),
          })
        }
      }, 600)
    })
  }

  useEffect(() => {
    function evaluateSelection() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelectionInfo(null)
        return
      }
      const range = sel.getRangeAt(0)
      const node = range.commonAncestorContainer
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
      const pageEl = el?.closest<HTMLElement>('[data-page-index]')
      if (!pageEl) {
        setSelectionInfo(null)
        return
      }
      const pageIndex = Number(pageEl.dataset.pageIndex)
      const viewport = viewportsRef.current.get(pageIndex)
      if (!viewport) {
        setSelectionInfo(null)
        return
      }
      const containerRect = pageEl.getBoundingClientRect()
      const rects = Array.from(range.getClientRects())
      const quads = rects
        .map((r) => clientRectToQuad(r, containerRect, viewport))
        .filter((q) => q.width > 0.5 && q.height > 0.5)
      if (quads.length === 0) {
        setSelectionInfo(null)
        return
      }
      setSelectionInfo({ pageIndex, quads, anchorRect: range.getBoundingClientRect() })
    }

    document.addEventListener('mouseup', evaluateSelection)
    document.addEventListener('keyup', evaluateSelection)
    return () => {
      document.removeEventListener('mouseup', evaluateSelection)
      document.removeEventListener('keyup', evaluateSelection)
    }
  }, [])

  /**
   * Queries (and if needed, requests) write permission for the original
   * file. Browsers only honor requestPermission() within a short window of
   * active user gesture, so this must run as the very first await in each
   * click handler below, before any other async work.
   *
   * This only ever reports failure states ('needs-permission' / 'error').
   * It must NOT set 'granted', because the badge renders 'granted' as "Saved
   * to file" — and at this point nothing has been written yet, just
   * confirmed writable. Claiming "saved" here is exactly the bug where the
   * badge goes green before (or even without) an actual disk write.
   */
  async function ensureWritePermissionForGesture(): Promise<boolean> {
    try {
      let permission = await queryWritePermission(book.fileHandle)
      if (permission !== 'granted') {
        permission = await requestWritePermission(book.fileHandle)
      }
      const granted = permission === 'granted'
      if (!granted) setFileSyncStatus('needs-permission')
      return granted
    } catch (err) {
      console.error('Could not get write permission for the original file', err)
      setFileSyncStatus('error')
      return false
    }
  }

  // Serializes writes to the original file: if two highlight actions fire in
  // quick succession, a second createWritable() before the first one's
  // close() has resolved can race against it, and whichever close() lands
  // last silently wins — potentially with stale bytes. Chaining onto this
  // queue guarantees each write's close() fully resolves before the next
  // write starts.
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve())

  async function persist(nextHighlights: Highlight[], canWriteToFile: boolean) {
    const doc = pdfLibDocRef.current
    if (!doc) return

    const bytes = await doc.save()
    const blob = new Blob([bytes.slice()], { type: 'application/pdf' })
    await updateBookFile(book.id, blob, nextHighlights.length)

    if (!canWriteToFile) return

    const writeAttempt = writeQueueRef.current.then(() =>
      writeBytesToHandle(book.fileHandle, bytes),
    )
    // Keep the queue alive even after a failed write, so the next highlight
    // action still waits its turn instead of racing the failed one.
    writeQueueRef.current = writeAttempt.then(
      () => undefined,
      () => undefined,
    )

    try {
      await writeAttempt
      // Only now — after close() has actually resolved — is the file on
      // disk guaranteed to reflect these bytes, so only now is it correct
      // to tell the user it's saved.
      setFileSyncStatus('granted')
    } catch (err) {
      console.error('Failed to save highlight directly to the original file', err)
      setFileSyncStatus('error')
    }
  }

  async function handlePickColor(color: HighlightColor) {
    const info = selectionInfo
    const doc = pdfLibDocRef.current
    setSelectionInfo(null)
    window.getSelection()?.removeAllRanges()
    if (!info || !doc) return

    const canWriteToFile = await ensureWritePermissionForGesture()

    if (color.isEraser) {
      // Erase any highlights under the selection; nothing to do if there aren't any.
      const toRemove = findHighlightsOverlappingQuads(highlights, info.pageIndex, info.quads)
      if (toRemove.length === 0) return
      for (const h of toRemove) removeHighlightFromDoc(doc, h)
      const removedIds = new Set(toRemove.map((h) => h.id))
      const next = highlights.filter((h) => !removedIds.has(h.id))
      setHighlights(next)
      await persist(next, canWriteToFile)
      return
    }

    const added = addHighlightToDoc(doc, info.pageIndex, info.quads, color)
    if (!added) return
    const next = [...highlights, added]
    setHighlights(next)
    await persist(next, canWriteToFile)
  }

  async function handleDeleteHighlight() {
    const doc = pdfLibDocRef.current
    const target = highlights.find((h) => h.id === activePopover?.id)
    setActivePopover(null)
    if (!doc || !target) return

    const canWriteToFile = await ensureWritePermissionForGesture()

    removeHighlightFromDoc(doc, target)
    const next = highlights.filter((h) => h.id !== target.id)
    setHighlights(next)
    await persist(next, canWriteToFile)
  }

  async function handleRecolorHighlight(color: HighlightColor) {
    if (color.isEraser) {
      await handleDeleteHighlight()
      return
    }
    const doc = pdfLibDocRef.current
    const target = highlights.find((h) => h.id === activePopover?.id)
    setActivePopover(null)
    if (!doc || !target) return

    const canWriteToFile = await ensureWritePermissionForGesture()

    const updated = recolorHighlightInDoc(doc, target, color)
    const next = highlights.filter((h) => h.id !== target.id)
    if (updated) next.push(updated)
    setHighlights(next)
    await persist(next, canWriteToFile)
  }

  function jumpToPage(pageIndex: number) {
    wrapperElsRef.current.get(pageIndex)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setHighlightsPanelOpen(false)
  }

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Highlight[]>()
    for (const h of highlights) {
      const arr = map.get(h.pageIndex) ?? []
      arr.push(h)
      map.set(h.pageIndex, arr)
    }
    return map
  }, [highlights])

  if (error) {
    return (
      <div className="flex h-[calc(100dvh-56px)] flex-col items-center justify-center gap-2 bg-gray-50 text-center">
        <p className="text-sm font-medium text-gray-900">Couldn't open this PDF</p>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    )
  }

  if (!pdfDoc || !basePageSize || !pageSizes) {
    return (
      <div className="flex h-[calc(100dvh-56px)] items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="relative h-[calc(100dvh-56px)] overflow-hidden bg-gray-100">
      <ReaderToolbar
        title={book.title}
        currentPage={currentPage}
        numPages={numPages}
        scale={scale}
        visible={toolbarVisible || Boolean(selectionInfo) || Boolean(activePopover)}
        highlightsPanelOpen={highlightsPanelOpen}
        fileSyncStatus={fileSyncStatus}
        onZoomIn={() => setScale((s) => Math.min(MAX_SCALE, +(s + ZOOM_STEP).toFixed(2)))}
        onZoomOut={() => setScale((s) => Math.max(MIN_SCALE, +(s - ZOOM_STEP).toFixed(2)))}
        onToggleHighlights={() => setHighlightsPanelOpen((v) => !v)}
        onGrantFileAccess={handleGrantFileAccess}
      />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 pt-16 pb-8 sm:px-6"
      >
        {Array.from({ length: numPages }, (_, i) => (
          <PdfPage
            key={i}
            pageIndex={i}
            pdfDoc={pdfDoc}
            scale={scale}
            size={sizeFor(i)}
            isActive={visiblePages.has(i)}
            highlights={highlightsByPage.get(i) ?? EMPTY_HIGHLIGHTS}
            registerWrapper={registerWrapper}
            onViewportReady={handleViewportReady}
            onHighlightClick={(id, x, y) => setActivePopover({ id, x, y })}
          />
        ))}
      </div>

      {selectionInfo && fileSyncStatus === 'needs-permission' && (
        <GrantAccessPrompt
          anchorRect={selectionInfo.anchorRect}
          onGrant={handleGrantFileAccess}
        />
      )}

      {selectionInfo && fileSyncStatus !== 'needs-permission' && (
        <SelectionToolbar anchorRect={selectionInfo.anchorRect} onPick={handlePickColor} />
      )}

      {activePopover && (
        <HighlightPopover
          x={activePopover.x}
          y={activePopover.y}
          onDelete={handleDeleteHighlight}
          onRecolor={handleRecolorHighlight}
          onClose={() => setActivePopover(null)}
        />
      )}

      <HighlightsPanel
        open={highlightsPanelOpen}
        highlights={highlights}
        onClose={() => setHighlightsPanelOpen(false)}
        onJump={jumpToPage}
      />
    </div>
  )
}
