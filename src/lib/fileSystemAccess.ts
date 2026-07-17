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

/** BookRecord.fileHandle is typed as a non-nullable FileSystemFileHandle, but
 * IndexedDB doesn't enforce that at runtime — records saved before the File
 * System Access refactor (or otherwise corrupted) can still hand back
 * null/undefined/garbage here. Duck-typed rather than `instanceof` since a
 * structured-clone round-trip is guaranteed to preserve the object's
 * behavior, not necessarily its prototype chain identity with whatever
 * FileSystemFileHandle global is in scope at check time. */
export function isValidFileHandle(handle: unknown): handle is FileSystemFileHandle {
  return (
    !!handle &&
    typeof handle === 'object' &&
    typeof (handle as FileSystemFileHandle).queryPermission === 'function' &&
    typeof (handle as FileSystemFileHandle).requestPermission === 'function' &&
    typeof (handle as FileSystemFileHandle).getFile === 'function'
  )
}

/** Never throws, even if handle is missing or malformed — callers can treat
 * 'no-handle' as just another "not writable" state alongside 'denied'. */
export async function queryWritePermission(
  handle: FileSystemFileHandle | null | undefined,
): Promise<PermissionState | 'no-handle'> {
  if (!isValidFileHandle(handle)) return 'no-handle'
  try {
    return await handle.queryPermission({ mode: 'readwrite' })
  } catch (err) {
    console.error('Failed to query write permission for file handle', err)
    return 'no-handle'
  }
}

/** Must be called from within a user gesture (e.g. a click handler). Never
 * throws, even if handle is missing or malformed. */
export async function requestWritePermission(
  handle: FileSystemFileHandle | null | undefined,
): Promise<PermissionState | 'no-handle'> {
  if (!isValidFileHandle(handle)) return 'no-handle'
  try {
    return await handle.requestPermission({ mode: 'readwrite' })
  } catch (err) {
    console.error('Failed to request write permission for file handle', err)
    return 'no-handle'
  }
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

/** Lets the user reconnect a single book to a file on disk (e.g. after a
 * stale/handle-less library record is detected). Returns null if the user
 * cancels. */
export async function pickReplacementFile(): Promise<PickedFile | null> {
  if (!window.showOpenFilePicker) return null
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: BOOK_PICKER_TYPES,
    })
    if (!handle) return null
    await tryGrantWriteAccess(handle)
    return { file: await handle.getFile(), handle }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return null
    throw err
  }
}

export async function writeBytesToHandle(
  handle: FileSystemFileHandle,
  bytes: Uint8Array,
): Promise<void> {
  if (!isValidFileHandle(handle)) {
    throw new Error('Cannot write: no valid file handle for this book')
  }
  const writable = await handle.createWritable()
  await writable.write(bytes.slice())
  await writable.close()
}
