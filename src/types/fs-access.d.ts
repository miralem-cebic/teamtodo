// Ergänzungen zur File System Access API, die in lib.dom noch fehlen (Chromium-only).
type FsPermissionMode = 'read' | 'readwrite';

interface FileSystemHandle {
  queryPermission(descriptor?: { mode?: FsPermissionMode }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode?: FsPermissionMode }): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
}

interface Window {
  showDirectoryPicker?(options?: {
    id?: string;
    mode?: FsPermissionMode;
    startIn?: 'desktop' | 'documents' | 'downloads' | FileSystemHandle;
  }): Promise<FileSystemDirectoryHandle>;
}
