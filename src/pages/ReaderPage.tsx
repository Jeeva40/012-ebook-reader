import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import EpubReader from '../readers/epub/EpubReader'
import PdfReader from '../readers/pdf/PdfReader'
import { getBook, type BookRecord } from '../lib/storage'

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const [book, setBook] = useState<BookRecord | null | undefined>(undefined)

  useEffect(() => {
    if (!bookId) return
    let cancelled = false
    setBook(undefined)
    getBook(bookId).then((record) => {
      if (!cancelled) setBook(record ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [bookId])

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

  if (book.format === 'pdf') {
    return <PdfReader key={book.id} book={book} />
  }

  return <EpubReader key={book.id} book={book} />
}
