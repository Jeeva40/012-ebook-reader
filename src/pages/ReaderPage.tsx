import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import EpubReader from '../readers/epub/EpubReader'
import PdfReader from '../readers/pdf/PdfReader'
import { isValidFileHandle, pickReplacementFile } from '../lib/fileSystemAccess'
import { getBook, updateBookFileHandle, type BookRecord } from '../lib/storage'

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const [book, setBook] = useState<BookRecord | null | undefined>(undefined)
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)

  useEffect(() => {
    if (!bookId) return
    let cancelled = false
    setBook(undefined)
    setReconnectError(null)
    getBook(bookId).then((record) => {
      if (cancelled) return
      // fileHandle is typed as a guaranteed FileSystemFileHandle, but that's
      // a compile-time contract only — IndexedDB happily hands back records
      // saved before that contract existed (or otherwise corrupted), with a
      // null/undefined/malformed fileHandle. Every reader downstream calls
      // straight into book.fileHandle, so that mismatch has to be caught
      // here, once, before it ever reaches them.
      if (record && !isValidFileHandle(record.fileHandle)) {
        console.error(
          `Book "${record.title}" (${record.id}) has no valid file handle — ` +
            'likely a record saved before the File System Access refactor, or one ' +
            'whose handle failed to survive storage. Prompting to reconnect instead ' +
            'of opening the reader.',
          record.fileHandle,
        )
      }
      setBook(record ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [bookId])

  async function handleReconnect() {
    if (!book) return
    setReconnecting(true)
    setReconnectError(null)
    try {
      const picked = await pickReplacementFile()
      if (!picked) return
      const updated = await updateBookFileHandle(book.id, picked.handle)
      if (!updated) {
        setReconnectError('This book no longer exists in your library.')
        return
      }
      setBook(updated)
    } catch (err) {
      console.error('Failed to reconnect book to a file', err)
      setReconnectError(err instanceof Error ? err.message : 'Failed to reconnect file.')
    } finally {
      setReconnecting(false)
    }
  }

  if (book === undefined) {
    return (
      <div className="flex h-[calc(100dvh-56px)] items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  if (book === null) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-900">
          &larr; Back to library
        </Link>
        <div className="mt-6 flex min-h-[60vh] flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 text-center">
          <p className="text-gray-500">Book not found.</p>
        </div>
      </div>
    )
  }

  if (!isValidFileHandle(book.fileHandle)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-900">
          &larr; Back to library
        </Link>
        <div className="mt-6 flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-gray-300 text-center">
          <p className="text-gray-900">
            <span className="font-medium">{book.title}</span> needs to be reconnected.
          </p>
          <p className="max-w-sm text-sm text-gray-500">
            This book lost its connection to its file on disk, so it can't be opened or saved
            to. Choose the file again to reconnect it — your highlights and progress are safe.
          </p>
          {reconnectError && <p className="text-sm text-red-600">{reconnectError}</p>}
          <button
            type="button"
            onClick={handleReconnect}
            disabled={reconnecting}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {reconnecting ? 'Choosing…' : 'Choose file again'}
          </button>
        </div>
      </div>
    )
  }

  if (book.format === 'pdf') {
    return <PdfReader key={book.id} book={book} />
  }

  return <EpubReader key={book.id} book={book} />
}
