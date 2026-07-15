// TypeScript's bundled DOM lib doesn't yet include the parts of the File
// System Access API we need (it's still a Chromium-only living standard).
// This augments the existing FileSystemHandle/DataTransferItem/Window
// declarations with just the members we use.
export {}

declare global {
  type FileSystemPermissionMode = 'read' | 'readwrite'

  interface FileSystemHandlePermissionDescriptor {
    mode?: FileSystemPermissionMode
  }

  interface FileSystemHandle {
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>
    requestPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>
  }

  interface DataTransferItem {
    getAsFileSystemHandle(): Promise<FileSystemHandle | null>
  }

  interface OpenFilePickerOptions {
    multiple?: boolean
    excludeAcceptAllOption?: boolean
    types?: {
      description?: string
      accept: Record<string, string[]>
    }[]
  }

  interface Window {
    showOpenFilePicker?: (
      options?: OpenFilePickerOptions,
    ) => Promise<FileSystemFileHandle[]>
  }
}
