import { api } from './client'
import type { User } from '@/types/api'

export const authApi = {
  me: () => api<User>('/auth/me'),
  login: (username: string, password: string, rememberMe = false) =>
    api<void>('/auth/login', { method: 'POST', json: { username, password, remember_me: rememberMe } }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
}

