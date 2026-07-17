import { useEffect, useMemo, useRef, useState } from 'react'
import { Book, type Contents, type NavItem, type Rendition } from 'epubjs'
import JSZip from 'jszip'
import {
  queryWritePermission,
  requestWritePermission,
  writeBytesToHandle,
  type FileSyncStatus,
} from '../../lib/fileSystemAccess'
import type { HighlightColor } from '../../lib/highlightColors'
import {
  addHighlightToZip,
  createHighlightId,
  ensureMimetypeStored,
  healZipXhtml,
  readHighlightsFromZip,
  recolorHighlight,
  recolorHighlightInZip,
  removeHighlightFromZip,
  unwrapHighlight,
  wrapRangeWithHighlight,
  type EpubHighlight,
} from '../../lib/epubHighlights'
import { updateBookFile, updateBookProgress, type BookRecord } from '../../lib/storage'
import GrantAccessPrompt from '../shared/GrantAccessPrompt'
import HighlightPopover from '../shared/HighlightPopover'
import SelectionOverlay, { type OverlayRect } from '../shared/SelectionOverlay'
import SelectionToolbar from '../shared/SelectionToolbar'
import EpubHighlightsPanel from './EpubHighlightsPanel'
import EpubReaderToolbar from './EpubReaderToolbar'
import TocSidebar, { type TocNavItem } from './TocSidebar'

const SWIPE_THRESHOLD = 40
const EDGE_ZONE = 0.15

/** epubjs's bundled .d.ts only declares the options its DefaultViewManager
 * understands; ContinuousViewManager accepts a couple more (offset,
 * offsetDelta) that it merges straight into its own settings at runtime
 * (see its constructor) but that aren't part of the typed RenditionOptions. */
type EpubRenderOptions = NonNullable<Parameters<Book['renderTo']>[1]> & {
  offset?: number
  offsetDelta?: number
}

interface SelectionInfo {
  cfiRange: string
  href: string
  anchorRect: DOMRect
  contentsDoc: Document
  rangeSnapshot: Range
  overlayRects: OverlayRect[]
}

interface PopoverInfo {
  id: string
  href: string
  x: number
  y: number
  contentsDoc: Document
}

function mapNav(items: NavItem[]): TocNavItem[] {
  return items.map((item) => ({
    id: item.id,
    href: item.href,
    label: item.label,
    subitems: item.subitems && item.subitems.length > 0 ? mapNav(item.subitems) : undefined,
  }))
}

function flattenToc(items: TocNavItem[]): TocNavItem[] {
  return items.flatMap((item) => [item, ...(item.subitems ? flattenToc(item.subitems) : [])])
}

function hrefForSection(section: { url: string }): string {
  return decodeURIComponent(section.url.substring(1))
}

function allSpineHrefs(epubBook: Book): string[] {
  const hrefs: string[] = []
  epubBook.spine.each((section: { url: string }) => {
    hrefs.push(hrefForSection(section))
  })
  return hrefs
}

