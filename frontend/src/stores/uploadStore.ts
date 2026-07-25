// Upload queue store. Each item has its own state machine and can be paused/resumed.
import { create } from 'zustand'
import { uploadsApi } from '@/api/uploads'
import { uploadsIDB } from '@/lib/idb'
import { chunksOf } from '@/lib/chunking'

const MAX_CONCURRENT = 10
const DONE_REMOVAL_DELAY_MS = 3000
const MAX_PART_RETRIES = 3
const RETRY_DELAY_BASE_MS = 2000

function isRetryable(e: unknown): boolean {
  if (e instanceof TypeError) return true  // "Failed to fetch" — network error
  if (e instanceof Error && /HTTP 5\d\d/.test(e.message)) return true
  return false
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason) }, { once: true })
  })
}

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
  add: (file: File, folderId: number) => void
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

export const useUploads = create<UploadStore>((set, get) => {
  function scheduleNext() {
    const items = Object.values(get().items)
    const active = items.filter(
      (i) => i.status === 'preparing' || i.status === 'uploading' || i.status === 'completing',
    ).length
    if (active >= MAX_CONCURRENT) return
    const next = items.find((i) => i.status === 'queued')
    if (next) get().start(next.localId)
  }

  return {
    items: {},

    add(file, folderId) {
      const already = Object.values(get().items).some(
        (i) => i.folderId === folderId && i.filename === file.name,
      )
      if (already) return
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
      scheduleNext()
    },

    async start(localId) {
      const item = get().items[localId]
      if (!item || !item.file) return
      set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], status: 'preparing' } } }))
      try {
        const resp = await uploadsApi.init(item.folderId, item.filename, item.size, item.contentType)
        if (resp.action === 'skipped') {
          set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], status: 'done' } } }))
          return
        }
        const init = resp.upload!
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
      } finally {
        scheduleNext()
        // Auto-remove successfully completed items after a short delay
        if (get().items[localId]?.status === 'done') {
          setTimeout(() => {
            if (get().items[localId]?.status === 'done') {
              set((s) => {
                const { [localId]: _, ...rest } = s.items
                return { items: rest }
              })
            }
          }, DONE_REMOVAL_DELAY_MS)
        }
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
      scheduleNext()
    },

    attachFile(localId, file) {
      set((s) =>
        s.items[localId]
          ? { items: { ...s.items, [localId]: { ...s.items[localId], file } } }
          : s,
      )
    },
  }
})

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

    let lastErr: unknown
    let uploaded = false
    for (let attempt = 0; attempt <= MAX_PART_RETRIES; attempt++) {
      if (get().items[localId]?.status !== 'uploading') return
      if (attempt > 0) {
        set((s) => ({
          items: { ...s.items, [localId]: { ...s.items[localId], error: `Retrying part ${c.partNumber} (${attempt}/${MAX_PART_RETRIES})…` } },
        }))
        try { await sleep(RETRY_DELAY_BASE_MS * attempt, ctrl.signal) } catch { return }
        if (get().items[localId]?.status !== 'uploading') return
      }
      try {
        const blob = file.slice(c.start, c.end)
        await uploadsApi.putPart(item.uploadId, c.partNumber, blob, ctrl.signal)
        uploaded = true
        break
      } catch (e) {
        if (get().items[localId]?.status !== 'uploading') return // aborted/paused
        if (!isRetryable(e) || attempt === MAX_PART_RETRIES) { lastErr = e; break }
        lastErr = e
      }
    }

    if (!uploaded) {
      set((s) => ({
        items: { ...s.items, [localId]: { ...s.items[localId], status: 'error', error: String(lastErr), ctrl: undefined } },
      }))
      return
    }

    // Clear retry message once part succeeds
    set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], error: undefined } } }))
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
  }

  // Complete — retry on transient errors
  set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], status: 'completing', ctrl: undefined } } }))
  let completeErr: unknown
  for (let attempt = 0; attempt <= MAX_PART_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_BASE_MS * attempt))
    }
    try {
      await uploadsApi.complete(item.uploadId)
      await uploadsIDB.remove(item.uploadId)
      set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], status: 'done' } } }))
      completeErr = undefined
      break
    } catch (e) {
      if (!isRetryable(e) || attempt === MAX_PART_RETRIES) { completeErr = e; break }
    }
  }
  if (completeErr !== undefined) {
    set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], status: 'error', error: String(completeErr) } } }))
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

