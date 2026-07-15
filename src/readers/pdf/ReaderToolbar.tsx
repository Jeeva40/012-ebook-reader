import { Link } from 'react-router-dom'

export type FileSyncStatus = 'granted' | 'needs-permission' | 'unsupported' | 'error' | null

interface ReaderToolbarProps {
  title: string
  currentPage: number
  numPages: number
  scale: number
  visible: boolean
  highlightsPanelOpen: boolean
  fileSyncStatus: FileSyncStatus
  onZoomIn: () => void
  onZoomOut: () => void
  onToggleHighlights: () => void
  onDownload: () => void
  onGrantFileAccess: () => void
}

export default function ReaderToolbar({
  title,
  currentPage,
  numPages,
  scale,
  visible,
  highlightsPanelOpen,
  fileSyncStatus,
  onZoomIn,
  onZoomOut,
  onToggleHighlights,
  onDownload,
  onGrantFileAccess,
}: ReaderToolbarProps) {
  return (
    <div
      className={`absolute inset-x-0 top-0 z-20 flex items-center gap-3 border-b border-gray-200 bg-white/90 px-3 py-2.5 backdrop-blur transition-transform duration-200 sm:px-4 ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <Link
        to="/"
        aria-label="Back to library"
        className="shrink-0 rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-400">
          {currentPage} / {numPages}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-gray-100 px-1 py-1">
        <button
          type="button"
          onClick={onZoomOut}
          aria-label="Zoom out"
          className="rounded-full p-1.5 text-gray-600 hover:bg-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
          </svg>
        </button>
        <span className="w-10 text-center text-xs tabular-nums text-gray-500">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="Zoom in"
          className="rounded-full p-1.5 text-gray-600 hover:bg-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {fileSyncStatus === 'granted' && (
        <span
          className="hidden shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700 sm:inline-flex"
          title="Highlights are saved directly to the original file"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Saved to file
        </span>
      )}

      {fileSyncStatus === 'needs-permission' && (
        <button
          type="button"
          onClick={onGrantFileAccess}
          className="hidden shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 sm:inline-flex"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          Enable file saving
        </button>
      )}

      {fileSyncStatus === 'error' && (
        <span
          className="hidden shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 sm:inline-flex"
          title="Couldn't save to the original file — use Download to keep a copy"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          Save failed
        </span>
      )}

      {fileSyncStatus === 'unsupported' && (
        <span
          className="hidden shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500 sm:inline-flex"
          title="This browser can't save directly to the original file — use Download to keep a permanent copy"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m0 3.75h.007v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          In-browser only
        </span>
      )}

      <button
        type="button"
        onClick={onDownload}
        aria-label="Download highlighted PDF"
        className="shrink-0 rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 12 12 16.5m0 0L16.5 12M12 16.5V3"
          />
        </svg>
      </button>

      <button
        type="button"
        onClick={onToggleHighlights}
        aria-pressed={highlightsPanelOpen}
        aria-label="Toggle highlights panel"
        className={`shrink-0 rounded-full p-1.5 ${
          highlightsPanelOpen
            ? 'bg-gray-900 text-white'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"
          />
        </svg>
      </button>
    </div>
  )
}
