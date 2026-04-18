import { api } from './client'
import type { UploadServerState } from '@/types/api'

export const uploadsApi = {
  init: (folder_id: number, filename: string, size_bytes: number, content_type: string) =>
    api<UploadServerState>('/uploads', {
      method: 'POST',
      json: { folder_id, filename, size_bytes, content_type },
    }),
  info: (id: string) => api<UploadServerState>(`/uploads/${id}`),
  putPart: (id: string, partNumber: number, body: Blob, signal?: AbortSignal) =>
    fetch(`/api/v1/uploads/${id}/parts/${partNumber}`, {
      method: 'PUT',
      headers: { 'X-Requested-With': 'fetch', 'Content-Type': 'application/octet-stream' },
      credentials: 'include',
      body,
      signal,
    }).then(async (r) => {
      if (!r.ok) throw new Error(`part ${partNumber}: HTTP ${r.status}`)
      return (await r.json()) as { part_number: number; size: number; etag: string }
    }),
  complete: (id: string) =>
    api<{ file: import('@/types/api').FileItem }>(`/uploads/${id}/complete`, { method: 'POST' }),
  abort: (id: string) => api<void>(`/uploads/${id}`, { method: 'DELETE' }),
}

