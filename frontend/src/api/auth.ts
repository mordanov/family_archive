import { api } from './client'
import type { User } from '@/types/api'

export const authApi = {
  me: () => api<User>('/auth/me'),
}

