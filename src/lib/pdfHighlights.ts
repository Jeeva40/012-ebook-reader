import {
  fill,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  type PDFObject,
  PDFRef,
  PDFString,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setFillingRgbColor,
  setGraphicsState,
} from 'pdf-lib'

export interface HighlightColor {
  id: string
  label: string
  swatch: string
  rgb: { r: number; g: number; b: number }
  /** When true, this swatch erases a highlight instead of applying a color. */
  isEraser?: boolean
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  {
    id: 'yellow',
    label: 'Yellow',
    swatch: '#fde047',
    rgb: { r: 0.98, g: 0.85, b: 0.31 },
  },
  {
    id: 'green',
    label: 'Green',
    swatch: '#86efac',
    rgb: { r: 0.53, g: 0.94, b: 0.65 },
  },
  {
    id: 'blue',
    label: 'Blue',
    swatch: '#93c5fd',
    rgb: { r: 0.58, g: 0.77, b: 0.99 },
  },
  {
    id: 'pink',
    label: 'Pink',
    swatch: '#f9a8d4',
    rgb: { r: 0.98, g: 0.66, b: 0.83 },
  },
  {
    id: 'white',
    label: 'White',
    swatch: '#ffffff',
    rgb: { r: 1, g: 1, b: 1 },
    isEraser: true,
  },
]

export const HIGHLIGHT_OPACITY = 0.42

export interface Quad {
  x: number
  y: number
  width: number
  height: number
}

export interface Highlight {
  id: string
  pageIndex: number
  quads: Quad[]
  color: HighlightColor
}

function nearestColor(rgb: { r: number; g: number; b: number }): HighlightColor {
  let closest = HIGHLIGHT_COLORS[0]
  let bestDist = Infinity
  for (const candidate of HIGHLIGHT_COLORS) {
    const dist =
      (candidate.rgb.r - rgb.r) ** 2 +
      (candidate.rgb.g - rgb.g) ** 2 +
      (candidate.rgb.b - rgb.b) ** 2
    if (dist < bestDist) {
      bestDist = dist
      closest = candidate
    }
  }
  return closest
}

function quadPointsFor(quad: Quad): number[] {
  const { x, y, width, height } = quad
  // Per PDF spec: top-left, top-right, bottom-left, bottom-right
  return [x, y + height, x + width, y + height, x, y, x + width, y]
}

function buildAppearanceStream(
  pdfDoc: PDFDocument,
  quads: Quad[],
  rgb: { r: number; g: number; b: number },
  rect: [number, number, number, number],
): PDFRef {
  const { context } = pdfDoc

  const extGStateRef = context.register(
    context.obj({ Type: 'ExtGState', ca: HIGHLIGHT_OPACITY, BM: 'Multiply' }),
  )

  const operators = [
    pushGraphicsState(),
    setGraphicsState('GS1'),
    setFillingRgbColor(rgb.r, rgb.g, rgb.b),
    ...quads.map((q) => rectangle(q.x, q.y, q.width, q.height)),
    fill(),
    popGraphicsState(),
  ]

  const formStream = context.formXObject(operators, {
    BBox: rect,
    Matrix: [1, 0, 0, 1, 0, 0],
    Resources: { ExtGState: { GS1: extGStateRef } },
  })

  return context.register(formStream)
}

function boundingRect(quads: Quad[]): [number, number, number, number] {
  const xs = quads.flatMap((q) => [q.x, q.x + q.width])
  const ys = quads.flatMap((q) => [q.y, q.y + q.height])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

export function addHighlightToDoc(
  pdfDoc: PDFDocument,
  pageIndex: number,
  rawQuads: Quad[],
  color: HighlightColor,
): Highlight | null {
  const quads = rawQuads.filter((q) => q.width > 0.01 && q.height > 0.01)
  if (quads.length === 0) return null

  const page = pdfDoc.getPage(pageIndex)
  const { context } = pdfDoc
  const rect = boundingRect(quads)

  const apRef = buildAppearanceStream(pdfDoc, quads, color.rgb, rect)

  const id = crypto.randomUUID()
  const quadPoints = quads.flatMap(quadPointsFor)

  const annotRef = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Highlight',
      Rect: rect,
      QuadPoints: quadPoints,
      C: [color.rgb.r, color.rgb.g, color.rgb.b],
      CA: HIGHLIGHT_OPACITY,
      F: 4,
      NM: PDFString.of(id),
      AP: { N: apRef },
    }),
  )
  page.node.addAnnot(annotRef)

  return { id, pageIndex, quads, color }
}

