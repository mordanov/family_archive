import { api, apiBase } from './client'
import type { FileItem, ZipEntry } from '@/types/api'

export const filesApi = {
  get: (id: number) => api<FileItem>(`/files/${id}`),
  rename: (id: number, name: string) =>
    api<FileItem>(`/files/${id}`, { method: 'PATCH', json: { name } }),
  move: (id: number, folder_id: number) =>
    api<FileItem>(`/files/${id}`, { method: 'PATCH', json: { folder_id } }),
  remove: (id: number) => api<void>(`/files/${id}`, { method: 'DELETE' }),

  rawUrl: (id: number) => `${apiBase}/files/${id}/raw`,
  downloadUrl: (id: number) => `${apiBase}/files/${id}/download`,
  thumbnailUrl: (id: number, size: 256 | 1024 = 256) =>
    `${apiBase}/files/${id}/thumbnail?size=${size}`,
  posterUrl: (id: number) => `${apiBase}/files/${id}/poster`,

  audioMeta: (id: number) => api<Record<string, unknown>>(`/files/${id}/audio-meta`),

  zipEntries: (id: number) => api<ZipEntry[]>(`/files/${id}/zip/entries`),
  zipEntryUrl: (id: number, path: string) =>
    `${apiBase}/files/${id}/zip/entry?path=${encodeURIComponent(path)}`,

  attachTag: (file_id: number, tag_id: number) =>
    api<void>(`/files/${file_id}/tags/${tag_id}`, { method: 'POST' }),
  detachTag: (file_id: number, tag_id: number) =>
    api<void>(`/files/${file_id}/tags/${tag_id}`, { method: 'DELETE' }),
}

