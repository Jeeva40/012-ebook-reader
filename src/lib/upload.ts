import { extractEpubCover } from '../readers/epubCover'
import { extractPdfCover } from '../readers/pdfCover'
import { convertMobiToEpub } from './convert'
import { addBook, type BookFormat, type BookRecord } from './storage'
import { withTimeout } from './timeout'

export type UploadStage = 'converting' | 'extracting-cover' | 'saving'

const COVER_EXTRACTION_TIMEOUT_MS = 8000

function detectFormat(filename: string): BookFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf' || ext === 'epub' || ext === 'mobi') return ext
  return null
}

export async function processUploadedFile(
  file: File,
  onProgress?: (stage: UploadStage) => void,
  fileHandle?: FileSystemFileHandle | null,
): Promise<BookRecord> {
  const format = detectFormat(file.name)
  if (!format) {
    throw new Error(`Unsupported file type: ${file.name}`)
  }

  let storedFile: Blob = file
  let storedFormat: BookFormat = format
  let originalFormat: BookFormat | null = null

  if (format === 'mobi') {
    onProgress?.('converting')
    storedFile = await convertMobiToEpub(file)
    storedFormat = 'epub'
    originalFormat = 'mobi'
  }

  onProgress?.('extracting-cover')
  const cover = await withTimeout(
    storedFormat === 'pdf'
      ? extractPdfCover(storedFile)
      : extractEpubCover(storedFile),
    COVER_EXTRACTION_TIMEOUT_MS,
    null,
  )

  onProgress?.('saving')
  return addBook({
    title: file.name.replace(/\.[^/.]+$/, ''),
    format: storedFormat,
    originalFormat,
    file: storedFile,
    cover,
    // A MOBI's handle points at the pre-conversion file, which is the wrong
    // format for the EPUB bytes we end up storing — don't wire it up.
    fileHandle: format === 'mobi' ? null : fileHandle,
  })
}