function resolveAnnotDict(
  pdfDoc: PDFDocument,
  raw: PDFObject | undefined,
): PDFDict | undefined {
  if (raw instanceof PDFDict) return raw
  if (raw instanceof PDFRef) return pdfDoc.context.lookupMaybe(raw, PDFDict)
  return undefined
}

function findAnnotRef(
  pdfDoc: PDFDocument,
  pageIndex: number,
  highlightId: string,
): PDFRef | undefined {
  const page = pdfDoc.getPage(pageIndex)
  const annots = page.node.Annots()
  if (!annots) return undefined

  for (let i = 0; i < annots.size(); i++) {
    const raw = annots.get(i)
    const dict = resolveAnnotDict(pdfDoc, raw)
    if (!dict) continue
    const nm = dict.lookupMaybe(PDFName.of('NM'), PDFString)
    if (nm?.decodeText() === highlightId && raw instanceof PDFRef) {
      return raw
    }
  }
  return undefined
}

export function removeHighlightFromDoc(
  pdfDoc: PDFDocument,
  highlight: Highlight,
): void {
  const annotRef = findAnnotRef(pdfDoc, highlight.pageIndex, highlight.id)
  if (!annotRef) return
  const page = pdfDoc.getPage(highlight.pageIndex)
  page.node.removeAnnot(annotRef)
  pdfDoc.context.delete(annotRef)
}

function quadsIntersect(a: Quad, b: Quad): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

/** Highlights on `pageIndex` whose quads overlap any of `quads` (e.g. a text selection). */
export function findHighlightsOverlappingQuads(
  highlights: Highlight[],
  pageIndex: number,
  quads: Quad[],
): Highlight[] {
  return highlights.filter(
    (h) =>
      h.pageIndex === pageIndex &&
      h.quads.some((hq) => quads.some((q) => quadsIntersect(hq, q))),
  )
}

export function recolorHighlightInDoc(
  pdfDoc: PDFDocument,
  highlight: Highlight,
  newColor: HighlightColor,
): Highlight | null {
  removeHighlightFromDoc(pdfDoc, highlight)
  return addHighlightToDoc(pdfDoc, highlight.pageIndex, highlight.quads, newColor)
}

export function readHighlightsFromDoc(pdfDoc: PDFDocument): Highlight[] {
  const highlights: Highlight[] = []
  const pageCount = pdfDoc.getPageCount()

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = pdfDoc.getPage(pageIndex)
    const annots = page.node.Annots()
    if (!annots) continue

    for (let i = 0; i < annots.size(); i++) {
      const dict = resolveAnnotDict(pdfDoc, annots.get(i))
      if (!dict) continue

      const subtype = dict.lookupMaybe(PDFName.of('Subtype'), PDFName)
      if (subtype?.decodeText() !== 'Highlight') continue

      const quadPointsArr = dict.lookupMaybe(PDFName.of('QuadPoints'), PDFArray)
      const nm = dict.lookupMaybe(PDFName.of('NM'), PDFString)
      const colorArr = dict.lookupMaybe(PDFName.of('C'), PDFArray)

      const numbers = (quadPointsArr?.asArray() ?? [])
        .filter((n): n is PDFNumber => n instanceof PDFNumber)
        .map((n) => n.asNumber())

      const quads: Quad[] = []
      for (let q = 0; q + 8 <= numbers.length; q += 8) {
        const xs = [numbers[q], numbers[q + 2], numbers[q + 4], numbers[q + 6]]
        const ys = [numbers[q + 1], numbers[q + 3], numbers[q + 5], numbers[q + 7]]
        const x = Math.min(...xs)
        const y = Math.min(...ys)
        quads.push({ x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y })
      }
      if (quads.length === 0) continue

      let rgb = HIGHLIGHT_COLORS[0].rgb
      const colorParts = (colorArr?.asArray() ?? [])
        .filter((n): n is PDFNumber => n instanceof PDFNumber)
        .map((n) => n.asNumber())
      if (colorParts.length === 3) {
        rgb = { r: colorParts[0], g: colorParts[1], b: colorParts[2] }
      }

      highlights.push({
        id: nm?.decodeText() ?? crypto.randomUUID(),
        pageIndex,
        quads,
        color: nearestColor(rgb),
      })
    }
  }

  return highlights
}
