import { GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerSrc

/**
 * cmaps/standard_fonts/wasm are loaded by pdf.js at runtime based on what a
 * given document needs, so they can't be resolved as individual ES module
 * imports — they're copied into public/pdfjs (scripts/copy-pdfjs-assets.mjs,
 * run on postinstall) and served as static assets instead.
 */
export const PDFJS_DOCUMENT_PARAMS = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
}
