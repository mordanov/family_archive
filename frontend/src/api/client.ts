// Tiny fetch wrapper. Sends Authorization Bearer token, normalizes errors.
import type { ApiError } from '@/types/api'

const BASE = '/api/v1'

export class HttpError extends Error {
  status: number
  body: ApiError | string
  code?: string
  rawMessage: string
  constructor(status: number, body: ApiError | string) {
    const message = typeof body === 'string' ? body : body.message
    super(message)
    this.status = status
    this.body = body
    this.code = typeof body === 'string' ? undefined : body.code
    this.rawMessage = message
  }
}

/** Decode the exp claim from a JWT without verifying the signature (UI-only). */
function getTokenExp(token: string): number {
  try { return JSON.parse(atob(token.split('.')[1])).exp } catch { return 0 }
}

let redirecting = false

/** Redirect the browser to the auth service login page, preserving current URL. */
function redirectToAuth(): void {
  if (redirecting) return
  redirecting = true
  const authUrl = import.meta.env.VITE_AUTH_URL || 'http://localhost:3000'
  window.location.replace(
    `${authUrl}/auth/login?redirect_after=${encodeURIComponent(window.location.href)}`
  )
}

type Init = Omit<RequestInit, 'body'> & {
  body?: BodyInit | object | null
  json?: unknown
}

export async function api<T = unknown>(path: string, init: Init = {}): Promise<T> {
  const headers = new Headers(init.headers as HeadersInit)
  const method = (init.method || 'GET').toUpperCase()
  const isMutation = method !== 'GET' && method !== 'HEAD'
  if (isMutation) headers.set('X-Requested-With', 'fetch')

  const token = localStorage.getItem('access_token')
  if (token) {
    // Proactively redirect before the request fires if the token expires in < 60 s
    if (getTokenExp(token) - Date.now() / 1000 < 60) {
      redirectToAuth()
      return Promise.reject(new Error('token_expired')) as Promise<T>
    }
    headers.set('Authorization', `Bearer ${token}`)
  }

  let body: BodyInit | null | undefined = init.body as BodyInit | null | undefined
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(init.json)
  }

  const r = await fetch(BASE + path, { ...init, headers, body })
  if (!r.ok) {
    if (r.status === 401) {
      localStorage.removeItem('access_token')
      redirectToAuth()
    }
    const text = await r.text()
    let errBody: ApiError | string
    try {
      const j = JSON.parse(text)
      errBody = j.detail ?? j
    } catch {
      errBody = text
    }
    throw new HttpError(r.status, errBody)
  }
  if (r.status === 204) return undefined as T
  const ct = r.headers.get('content-type') || ''
  if (ct.includes('application/json')) return (await r.json()) as T
  return (await r.text()) as unknown as T
}

export const apiBase = BASE

