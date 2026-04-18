import { api } from './client'
import type { Folder, FolderDetail, FolderListing } from '@/types/api'

export const foldersApi = {
  detail: (id: number) => api<FolderDetail>(`/folders/${id}`),
  children: (id: number) => api<FolderListing>(`/folders/${id}/children`),
  create: (parent_id: number, name: string) =>
    api<Folder>('/folders', { method: 'POST', json: { parent_id, name } }),
  rename: (id: number, name: string) =>
    api<Folder>(`/folders/${id}`, { method: 'PATCH', json: { name } }),
  move: (id: number, parent_id: number) =>
    api<Folder>(`/folders/${id}`, { method: 'PATCH', json: { parent_id } }),
  remove: (id: number) => api<void>(`/folders/${id}`, { method: 'DELETE' }),
}

