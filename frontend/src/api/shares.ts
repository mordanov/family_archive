import { api, apiBase } from './client'
import type { ShareOut, SharePublicMeta } from '@/types/api'

export const sharesApi = {
  list: () => api<ShareOut[]>('/shares'),
  createForFile: (file_id: number, opts: { password?: string; expires_at?: string; max_downloads?: number } = {}) =>
    api<ShareOut>('/shares', { method: 'POST', json: { target_type: 'file', file_id, ...opts } }),
  createForFolder: (folder_id: number, opts: { password?: string; expires_at?: string; max_downloads?: number } = {}) =>
    api<ShareOut>('/shares', { method: 'POST', json: { target_type: 'folder', folder_id, ...opts } }),
  revoke: (id: number) => api<void>(`/shares/${id}`, { method: 'DELETE' }),

  publicMeta: (token: string) => api<SharePublicMeta>(`/shares/${token}`),
  unlock: (token: string, password: string) =>
    api<void>(`/shares/${token}/unlock`, { method: 'POST', json: { password } }),
  publicDownloadUrl: (token: string) => `${apiBase}/shares/${token}/download`,
}

