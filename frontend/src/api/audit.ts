import { api } from './client'
import type { AuditEntry } from '@/types/api'

export const auditApi = {
  recent: (limit = 100) => api<AuditEntry[]>(`/audit?limit=${limit}`),
}