export default function EpubReader({ book }: { book: BookRecord }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flow, setFlow] = useState<'paginated' | 'scrolled'>('scrolled')
  const [tocItems, setTocItems] = useState<TocNavItem[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  const [highlightsPanelOpen, setHighlightsPanelOpen] = useState(false)
  const [highlights, setHighlights] = useState<EpubHighlight[]>([])
  const [currentHref, setCurrentHref] = useState<string | null>(null)
  const [progressPercent, setProgressPercent] = useState<number | null>(null)
  const [toolbarVisible, setToolbarVisible] = useState(true)
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null)
  const [activePopover, setActivePopover] = useState<PopoverInfo | null>(null)
  const [fileSyncStatus, setFileSyncStatus] = useState<FileSyncStatus>(null)

  const viewerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const zipRef = useRef<JSZip | null>(null)
  const highlightsRef = useRef<EpubHighlight[]>([])
  const flowRef = useRef(flow)
  const progressTimeoutRef = useRef<number>(undefined)
  // Serializes every write to the original file (including the self-heal
  // write below): overlapping createWritable() calls on the same handle can
  // race, and whichever close() lands last silently wins — potentially with
  // stale bytes. Chaining onto this queue guarantees each write's close()
  // fully resolves before the next write starts.
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve())

  function wireRenditionEvents(rendition: Rendition, epubBook: Book) {
    rendition.themes.default({
      body: { 'line-height': '1.6 !important', padding: '0 4px !important' },
      p: { margin: '0 0 1em 0' },
    })

    // epub.js's own Contents class already debounces this event on
    // selectionchange (250ms, see onSelectionChange/triggerSelectedEvent in
    // node_modules/epubjs/src/contents.js) and only fires it for a
    // non-collapsed range, so no extra debounce is needed here — we can
    // capture and clear the selection directly once it arrives.
    rendition.on('selected', (cfiRange: string, contents: Contents) => {
      const sel = contents.window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      if (!range.toString().trim()) return

      const section = epubBook.spine.get(contents.sectionIndex)
      const href = hrefForSection(section)
      const iframe = contents.window.frameElement as HTMLIFrameElement | null
      const iframeRect = iframe?.getBoundingClientRect()
      const rangeRect = range.getBoundingClientRect()
      const anchorRect = iframeRect
        ? new DOMRect(
            rangeRect.left + iframeRect.left,
            rangeRect.top + iframeRect.top,
            rangeRect.width,
            rangeRect.height,
          )
        : rangeRect
      // getClientRects() (plural) are in the *iframe's* own coordinate
      // space, same as getBoundingClientRect() above, so they need the same
      // iframeRect offset to be positioned correctly in the top-level page.
      const overlayRects: OverlayRect[] = Array.from(range.getClientRects())
        .filter((r) => r.width > 0.5 && r.height > 0.5)
        .map((r) => ({
          left: r.left + (iframeRect?.left ?? 0),
          top: r.top + (iframeRect?.top ?? 0),
          width: r.width,
          height: r.height,
        }))

      setActivePopover(null)
      setSelectionInfo({
        cfiRange,
        href,
        anchorRect,
        contentsDoc: contents.document,
        rangeSnapshot: range.cloneRange(),
        overlayRects,
      })

      // Clear the live selection inside the iframe so mobile's native
      // Copy/Share/Select-all action bar (which can only attach to a live
      // Selection) disappears — SelectionOverlay above stands in for it
      // visually. triggerSelectedEvent only re-emits 'selected' for a
      // non-collapsed range, so this doesn't loop back into this handler.
      sel.removeAllRanges()
    })

    rendition.on('click', (event: MouseEvent, contents: Contents) => {
      const target = event.target as Element | null
      const highlightEl = target?.closest?.('.highlight') as HTMLElement | null
      const sel = contents.window.getSelection()
      const hasSelection = Boolean(sel && !sel.isCollapsed && sel.toString().trim())

      if (highlightEl && !hasSelection) {
        const id = Array.from(highlightEl.classList).find((c) => c.startsWith('hl-'))
        if (!id) return
        const section = epubBook.spine.get(contents.sectionIndex)
        const href = hrefForSection(section)
        const iframe = contents.window.frameElement as HTMLIFrameElement | null
        const iframeRect = iframe?.getBoundingClientRect()
        const rect = highlightEl.getBoundingClientRect()
        setSelectionInfo(null)
        setActivePopover({
          id,
          href,
          x: (iframeRect?.left ?? 0) + rect.left + rect.width / 2,
          y: (iframeRect?.top ?? 0) + rect.top,
          contentsDoc: contents.document,
        })
        return
      }

      if (hasSelection) return
      setActivePopover(null)
      // A plain tap while our custom selection toolbar is showing dismisses
      // it. We clear the real iframe Selection as soon as it's captured
      // (see the 'selected' handler above), so there's nothing left to
      // naturally collapse on tap — this has to be explicit. hasSelection
      // being false above already guarantees this isn't a click firing
      // mid-gesture on a selection we haven't captured yet.
      setSelectionInfo(null)

      if (flowRef.current === 'paginated') {
        const width = contents.window.innerWidth
        if (event.clientX < width * EDGE_ZONE) {
          rendition.prev()
          return
        }
        if (event.clientX > width * (1 - EDGE_ZONE)) {
          rendition.next()
          return
        }
      }

      setToolbarVisible((v) => !v)
    })

    rendition.on('keyup', (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') rendition.prev()
      else if (event.key === 'ArrowRight') rendition.next()
    })

    let touchStartX: number | null = null
    rendition.on('touchstart', (event: TouchEvent) => {
      touchStartX = event.changedTouches[0]?.clientX ?? null
    })
    rendition.on('touchend', (event: TouchEvent) => {
      if (flowRef.current !== 'paginated') {
        touchStartX = null
        return
      }
      if (touchStartX == null) return
      const endX = event.changedTouches[0]?.clientX ?? touchStartX
      const delta = endX - touchStartX
      touchStartX = null
      if (Math.abs(delta) < SWIPE_THRESHOLD) return
      if (delta > 0) rendition.prev()
      else rendition.next()
    })

    rendition.on(
      'relocated',
      (location: { start: { href: string; cfi: string; percentage: number } }) => {
        setCurrentHref(location.start.href)
        const pct =
          epubBook.locations.length() > 0
            ? Math.round(epubBook.locations.percentageFromCfi(location.start.cfi) * 100)
            : null
        setProgressPercent(pct)

        window.clearTimeout(progressTimeoutRef.current)
        progressTimeoutRef.current = window.setTimeout(() => {
          updateBookProgress(book.id, {
            lastReadPosition: location.start.cfi,
            progress: pct != null ? pct / 100 : null,
          })
        }, 600)
      },
    )
  }

  /** (Re)creates the Rendition for the given flow mode. Paginated and
   * scrolled modes need different view managers (default vs. continuous) to
   * get real cross-chapter continuous scrolling, and epub.js only lets you
   * pick a manager at construction time — so switching modes means tearing
   * down and rebuilding the rendition rather than just calling `.flow()`. */
  function mountRendition(mode: 'paginated' | 'scrolled'): Rendition | null {
    const epubBook = bookRef.current
    if (!epubBook || !viewerRef.current) return null

    renditionRef.current?.destroy()

    // How far past the visible viewport the continuous manager keeps
    // sections loaded — its analogue of PdfReader's IntersectionObserver
    // render margin. epub.js's own default (500px) is comfortably less than
    // one screen on most devices, so a fast scroll — especially a
    // touch-momentum flick, which covers far more distance per frame than
    // mouse-wheel scrolling — can outrun it, catching a section's iframe
    // before it's finished loading and settling. That's the moment the
    // visible "jump, then snap back" happens: epub.js's own scroll
    // compensation (ContinuousViewManager's counter()/erase()) is exact,
    // not an estimate, but it can only compensate for a resize *after* it's
    // already visible on screen. Giving it more runway means that happens
    // off-screen instead. Only meaningful for the continuous manager;
    // harmless (unused) for 'default'.
    const scrollBuffer = Math.round(
      (typeof window !== 'undefined' ? window.innerHeight : 800) * 1.5,
    )
    const renderOptions: EpubRenderOptions = {
      width: '100%',
      height: '100%',
      flow: mode === 'paginated' ? 'paginated' : 'scrolled',
      manager: mode === 'paginated' ? 'default' : 'continuous',
      spread: 'none',
      allowScriptedContent: false,
      offset: scrollBuffer,
      offsetDelta: Math.round(scrollBuffer / 2),
    }

    const rendition = epubBook.renderTo(viewerRef.current, renderOptions)
    renditionRef.current = rendition
    wireRenditionEvents(rendition, epubBook)
    return rendition
  }

  useEffect(() => {
    let cancelled = false
    setError(null)
    setReady(false)

    async function load() {
      try {
        const buffer = await book.file.arrayBuffer()
        // epubjs's Book constructor accepts an ArrayBuffer at runtime, but its
        // bundled .d.ts only declares the string/options overloads.
        const epubBook = new Book(buffer as unknown as string)
        const zip = await JSZip.loadAsync(buffer)
        await ensureMimetypeStored(zip)
        if (cancelled) {
          epubBook.destroy()
          return
        }
        bookRef.current = epubBook
        zipRef.current = zip

        await epubBook.ready
        if (cancelled) return

        setTocItems(mapNav(epubBook.navigation.toc))

        const hrefs = allSpineHrefs(epubBook)
        const existingHighlights = await readHighlightsFromZip(zip, hrefs)
        if (cancelled) return
        highlightsRef.current = existingHighlights
        setHighlights(existingHighlights)

        // Books highlighted before the mimetype-compression and bogus-XML-
        // comment fixes may already have broken bytes baked into storage.
        // Re-save once here (now that the in-memory zip is corrected) so
        // previously-saved highlights self-heal without the user having to
        // touch a highlight again. IndexedDB writes are silent; writing back
        // to the original file only happens if permission was already
        // granted, so this never surprises the user with a new prompt.
        if (existingHighlights.length > 0) {
          await healZipXhtml(zip, hrefs)
          if (cancelled) return
          const healedBytes = await zip.generateAsync({
            type: 'uint8array',
            mimeType: 'application/epub+zip',
            compression: 'DEFLATE',
          })
          if (cancelled) return
          const healedBlob = new Blob([healedBytes.slice()], { type: 'application/epub+zip' })
          await updateBookFile(book.id, healedBlob, existingHighlights.length)
          const permission = await queryWritePermission(book.fileHandle)
          if (permission === 'granted') {
            const writeAttempt = writeQueueRef.current.then(() =>
              writeBytesToHandle(book.fileHandle, healedBytes),
            )
            writeQueueRef.current = writeAttempt.then(
              () => undefined,
              () => undefined,
            )
            try {
              await writeAttempt
              if (!cancelled) setFileSyncStatus('granted')
            } catch (err) {
              console.error('Could not re-save the healed EPUB to the original file', err)
              if (!cancelled) setFileSyncStatus('error')
            }
          }
        }

        // The self-heal block above can run several awaits deep (IndexedDB
        // write, permission query, a queued disk write). In React 18/19
        // StrictMode's dev-only mount→cleanup→remount cycle, the cleanup
        // below can fire mid-flight and destroy() this effect's epubBook
        // while this async function is still suspended above — destroy()
        // clears the epub.js Book's internal `packaging`, so a rendition
        // built from it later throws deep inside epub.js
        // (Rendition.injectIdentifier: "Cannot read properties of
        // undefined (reading 'packaging')") instead of failing cleanly
        // here. Re-checking immediately before mountRendition() closes that
        // gap — cancelled flips synchronously in the cleanup below, so this
        // check is race-free.
        if (cancelled) return

        const rendition = mountRendition(flowRef.current)
        if (!rendition) return

        await rendition.display(book.lastReadPosition ?? undefined)
        if (cancelled) return
        setReady(true)

        epubBook.locations
          .generate(1000)
          .then(() => {
            if (cancelled) return
            const loc = rendition.location
            if (loc) {
              setProgressPercent(Math.round(epubBook.locations.percentageFromCfi(loc.start.cfi) * 100))
            }
          })
          .catch(() => {})
      } catch (err) {
        // Always log, even if this effect run was cancelled — a stale run
        // throwing usually means a real bug (like the packaging race this
        // guards against above), and swallowing it here would hide that.
        console.error('Failed to load EPUB', err)
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load EPUB')
      }
    }

    load()

    return () => {
      cancelled = true
      renditionRef.current?.destroy()
      renditionRef.current = null
      bookRef.current?.destroy()
      bookRef.current = null
      zipRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.file])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (tocOpen || highlightsPanelOpen) return
      if (e.key === 'ArrowLeft') renditionRef.current?.prev()
      else if (e.key === 'ArrowRight') renditionRef.current?.next()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tocOpen, highlightsPanelOpen])

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

  async function handleGrantFileAccess() {
    try {
      const state = await requestWritePermission(book.fileHandle)
      setFileSyncStatus(state === 'granted' ? 'granted' : 'needs-permission')
    } catch {
      setFileSyncStatus('needs-permission')
    }
  }

  /**
   * Queries (and if needed, requests) write permission for the original
   * file. Browsers only honor requestPermission() within a short window of
   * active user gesture, so this must run as the very first await in each
   * click handler below — before any other async work (zip decompression in
   * particular can easily eat that window on its own for EPUB, since unlike
   * the PDF reader's synchronous pdf-lib edits, resolving a CFI against a
   * chapter's XHTML requires first awaiting its decompression).
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

  async function persist(nextHighlights: EpubHighlight[], canWriteToFile: boolean) {
    const zip = zipRef.current
    if (!zip) return

    const bytes = await zip.generateAsync({
      type: 'uint8array',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
    })
    const blob = new Blob([bytes.slice()], { type: 'application/epub+zip' })
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
    setSelectionInfo(null)
    if (!info) return
    const zip = zipRef.current
    if (!zip) return

    const canWriteToFile = await ensureWritePermissionForGesture()

    if (color.isEraser) {
      const ids = new Set<string>()
      info.contentsDoc.querySelectorAll('.highlight').forEach((el) => {
        if (info.rangeSnapshot.intersectsNode(el)) {
          const id = Array.from(el.classList).find((c) => c.startsWith('hl-'))
          if (id) ids.add(id)
        }
      })
      if (ids.size === 0) return

      for (const id of ids) {
        unwrapHighlight(info.contentsDoc, id)
        const target = highlightsRef.current.find((h) => h.id === id)
        if (target) await removeHighlightFromZip(zip, target)
      }
      const next = highlightsRef.current.filter((h) => !ids.has(h.id))
      highlightsRef.current = next
      setHighlights(next)
      await persist(next, canWriteToFile)
      return
    }

    const id = createHighlightId()
    wrapRangeWithHighlight(info.contentsDoc, info.rangeSnapshot, id, color.id)
    const added = await addHighlightToZip(zip, info.href, info.cfiRange, color, id)
    if (!added) return
    const next = [...highlightsRef.current, added]
    highlightsRef.current = next
    setHighlights(next)
    await persist(next, canWriteToFile)
  }

  async function handleDeleteHighlight() {
    const info = activePopover
    setActivePopover(null)
    const zip = zipRef.current
    const target = highlightsRef.current.find((h) => h.id === info?.id)
    if (!zip || !info || !target) return

    const canWriteToFile = await ensureWritePermissionForGesture()

    unwrapHighlight(info.contentsDoc, target.id)
    await removeHighlightFromZip(zip, target)
    const next = highlightsRef.current.filter((h) => h.id !== target.id)
    highlightsRef.current = next
    setHighlights(next)
    await persist(next, canWriteToFile)
  }

  async function handleRecolorHighlight(color: HighlightColor) {
    if (color.isEraser) {
      await handleDeleteHighlight()
      return
    }
    const info = activePopover
    setActivePopover(null)
    const zip = zipRef.current
    const target = highlightsRef.current.find((h) => h.id === info?.id)
    if (!zip || !info || !target) return

    const canWriteToFile = await ensureWritePermissionForGesture()

    recolorHighlight(info.contentsDoc, target.id, color.id)
    const updated = await recolorHighlightInZip(zip, target, color)
    const next = highlightsRef.current.map((h) => (h.id === target.id ? updated : h))
    highlightsRef.current = next
    setHighlights(next)
    await persist(next, canWriteToFile)
  }

  async function handleToggleFlow() {
    const nextMode = flowRef.current === 'paginated' ? 'scrolled' : 'paginated'
    const resumeTarget = renditionRef.current?.location?.start?.cfi ?? currentHref ?? undefined
    flowRef.current = nextMode
    setFlow(nextMode)
    const rendition = mountRendition(nextMode)
    if (rendition) await rendition.display(resumeTarget)
  }

  function handleTocNavigate(href: string) {
    renditionRef.current?.display(href)
    setTocOpen(false)
  }

  function jumpToHighlight(highlight: EpubHighlight) {
    renditionRef.current?.display(`${highlight.href}#${highlight.id}`)
    setHighlightsPanelOpen(false)
  }

  const flatToc = useMemo(() => flattenToc(tocItems), [tocItems])
  const chapterLabel = useMemo(() => {
    if (!currentHref) return ''
    const clean = currentHref.split('#')[0]
    const match = flatToc.find((item) => item.href.split('#')[0] === clean)
    return match?.label.trim() ?? ''
  }, [flatToc, currentHref])

  if (error) {
    return (
      <div className="flex h-[calc(100dvh-56px)] flex-col items-center justify-center gap-2 bg-gray-50 text-center">
        <p className="text-sm font-medium text-gray-900">Couldn't open this EPUB</p>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="relative h-[calc(100dvh-56px)] overflow-hidden bg-gray-100">
      <EpubReaderToolbar
        title={book.title}
        chapterLabel={chapterLabel}
        progressPercent={progressPercent}
        visible={toolbarVisible || Boolean(selectionInfo) || Boolean(activePopover)}
        flow={flow}
        tocOpen={tocOpen}
        highlightsPanelOpen={highlightsPanelOpen}
        fileSyncStatus={fileSyncStatus}
        onToggleFlow={handleToggleFlow}
        onToggleToc={() => setTocOpen((v) => !v)}
        onToggleHighlights={() => setHighlightsPanelOpen((v) => !v)}
        onGrantFileAccess={handleGrantFileAccess}
      />

      <div className="h-full w-full pt-16">
        <div ref={viewerRef} className="h-full w-full bg-white" />
      </div>

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      )}

      <TocSidebar
        open={tocOpen}
        items={tocItems}
        currentHref={currentHref}
        onNavigate={handleTocNavigate}
        onClose={() => setTocOpen(false)}
      />

      {selectionInfo && <SelectionOverlay rects={selectionInfo.overlayRects} />}

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

      <EpubHighlightsPanel
        open={highlightsPanelOpen}
        highlights={highlights}
        onClose={() => setHighlightsPanelOpen(false)}
        onJump={jumpToHighlight}
      />
    </div>
  )
}
