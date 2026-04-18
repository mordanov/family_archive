import { api } from './client'
import type { FileItem, Folder } from '@/types/api'

export const trashApi = {
  list: () => api<{ folders: Folder[]; files: FileItem[] }>('/trash'),
  restoreFile: (id: number) => api<FileItem>(`/trash/files/${id}/restore`, { method: 'POST' }),
  restoreFolder: (id: number) => api<Folder>(`/trash/folders/${id}/restore`, { method: 'POST' }),
  empty: () => api<void>('/trash', { method: 'DELETE' }),
}

