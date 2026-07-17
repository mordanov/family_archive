import { api } from './client'
import type { User } from '@/types/api'

export const authApi = {
  me: () => api<User>('/auth/me'),
  login: (username: string, password: string) =>
    api('/auth/login', { method: 'POST', json: { username, password } }),
  logout: () => api('/auth/logout', { method: 'POST' }),
}

