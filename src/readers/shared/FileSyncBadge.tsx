import type { FileSyncStatus } from '../../lib/fileSystemAccess'

interface FileSyncBadgeProps {
  status: FileSyncStatus
  onGrantFileAccess: () => void
}

export default function FileSyncBadge({ status, onGrantFileAccess }: FileSyncBadgeProps) {
  if (status === 'granted') {
    return (
      <span
        className="hidden shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700 sm:inline-flex"
        title="Highlights are saved directly to the original file"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        Saved to file
      </span>
    )
  }

  if (status === 'needs-permission') {
    return (
      <button
        type="button"
        onClick={onGrantFileAccess}
        title="Grant access to save changes to this file"
        className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
        <span className="hidden sm:inline">Grant access to save</span>
        <span className="sm:hidden">Grant access</span>
      </button>
    )
  }

  if (status === 'error') {
    return (
      <span
        className="flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700"
        title="Couldn't save to the original file"
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
    )
  }

  return null
}
