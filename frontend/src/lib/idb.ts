// IndexedDB persistence for the upload queue (so resume survives page reloads).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface PersistedUpload {
  uploadId: string         // server-side upload id
  folderId: number
  filename: string
  size: number
  contentType: string
  chunkSize: number
  totalParts: number
  receivedParts: number[]  // part numbers persisted as completed
  // Note: the actual File handle cannot be persisted across reloads — the user must
  // re-pick the file. We surface this in the UI as "needs file re-selection".
  createdAt: number
}

interface ArchiveDB extends DBSchema {
  uploads: {
    key: string
    value: PersistedUpload
  }
}

let _db: Promise<IDBPDatabase<ArchiveDB>> | null = null

function getDb() {
  if (!_db) {
    _db = openDB<ArchiveDB>('family-archive', 1, {
      upgrade(db) {
        db.createObjectStore('uploads', { keyPath: 'uploadId' })
      },
    })
  }
  return _db
}

export const uploadsIDB = {
  async put(u: PersistedUpload) { (await getDb()).put('uploads', u) },
  async get(id: string) { return (await getDb()).get('uploads', id) },
  async remove(id: string) { (await getDb()).delete('uploads', id) },
  async all(): Promise<PersistedUpload[]> { return (await getDb()).getAll('uploads') },
}

