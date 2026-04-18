// Tiny fetch wrapper. Sends cookies, applies CSRF header, normalizes errors.
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

type Init = Omit<RequestInit, 'body'> & {
  body?: BodyInit | object | null
  json?: unknown
}

export async function api<T = unknown>(path: string, init: Init = {}): Promise<T> {
  const headers = new Headers(init.headers as HeadersInit)
  const method = (init.method || 'GET').toUpperCase()
  const isMutation = method !== 'GET' && method !== 'HEAD'
  if (isMutation) headers.set('X-Requested-With', 'fetch')

  let body: BodyInit | null | undefined = init.body as BodyInit | null | undefined
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(init.json)
  }

  const r = await fetch(BASE + path, { ...init, headers, body, credentials: 'include' })
  if (!r.ok) {
    let errBody: ApiError | string
    try {
      const j = await r.json()
      errBody = j.detail ?? j
    } catch {
      errBody = await r.text()
    }
    throw new HttpError(r.status, errBody)
  }
  if (r.status === 204) return undefined as T
  const ct = r.headers.get('content-type') || ''
  if (ct.includes('application/json')) return (await r.json()) as T
  return (await r.text()) as unknown as T
}

export const apiBase = BASE

