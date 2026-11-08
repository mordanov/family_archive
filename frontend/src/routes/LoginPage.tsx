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
    <div className="flex min-h-screen items-center justify-center bg-canvas bg-[radial-gradient(60%_50%_at_50%_0%,rgb(var(--accent)/.18),transparent)] p-4">
      <form
        className="w-full max-w-sm animate-pop space-y-5 rounded-xl2 border border-surface-strong bg-surface p-8 shadow-lift"
        onSubmit={(e) => { e.preventDefault(); login.mutate() }}
      >
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t('common.appName')}</h1>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="space-y-1">
          <label className="text-sm text-ink-muted">{t('auth.username')}</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-ink-muted">{t('auth.password')}</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button
          type="submit"
          disabled={login.isPending}
          className="btn-primary w-full py-2.5"
        >
          {login.isPending ? t('common.loading') : t('auth.login')}
        </button>
      </form>
    </div>
  )
}
