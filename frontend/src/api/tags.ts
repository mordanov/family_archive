import { api } from './client'
import type { Tag } from '@/types/api'

export const tagsApi = {
  list: () => api<Tag[]>('/tags'),
  create: (name: string, color?: string) =>
    api<Tag>('/tags', { method: 'POST', json: { name, color } }),
  remove: (id: number) => api<void>(`/tags/${id}`, { method: 'DELETE' }),
}

