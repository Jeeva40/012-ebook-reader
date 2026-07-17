import { useSyncExternalStore } from 'react'
import { getInstallPrompt, promptInstall, subscribeInstallPrompt } from '../lib/installPrompt'

/** Renders nothing until the browser fires beforeinstallprompt (Android
 * Chrome and other Chromium browsers only — iOS Safari and already-installed
 * sessions never get this event, which is fine: they have no better
 * "install" affordance than the browser's own menu). */
export default function InstallAppButton() {
  const available = useSyncExternalStore(
    subscribeInstallPrompt,
    () => getInstallPrompt() !== null,
    () => false,
  )

  if (!available) return null

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M10 2a1 1 0 0 1 1 1v8.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L9 11.586V3a1 1 0 0 1 1-1Z" />
        <path d="M4 15a1 1 0 0 1 1 1v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1a1 1 0 1 1 2 0v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-1a1 1 0 0 1 1-1Z" />
      </svg>
      Install app
    </button>
  )
}
