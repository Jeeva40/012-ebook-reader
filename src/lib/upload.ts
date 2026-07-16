import { extractEpubCover } from '../readers/epubCover'
import { extractPdfCover } from '../readers/pdfCover'
import { addBook, type BookFormat, type BookRecord } from './storage'
import { withTimeout } from './timeout'

export type UploadStage = 'extracting-cover' | 'saving'

const COVER_EXTRACTION_TIMEOUT_MS = 8000

function detectFormat(filename: string): BookFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf' || ext === 'epub') return ext
  return null
}

export async function processUploadedFile(
  file: File,
  fileHandle: FileSystemFileHandle,
  onProgress?: (stage: UploadStage) => void,
): Promise<BookRecord> {
  const format = detectFormat(file.name)
  if (!format) {
    throw new Error(`Unsupported file type: ${file.name}`)
  }

  onProgress?.('extracting-cover')
  const cover = await withTimeout(
    format === 'pdf' ? extractPdfCover(file) : extractEpubCover(file),
    COVER_EXTRACTION_TIMEOUT_MS,
    null,
  )

  onProgress?.('saving')
  return addBook({
    title: file.name.replace(/\.[^/.]+$/, ''),
    format,
    file,
    cover,
    fileHandle,
  })
}
