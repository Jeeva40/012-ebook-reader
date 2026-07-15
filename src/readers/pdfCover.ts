import { getDocument } from 'pdfjs-dist'
import { PDFJS_DOCUMENT_PARAMS } from './pdf/pdfjsSetup'

const THUMBNAIL_WIDTH = 400

export async function extractPdfCover(file: Blob): Promise<Blob | null> {
  try {
    const data = await file.arrayBuffer()
    const loadingTask = getDocument({ data, ...PDFJS_DOCUMENT_PARAMS })
    const pdf = await loadingTask.promise
    const page = await pdf.getPage(1)

    const baseViewport = page.getViewport({ scale: 1 })
    const scale = THUMBNAIL_WIDTH / baseViewport.width
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    if (!context) return null

    await page.render({ canvas, canvasContext: context, viewport }).promise
    await loadingTask.destroy()

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
  } catch {
    return null
  }
}
