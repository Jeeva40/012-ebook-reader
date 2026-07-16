const BOOK_PICKER_TYPES: NonNullable<OpenFilePickerOptions['types']> = [
  {
    description: 'Ebooks',
    accept: {
      'application/pdf': ['.pdf'],
      'application/epub+zip': ['.epub'],
    },
  },
]

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'
}

/** Shared across PDF/EPUB reader toolbars to show the "saved to file" state. */
export type FileSyncStatus = 'granted' | 'needs-permission' | 'error' | null

export interface PickedFile {
  file: File
  handle: FileSystemFileHandle
}

export async function queryWritePermission(
  handle: FileSystemFileHandle,
): Promise<PermissionState> {
  return handle.queryPermission({ mode: 'readwrite' })
}

/** Must be called from within a user gesture (e.g. a click handler). */
export async function requestWritePermission(
  handle: FileSystemFileHandle,
): Promise<PermissionState> {
  return handle.requestPermission({ mode: 'readwrite' })
}

/** Best-effort: requests write access right away, while still inside the user
 * gesture that produced the handle (picking the file). Waiting until the
 * first highlight to ask means a missed prompt silently falls back to an
 * in-browser-only copy, so we front-load it here instead. */
async function tryGrantWriteAccess(handle: FileSystemFileHandle): Promise<void> {
  try {
    await requestWritePermission(handle)
  } catch {
    // Not fatal — the reader will surface a "Grant access" prompt later.
  }
}

/** Opens the native file picker so uploads get a writable handle back to the
 * original file. Returns null if the user cancels. Callers should confirm
 * isFileSystemAccessSupported() before calling this (the app gates entry on
 * it), but this still no-ops safely if called without that check. */
export async function pickBookFiles(): Promise<PickedFile[] | null> {
  if (!window.showOpenFilePicker) return null
  try {
    const handles = await window.showOpenFilePicker({
      multiple: true,
      types: BOOK_PICKER_TYPES,
    })
    return Promise.all(
      handles.map(async (handle) => {
        await tryGrantWriteAccess(handle)
        return { file: await handle.getFile(), handle }
      }),
    )
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return null
    throw err
  }
}

export async function writeBytesToHandle(
  handle: FileSystemFileHandle,
  bytes: Uint8Array,
): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(bytes.slice())
  await writable.close()
}
