import { useRef, useState } from 'react'
import {
  handleFromDataTransferItem,
  isFileSystemAccessSupported,
  pickBookFiles,
  type PickedFile,
} from '../lib/fileSystemAccess'

interface UploadDropzoneProps {
  onFiles: (files: PickedFile[]) => void
}

export default function UploadDropzone({ onFiles }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)

    const items = Array.from(e.dataTransfer.items)
    if (items.length > 0 && items.every((item) => item.kind === 'file')) {
      const picked = await Promise.all(
        items.map(async (item) => ({
          file: item.getAsFile(),
          handle: await handleFromDataTransferItem(item),
        })),
      )
      const files = picked
        .filter((p): p is { file: File; handle: FileSystemFileHandle | null } => p.file !== null)
      if (files.length) onFiles(files)
      return
    }

    const files = Array.from(e.dataTransfer.files).map((file) => ({ file, handle: null }))
    if (files.length) onFiles(files)
  }

  async function handleClick() {
    if (isFileSystemAccessSupported()) {
      const picked = await pickBookFiles()
      if (picked) onFiles(picked)
      return
    }
    inputRef.current?.click()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).map((file) => ({ file, handle: null }))
    e.target.value = ''
    if (files.length) onFiles(files)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
        isDragging
          ? 'border-gray-900 bg-gray-50'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
      }`}
    >
      <svg
        className="h-8 w-8 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 8.25 12 3.75m0 0L7.5 8.25M12 3.75v13.5"
        />
      </svg>
      <p className="text-sm font-medium text-gray-700">
        Drag and drop a book, or{' '}
        <span className="text-gray-900 underline underline-offset-2">
          browse
        </span>
      </p>
      <p className="text-xs text-gray-400">PDF, EPUB, or MOBI</p>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.epub,.mobi"
        multiple
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}
