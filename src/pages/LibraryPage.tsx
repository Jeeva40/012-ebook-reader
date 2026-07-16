import { useCallback, useEffect, useState } from 'react'
import BookCard from '../components/BookCard'
import ConfirmDialog from '../components/ConfirmDialog'
import UploadDropzone from '../components/UploadDropzone'
import UploadTaskCard, {
  type UploadTask,
} from '../components/UploadTaskCard'
import type { PickedFile } from '../lib/fileSystemAccess'
import { deleteBook, getAllBooks, type BookMetadata } from '../lib/storage'
import { processUploadedFile } from '../lib/upload'

export default function LibraryPage() {
  const [books, setBooks] = useState<BookMetadata[]>([])
  const [uploads, setUploads] = useState<UploadTask[]>([])
  const [pendingDelete, setPendingDelete] = useState<BookMetadata | null>(
    null,
  )

  const refresh = useCallback(async () => {
    setBooks(await getAllBooks())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  function handleFiles(files: PickedFile[]) {
    for (const { file, handle } of files) {
      const taskId = crypto.randomUUID()
      setUploads((prev) => [
        ...prev,
        { id: taskId, fileName: file.name, stage: 'extracting-cover' },
      ])

      processUploadedFile(file, handle, (stage) => {
        setUploads((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, stage } : t)),
        )
      })
        .then(() => {
          setUploads((prev) => prev.filter((t) => t.id !== taskId))
          refresh()
        })
        .catch((err) => {
          setUploads((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    error:
                      err instanceof Error ? err.message : 'Upload failed',
                  }
                : t,
            ),
          )
        })
    }
  }

  function dismissUpload(id: string) {
    setUploads((prev) => prev.filter((t) => t.id !== id))
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    await deleteBook(pendingDelete.id)
    setPendingDelete(null)
    await refresh()
  }

  const isEmpty = books.length === 0 && uploads.length === 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Library</h1>
        {books.length > 0 && (
          <span className="text-sm text-gray-400">
            {books.length} book{books.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="mb-10">
        <UploadDropzone onFiles={handleFiles} />
      </div>

      {isEmpty ? (
        <p className="text-center text-sm text-gray-500">
          No books yet. Choose a PDF or EPUB file to get started.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {uploads.map((task) => (
            <UploadTaskCard
              key={task.id}
              task={task}
              onDismiss={dismissUpload}
            />
          ))}
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete book?"
          message={`"${pendingDelete.title}" will be permanently removed from your library.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
