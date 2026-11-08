import { api } from './client'
import type { DownloadsOverview } from '@/types/api'

export const downloadsApi = {
  list: (limit = 100) => api<DownloadsOverview>(`/downloads?limit=${limit}`),
}
