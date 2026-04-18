// Upload queue store. Each item has its own state machine and can be paused/resumed.
import { create } from 'zustand'
import { uploadsApi } from '@/api/uploads'
import { uploadsIDB } from '@/lib/idb'
import { chunksOf } from '@/lib/chunking'

export type UploadStatus =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'completing'
  | 'done'
  | 'error'

export interface UploadItem {
  localId: string         // uuid generated client-side for UI keying
  uploadId?: string       // server upload id (after init)
  file: File | null       // null when restored from IDB without re-pick
  folderId: number
  filename: string
  size: number
  contentType: string
  chunkSize: number
  totalParts: number
  uploadedParts: number   // count
  bytesUploaded: number
  status: UploadStatus
  error?: string
  ctrl?: AbortController  // current in-flight controller
}

interface UploadStore {
  items: Record<string, UploadItem>
  add: (file: File, folderId: number) => Promise<void>
  start: (localId: string) => Promise<void>
  pause: (localId: string) => void
  resume: (localId: string) => Promise<void>
  remove: (localId: string) => Promise<void>
  attachFile: (localId: string, file: File) => void
}

const newId = () =>
  // Browser crypto-safe random id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (crypto as any).randomUUID?.() ?? Math.random().toString(36).slice(2)

export const useUploads = create<UploadStore>((set, get) => ({
  items: {},

  async add(file, folderId) {
    const localId = newId()
    set((s) => ({
      items: {
        ...s.items,
        [localId]: {
          localId,
          file,
          folderId,
          filename: file.name,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
          chunkSize: 0,
          totalParts: 0,
          uploadedParts: 0,
          bytesUploaded: 0,
          status: 'queued',
        },
      },
    }))
    await get().start(localId)
  },

  async start(localId) {
    const item = get().items[localId]
    if (!item || !item.file) return
    set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], status: 'preparing' } } }))
    try {
      const init = await uploadsApi.init(item.folderId, item.filename, item.size, item.contentType)
      const persisted = {
        uploadId: init.id,
        folderId: item.folderId,
        filename: item.filename,
        size: item.size,
        contentType: item.contentType,
        chunkSize: init.chunk_size,
        totalParts: init.total_parts,
        receivedParts: init.parts.map((p) => p.part_number),
        createdAt: Date.now(),
      }
      await uploadsIDB.put(persisted)
      set((s) => ({
        items: {
          ...s.items,
          [localId]: {
            ...s.items[localId],
            uploadId: init.id,
            chunkSize: init.chunk_size,
            totalParts: init.total_parts,
            uploadedParts: init.parts.length,
            bytesUploaded: init.parts.reduce((a, p) => a + p.size, 0),
            status: 'uploading',
          },
        },
      }))
      await runUploadLoop(localId, set, get)
    } catch (e) {
      set((s) => ({
        items: { ...s.items, [localId]: { ...s.items[localId], status: 'error', error: String(e) } },
      }))
    }
  },

  pause(localId) {
    const item = get().items[localId]
    item?.ctrl?.abort()
    set((s) =>
      s.items[localId]
        ? { items: { ...s.items, [localId]: { ...s.items[localId], status: 'paused', ctrl: undefined } } }
        : s,
    )
  },

  async resume(localId) {
    const item = get().items[localId]
    if (!item || !item.file || !item.uploadId) return
    // refresh server-side parts
    const info = await uploadsApi.info(item.uploadId)
    set((s) => ({
      items: {
        ...s.items,
        [localId]: {
          ...s.items[localId],
          uploadedParts: info.parts.length,
          bytesUploaded: info.parts.reduce((a, p) => a + p.size, 0),
          status: 'uploading',
        },
      },
    }))
    await runUploadLoop(localId, set, get)
  },

  async remove(localId) {
    const item = get().items[localId]
    item?.ctrl?.abort()
    if (item?.uploadId && item.status !== 'done') {
      try { await uploadsApi.abort(item.uploadId) } catch { /* ignore */ }
      try { await uploadsIDB.remove(item.uploadId) } catch { /* ignore */ }
    }
    set((s) => {
      const { [localId]: _, ...rest } = s.items
      return { items: rest }
    })
  },

  attachFile(localId, file) {
    set((s) =>
      s.items[localId]
        ? { items: { ...s.items, [localId]: { ...s.items[localId], file } } }
        : s,
    )
  },
}))

async function runUploadLoop(
  localId: string,
  set: (fn: (s: { items: Record<string, UploadItem> }) => Partial<{ items: Record<string, UploadItem> }>) => void,
  get: () => { items: Record<string, UploadItem> },
) {
  const item = get().items[localId]
  if (!item || !item.file || !item.uploadId) return
  const file = item.file
  const all = chunksOf(file, item.chunkSize)
  // Determine which parts still need to be sent
  const persisted = await uploadsIDB.get(item.uploadId)
  const have = new Set<number>(persisted?.receivedParts ?? [])
  const todo = all.filter((c) => !have.has(c.partNumber))

  for (const c of todo) {
    if (get().items[localId]?.status !== 'uploading') return // paused/removed
    const ctrl = new AbortController()
    set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], ctrl } } }))
    try {
      const blob = file.slice(c.start, c.end)
      await uploadsApi.putPart(item.uploadId, c.partNumber, blob, ctrl.signal)
      have.add(c.partNumber)
      const persisted2 = (await uploadsIDB.get(item.uploadId)) ?? persisted!
      persisted2.receivedParts = [...have]
      await uploadsIDB.put(persisted2)
      set((s) => ({
        items: {
          ...s.items,
          [localId]: {
            ...s.items[localId],
            uploadedParts: have.size,
            bytesUploaded: s.items[localId].bytesUploaded + (c.end - c.start),
          },
        },
      }))
    } catch (e) {
      // Aborted = pause; other = error
      const cur = get().items[localId]
      if (cur?.status !== 'uploading') return
      set((s) => ({
        items: { ...s.items, [localId]: { ...s.items[localId], status: 'error', error: String(e), ctrl: undefined } },
      }))
      return
    }
  }

  // Complete
  set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], status: 'completing', ctrl: undefined } } }))
  try {
    await uploadsApi.complete(item.uploadId)
    await uploadsIDB.remove(item.uploadId)
    set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], status: 'done' } } }))
  } catch (e) {
    set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], status: 'error', error: String(e) } } }))
  }
}

// Hydrate previously persisted uploads on app load.
export async function hydrateUploadsFromIDB() {
  const all = await uploadsIDB.all()
  if (!all.length) return
  useUploads.setState((s) => {
    const items = { ...s.items }
    for (const p of all) {
      const localId = p.uploadId
      items[localId] = {
        localId,
        uploadId: p.uploadId,
        file: null,
        folderId: p.folderId,
        filename: p.filename,
        size: p.size,
        contentType: p.contentType,
        chunkSize: p.chunkSize,
        totalParts: p.totalParts,
        uploadedParts: p.receivedParts.length,
        bytesUploaded: 0, // unknown without parts api; refreshed on resume
        status: 'paused',
      }
    }
    return { items }
  })
}

