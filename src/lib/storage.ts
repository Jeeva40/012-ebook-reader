import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type BookFormat = 'pdf' | 'epub' | 'mobi'

export interface BookMetadata {
  id: string
  title: string
  format: BookFormat
  originalFormat: BookFormat | null
  addedAt: number
  lastReadPosition: string | null
  progress: number | null
  highlightCount: number
  cover: Blob | null
}

export interface BookRecord extends BookMetadata {
  file: Blob
  /** Writable handle to the original file on disk, when granted via the File
   * System Access API. Null if unsupported, declined, or converted (e.g.
   * MOBI -> EPUB, where the handle would no longer point at the right format). */
  fileHandle: FileSystemFileHandle | null
}

export interface NewBookInput {
  title: string
  format: BookFormat
  originalFormat: BookFormat | null
  file: Blob
  cover: Blob | null
  fileHandle?: FileSystemFileHandle | null
}

interface EbookReaderDB extends DBSchema {
  books: {
    key: string
    value: BookRecord
  }
}

const DB_NAME = 'ebook-reader'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<EbookReaderDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<EbookReaderDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('books', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

export async function addBook(input: NewBookInput): Promise<BookRecord> {
  const record: BookRecord = {
    id: crypto.randomUUID(),
    title: input.title,
    format: input.format,
    originalFormat: input.originalFormat,
    addedAt: Date.now(),
    lastReadPosition: null,
    progress: null,
    highlightCount: 0,
    cover: input.cover,
    file: input.file,
    fileHandle: input.fileHandle ?? null,
  }

  const db = await getDB()
  await db.put('books', record)
  return record
}

export async function getAllBooks(): Promise<BookMetadata[]> {
  const db = await getDB()
  const records = await db.getAll('books')
  return records
    .map(({ file: _file, fileHandle: _fileHandle, ...metadata }) => metadata)
    .sort((a, b) => b.addedAt - a.addedAt)
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  const db = await getDB()
  return db.get('books', id)
}

export async function updateBookProgress(
  id: string,
  updates: Partial<
    Pick<BookMetadata, 'lastReadPosition' | 'progress' | 'highlightCount'>
  >,
): Promise<void> {
  const db = await getDB()
  const record = await db.get('books', id)
  if (!record) return
  await db.put('books', { ...record, ...updates })
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('books', id)
}

export async function updateBookFile(
  id: string,
  file: Blob,
  highlightCount: number,
): Promise<void> {
  const db = await getDB()
  const record = await db.get('books', id)
  if (!record) return
  await db.put('books', { ...record, file, highlightCount })
}
