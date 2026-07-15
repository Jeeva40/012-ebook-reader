import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AnnotationMode,
  TextLayer,
  type PageViewport,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import type { Highlight } from '../../lib/pdfHighlights'
import { pointInQuad, quadToViewportRect } from './geometry'

interface PdfPageProps {
  pageIndex: number
  pdfDoc: PDFDocumentProxy
  scale: number
  size: { width: number; height: number }
  isActive: boolean
  highlights: Highlight[]
  registerWrapper: (pageIndex: number, el: HTMLDivElement | null) => void
  onMeasured: (pageIndex: number, size: { width: number; height: number }) => void
  onViewportReady: (pageIndex: number, viewport: PageViewport | null) => void
  onHighlightClick: (id: string, clientX: number, clientY: number) => void
}

export default function PdfPage({
  pageIndex,
  pdfDoc,
  scale,
  size,
  isActive,
  highlights,
  registerWrapper,
  onMeasured,
  onViewportReady,
  onHighlightClick,
}: PdfPageProps) {
  const wrapperElRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<PageViewport | null>(null)

  const setWrapperRef = useCallback(
    (el: HTMLDivElement | null) => {
      wrapperElRef.current = el
      registerWrapper(pageIndex, el)
    },
    [pageIndex, registerWrapper],
  )

  useEffect(() => {
    if (!isActive) {
      setViewport(null)
      onViewportReady(pageIndex, null)
      return
    }

    let cancelled = false
    let renderTask: RenderTask | null = null
    let textLayer: TextLayer | null = null

    async function render() {
      const page = await pdfDoc.getPage(pageIndex + 1)
      if (cancelled) return

      const pageViewport = page.getViewport({ scale })
      setViewport(pageViewport)
      onViewportReady(pageIndex, pageViewport)
      onMeasured(pageIndex, {
        width: pageViewport.width / scale,
        height: pageViewport.height / scale,
      })

      const canvas = canvasRef.current
      if (!canvas) return
      const outputScale = window.devicePixelRatio || 1
      canvas.width = Math.floor(pageViewport.width * outputScale)
      canvas.height = Math.floor(pageViewport.height * outputScale)
      canvas.style.width = `${Math.floor(pageViewport.width)}px`
      canvas.style.height = `${Math.floor(pageViewport.height)}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const task = page.render({
        canvas,
        canvasContext: ctx,
        viewport: pageViewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        // Highlights are rendered by our own overlay, driven by live app
        // state, so the baked-in annotation appearance isn't also painted.
        annotationMode: AnnotationMode.DISABLE,
      })
      renderTask = task
      await task.promise
      if (cancelled) return

      const textLayerEl = textLayerRef.current
      if (!textLayerEl) return
      textLayerEl.replaceChildren()
      textLayerEl.style.setProperty('--total-scale-factor', String(scale))
      textLayerEl.style.width = `${pageViewport.width}px`
      textLayerEl.style.height = `${pageViewport.height}px`

      textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerEl,
        viewport: pageViewport,
      })
      await textLayer.render()
    }

    render().catch((err: unknown) => {
      if (!cancelled) console.error('Failed to render PDF page', err)
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
    }
  }, [isActive, pdfDoc, pageIndex, scale, onMeasured, onViewportReady])

  function handleClick(e: React.MouseEvent) {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return
    if (!viewport || !wrapperElRef.current) return

    const rect = wrapperElRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    for (const highlight of highlights) {
      for (const quad of highlight.quads) {
        if (pointInQuad(x, y, quad, viewport)) {
          onHighlightClick(highlight.id, e.clientX, e.clientY)
          return
        }
      }
    }
  }

  const width = size.width * scale
  const height = size.height * scale

  return (
    <div
      ref={setWrapperRef}
      data-page-index={pageIndex}
      style={{ width, height }}
      className="relative mx-auto mb-4 bg-white shadow-sm"
      onClick={handleClick}
    >
      {isActive ? (
        <>
          <canvas ref={canvasRef} className="block" />
          {viewport && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ zIndex: 1, mixBlendMode: 'multiply' }}
            >
              {highlights.flatMap((h) =>
                h.quads.map((q, i) => {
                  const r = quadToViewportRect(q, viewport)
                  return (
                    <div
                      key={`${h.id}-${i}`}
                      style={{
                        position: 'absolute',
                        left: r.left,
                        top: r.top,
                        width: r.width,
                        height: r.height,
                        background: h.color.swatch,
                      }}
                    />
                  )
                }),
              )}
            </div>
          )}
          <div ref={textLayerRef} className="textLayer" />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-gray-300">
          Page {pageIndex + 1}
        </div>
      )}
    </div>
  )
}
