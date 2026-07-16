import { pickBookFiles, type PickedFile } from '../lib/fileSystemAccess'

interface UploadDropzoneProps {
  onFiles: (files: PickedFile[]) => void
}

export default function UploadDropzone({ onFiles }: UploadDropzoneProps) {
  async function handleClick() {
    const picked = await pickBookFiles()
    if (picked) onFiles(picked)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 px-6 py-10 text-center transition-colors hover:border-gray-300 hover:bg-gray-50/50"
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
        <span className="text-gray-900 underline underline-offset-2">
          Choose a file
        </span>{' '}
        to add it to your library
      </p>
      <p className="text-xs text-gray-400">PDF or EPUB</p>
    </button>
  )
}
