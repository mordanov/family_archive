import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { HttpError } from '@/api/client'

export function LoginPage() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const login = useMutation({
    mutationFn: () => authApi.login(username, password),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
      nav(params.get('redirect') || '/folder/1', { replace: true })
    },
    onError: (e) => {
      setError(e instanceof HttpError && e.status === 401 ? t('backend.invalidCredentials') : t('common.error'))
    },
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <form
        className="w-full max-w-sm space-y-4 rounded border border-surface-strong bg-surface p-8"
        onSubmit={(e) => { e.preventDefault(); login.mutate() }}
      >
        <h1 className="text-lg font-semibold text-ink">📁 {t('common.appName')}</h1>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="space-y-1">
          <label className="text-sm text-ink-muted">{t('auth.username')}</label>
          <input
            className="w-full rounded border border-surface-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-ink-muted">{t('auth.password')}</label>
          <input
            type="password"
            className="w-full rounded border border-surface-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded bg-ink px-4 py-2 text-sm text-surface disabled:opacity-50"
        >
          {login.isPending ? t('common.loading') : t('auth.login')}
        </button>
      </form>
    </div>
  )
}
