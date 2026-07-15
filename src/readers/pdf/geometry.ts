import type { PageViewport } from 'pdfjs-dist'
import type { Quad } from '../../lib/pdfHighlights'

/** Converts a DOMRect in client (viewport) space to a PDF-space quad. */
export function clientRectToQuad(
  rect: DOMRect,
  containerRect: DOMRect,
  viewport: PageViewport,
): Quad {
  const x1 = rect.left - containerRect.left
  const y1 = rect.top - containerRect.top
  const x2 = rect.right - containerRect.left
  const y2 = rect.bottom - containerRect.top

  const [px1, py1] = viewport.convertToPdfPoint(x1, y1)
  const [px2, py2] = viewport.convertToPdfPoint(x2, y2)

  return {
    x: Math.min(px1, px2),
    y: Math.min(py1, py2),
    width: Math.abs(px2 - px1),
    height: Math.abs(py2 - py1),
  }
}

export interface ViewportRect {
  left: number
  top: number
  width: number
  height: number
}

/** Converts a PDF-space quad to a rect in the page's local CSS pixel space. */
export function quadToViewportRect(quad: Quad, viewport: PageViewport): ViewportRect {
  const [x1, y1] = viewport.convertToViewportPoint(quad.x, quad.y)
  const [x2, y2] = viewport.convertToViewportPoint(
    quad.x + quad.width,
    quad.y + quad.height,
  )
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

export function pointInQuad(
  x: number,
  y: number,
  quad: Quad,
  viewport: PageViewport,
): boolean {
  const r = quadToViewportRect(quad, viewport)
  return x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height
}
