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
} from '../../lib/fileSystemAccess'
import {
  addHighlightToDoc,
  findHighlightsOverlappingQuads,
  readHighlightsFromDoc,
  recolorHighlightInDoc,
  removeHighlightFromDoc,
  type Highlight,
  type HighlightColor,
  type Quad,
} from '../../lib/pdfHighlights'
import { updateBookFile, updateBookProgress, type BookRecord } from '../../lib/storage'
import { clientRectToQuad } from './geometry'
import HighlightPopover from './HighlightPopover'
import HighlightsPanel from './HighlightsPanel'
import PdfPage from './PdfPage'
import { PDFJS_DOCUMENT_PARAMS } from './pdfjsSetup'
import ReaderToolbar, { type FileSyncStatus } from './ReaderToolbar'
import SelectionToolbar from './SelectionToolbar'

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const ZOOM_STEP = 0.25
const RENDER_MARGIN = '600px 0px 600px 0px'
const EMPTY_HIGHLIGHTS: Highlight[] = []

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
  const [sizeOverrides, setSizeOverrides] = useState<Map<number, PageSize>>(new Map())
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

  const pdfLibDocRef = useRef<PDFDocument | null>(null)
  const pdfBytesRef = useRef<Uint8Array | null>(null)
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
        pdfBytesRef.current = libBytes
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
        if (!cancelled) setBasePageSize({ width: vp.width, height: vp.height })
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
      if (!book.fileHandle) {
        setFileSyncStatus('unsupported')
        return
      }
      const state = await queryWritePermission(book.fileHandle)
      if (!cancelled) setFileSyncStatus(state === 'granted' ? 'granted' : 'needs-permission')
    }
    checkPermission()
    return () => {
      cancelled = true
    }
  }, [book.fileHandle])

  async function handleGrantFileAccess() {
    if (!book.fileHandle) return
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
      { root, rootMargin: RENDER_MARGIN },
    )
    observerRef.current = observer
    for (const el of wrapperElsRef.current.values()) observer.observe(el)

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
    // scrollRef only becomes non-null once basePageSize is also set (that's
    // what gates rendering the scroll container instead of the loading
    // state), so this must re-run when either becomes available.
  }, [numPages, basePageSize])

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

  const handleMeasured = useCallback((pageIndex: number, size: PageSize) => {
    setSizeOverrides((prev) => {
      const existing = prev.get(pageIndex)
      if (
        existing &&
        Math.abs(existing.width - size.width) < 0.5 &&
        Math.abs(existing.height - size.height) < 0.5
      ) {
        return prev
      }
      const next = new Map(prev)
      next.set(pageIndex, size)
      return next
    })
  }, [])

  const handleViewportReady = useCallback((pageIndex: number, viewport: PageViewport | null) => {
    if (viewport) viewportsRef.current.set(pageIndex, viewport)
    else viewportsRef.current.delete(pageIndex)
  }, [])

  function sizeFor(pageIndex: number): PageSize {
    return sizeOverrides.get(pageIndex) ?? basePageSize ?? { width: 600, height: 800 }
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

  async function persist(nextHighlights: Highlight[]) {
    const doc = pdfLibDocRef.current
    if (!doc) return

    // Every highlight action is itself a click — a valid user gesture — so we
    // get a chance to (re-)request write permission right here, rather than
    // depending on the user having noticed and clicked a separate "Enable
    // file saving" button first. Doing this before doc.save() keeps it as
    // close to the originating click as possible, since some browsers only
    // honor requestPermission() within a short window of active gesture.
    let canWriteToFile = false
    if (book.fileHandle) {
      try {
        let permission = await queryWritePermission(book.fileHandle)
        if (permission !== 'granted') {
          permission = await requestWritePermission(book.fileHandle)
        }
        canWriteToFile = permission === 'granted'
        setFileSyncStatus(canWriteToFile ? 'granted' : 'needs-permission')
      } catch (err) {
        console.error('Could not get write permission for the original file', err)
        setFileSyncStatus('error')
      }
    }

    const bytes = await doc.save()
    pdfBytesRef.current = bytes
    const blob = new Blob([bytes.slice()], { type: 'application/pdf' })
    await updateBookFile(book.id, blob, nextHighlights.length)

    if (book.fileHandle && canWriteToFile) {
      try {
        await writeBytesToHandle(book.fileHandle, bytes)
      } catch (err) {
        console.error('Failed to save highlight directly to the original file', err)
        setFileSyncStatus('error')
      }
    }
  }

  async function handlePickColor(color: HighlightColor) {
    const info = selectionInfo
    const doc = pdfLibDocRef.current
    setSelectionInfo(null)
    window.getSelection()?.removeAllRanges()
    if (!info || !doc) return

    if (color.isEraser) {
      // Erase any highlights under the selection; nothing to do if there aren't any.
      const toRemove = findHighlightsOverlappingQuads(highlights, info.pageIndex, info.quads)
      if (toRemove.length === 0) return
      for (const h of toRemove) removeHighlightFromDoc(doc, h)
      const removedIds = new Set(toRemove.map((h) => h.id))
      const next = highlights.filter((h) => !removedIds.has(h.id))
      setHighlights(next)
      await persist(next)
      return
    }

    const added = addHighlightToDoc(doc, info.pageIndex, info.quads, color)
    if (!added) return
    const next = [...highlights, added]
    setHighlights(next)
    await persist(next)
  }

  async function handleDeleteHighlight() {
    const doc = pdfLibDocRef.current
    const target = highlights.find((h) => h.id === activePopover?.id)
    setActivePopover(null)
    if (!doc || !target) return

    removeHighlightFromDoc(doc, target)
    const next = highlights.filter((h) => h.id !== target.id)
    setHighlights(next)
    await persist(next)
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

    const updated = recolorHighlightInDoc(doc, target, color)
    const next = highlights.filter((h) => h.id !== target.id)
    if (updated) next.push(updated)
    setHighlights(next)
    await persist(next)
  }

  function handleDownload() {
    const bytes = pdfBytesRef.current
    if (!bytes) return
    const blob = new Blob([bytes.slice()], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${book.title}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
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

  if (!pdfDoc || !basePageSize) {
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
        onDownload={handleDownload}
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
            onMeasured={handleMeasured}
            onViewportReady={handleViewportReady}
            onHighlightClick={(id, x, y) => setActivePopover({ id, x, y })}
          />
        ))}
      </div>

      {selectionInfo && (
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
