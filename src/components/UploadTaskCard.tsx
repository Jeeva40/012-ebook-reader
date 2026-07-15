import type { UploadStage } from '../lib/upload'

export interface UploadTask {
  id: string
  fileName: string
  stage: UploadStage
  error?: string
}

const STAGE_LABEL: Record<UploadStage, string> = {
  converting: 'Converting via Calibre…',
  'extracting-cover': 'Extracting cover…',
  saving: 'Saving…',
}

interface UploadTaskCardProps {
  task: UploadTask
  onDismiss: (id: string) => void
}

export default function UploadTaskCard({
  task,
  onDismiss,
}: UploadTaskCardProps) {
  const isError = Boolean(task.error)

  return (
    <div
      className={`flex aspect-[2/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border p-4 text-center ${
        isError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'
      }`}
    >
      {isError ? (
        <>
          <svg
            className="h-6 w-6 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <p className="line-clamp-1 text-xs font-medium text-gray-900">
            {task.fileName}
          </p>
          <p className="line-clamp-3 text-xs text-red-600">{task.error}</p>
          <button
            type="button"
            onClick={() => onDismiss(task.id)}
            className="text-xs font-medium text-gray-500 underline hover:text-gray-700"
          >
            Dismiss
          </button>
        </>
      ) : (
        <>
          <svg
            className="h-6 w-6 animate-spin text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z"
            />
          </svg>
          <p className="line-clamp-1 text-xs font-medium text-gray-900">
            {task.fileName}
          </p>
          <p className="text-xs text-gray-500">{STAGE_LABEL[task.stage]}</p>
        </>
      )}
    </div>
  )
}
