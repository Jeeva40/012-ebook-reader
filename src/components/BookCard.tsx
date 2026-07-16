import { Link } from 'react-router-dom'
import { gradientForTitle } from '../lib/gradient'
import type { BookMetadata } from '../lib/storage'
import { useObjectUrl } from '../lib/useObjectUrl'

interface BookCardProps {
  book: BookMetadata
  onDelete: (book: BookMetadata) => void
}

export default function BookCard({ book, onDelete }: BookCardProps) {
  const coverUrl = useObjectUrl(book.cover)

  return (
    <div className="group relative">
      <Link
        to={`/read/${book.id}`}
        className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 transition-shadow hover:shadow-md"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-gray-100">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradientForTitle(book.title)} p-4`}
            >
              <span className="line-clamp-4 text-center text-sm font-semibold text-white/90">
                {book.title}
              </span>
            </div>
          )}

          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
            {book.format}
          </span>

          {book.progress != null && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
              <div
                className="h-full bg-white"
                style={{ width: `${Math.round(book.progress * 100)}%` }}
              />
            </div>
          )}
        </div>

        <div className="p-3">
          <p className="truncate text-sm font-medium text-gray-900">
            {book.title}
          </p>
          {book.progress != null ? (
            <p className="mt-0.5 text-xs text-gray-400">
              {Math.round(book.progress * 100)}% read
            </p>
          ) : null}
        </div>
      </Link>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDelete(book)
        }}
        aria-label={`Delete ${book.title}`}
        className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-70 transition-opacity hover:bg-black/80 focus:opacity-100 focus:outline-none sm:opacity-0 sm:group-hover:opacity-100"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m14.74 9-.346 9m-4.788 0L9.26 9M19.228 5.79c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
          />
        </svg>
      </button>
    </div>
  )
}
