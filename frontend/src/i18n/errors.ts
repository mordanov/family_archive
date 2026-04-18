import type { TFunction } from 'i18next'
import { HttpError } from '@/api/client'

const CODE_TO_KEY: Record<string, string> = {
  not_found: 'backend.notFound',
  unauthorized: 'backend.unauthorized',
  forbidden: 'backend.forbidden',
  conflict: 'backend.conflict',
  validation_error: 'backend.validation',
  invalid_credentials: 'backend.invalidCredentials',
}

const MESSAGE_TO_KEY: Record<string, string> = {
  'Folder not found': 'backend.folderNotFound',
  'File not found': 'backend.fileNotFound',
  'Share not found': 'backend.shareNotFound',
  'Invalid credentials': 'backend.invalidCredentials',
  'Unauthorized': 'backend.unauthorized',
  'Forbidden': 'backend.forbidden',
  'Name already taken in this folder': 'backend.nameAlreadyTaken',
  'A folder with this name already exists here': 'backend.nameAlreadyTaken',
  'Cannot move root': 'backend.cannotMoveRoot',
  'Cannot delete root folder': 'backend.cannotDeleteRoot',
  'Cannot move into itself': 'backend.cannotMoveIntoItself',
  'Cannot move into a descendant': 'backend.cannotMoveIntoDescendant',
  'CSRF token required': 'backend.csrfRequired',
  'CSRF token invalid': 'backend.csrfInvalid',
}

const STATUS_TO_KEY: Record<number, string> = {
  400: 'backend.badRequest',
  401: 'backend.unauthorized',
  403: 'backend.forbidden',
  404: 'backend.notFound',
  409: 'backend.conflict',
  422: 'backend.validation',
  429: 'backend.tooManyRequests',
  500: 'backend.serverError',
  502: 'backend.serverError',
  503: 'backend.serverError',
  504: 'backend.serverError',
}

function hasTranslation(t: TFunction, key: string): boolean {
  return t(key) !== key
}

export function mapErrorToI18n(t: TFunction, error: unknown, fallbackKey = 'system.genericError'): string {
  if (error instanceof HttpError) {
    if (error.code) {
      const byCode = CODE_TO_KEY[error.code.toLowerCase()]
      if (byCode && hasTranslation(t, byCode)) return t(byCode)
    }

    const raw = error.rawMessage?.trim()
    if (raw) {
      const byMessage = MESSAGE_TO_KEY[raw]
      if (byMessage && hasTranslation(t, byMessage)) return t(byMessage)
    }

    const byStatus = STATUS_TO_KEY[error.status]
    if (byStatus && hasTranslation(t, byStatus)) return t(byStatus)

    if (raw) return raw
  }

  if (error instanceof Error && error.message) return error.message

  return t(fallbackKey)
}

