import { Link } from 'react-router-dom'
import type { FileSyncStatus } from '../../lib/fileSystemAccess'
import FileSyncBadge from '../shared/FileSyncBadge'

interface EpubReaderToolbarProps {
  title: string
  chapterLabel: string
  progressPercent: number | null
  visible: boolean
  flow: 'paginated' | 'scrolled'
  tocOpen: boolean
  highlightsPanelOpen: boolean
  fileSyncStatus: FileSyncStatus
  onToggleFlow: () => void
  onToggleToc: () => void
  onToggleHighlights: () => void
  onGrantFileAccess: () => void
}

export default function EpubReaderToolbar({
  title,
  chapterLabel,
  progressPercent,
  visible,
  flow,
  tocOpen,
  highlightsPanelOpen,
  fileSyncStatus,
  onToggleFlow,
  onToggleToc,
  onToggleHighlights,
  onGrantFileAccess,
}: EpubReaderToolbarProps) {
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

      <button
        type="button"
        onClick={onToggleToc}
        aria-pressed={tocOpen}
        aria-label="Toggle table of contents"
        className={`shrink-0 rounded-full p-1.5 ${
          tocOpen ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
          />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{title}</p>
        <p className="truncate text-xs text-gray-400">
          {chapterLabel}
          {progressPercent != null ? ` · ${progressPercent}%` : ''}
        </p>
      </div>

      <button
        type="button"
        onClick={onToggleFlow}
        aria-label={flow === 'paginated' ? 'Switch to scrolled view' : 'Switch to paginated view'}
        title={flow === 'paginated' ? 'Switch to scrolled view' : 'Switch to paginated view'}
        className="shrink-0 rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
      >
        {flow === 'paginated' ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 4.5h6v15h-6a.75.75 0 0 1-.75-.75V5.25a.75.75 0 0 1 .75-.75Zm10.5 0h6a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75h-6v-15Z"
            />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h10.5"
            />
          </svg>
        )}
      </button>

      <FileSyncBadge status={fileSyncStatus} onGrantFileAccess={onGrantFileAccess} />

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
