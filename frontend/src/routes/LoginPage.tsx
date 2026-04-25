import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api/auth'
import { mapErrorToI18n } from '@/i18n/errors'
import toast from 'react-hot-toast'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'

export function LoginPage() {
  const { t } = useTranslation()
  const me = useQuery({ queryKey: ['me'], queryFn: authApi.me, retry: false, refetchOnWindowFocus: false })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('remember_me') === 'true')
  const nav = useNavigate()
  const m = useMutation({
    mutationFn: () => { localStorage.setItem('remember_me', String(rememberMe)); return authApi.login(username, password, rememberMe) },
    onSuccess: () => nav('/', { replace: true }),
    onError: (e: unknown) => toast.error(mapErrorToI18n(t, e, 'auth.loginFailed')),
  })

  if (me.data) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-muted p-4">
      <form
        onSubmit={(e) => { e.preventDefault(); m.mutate() }}
        className="w-full max-w-sm rounded-lg border border-surface-strong bg-surface p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="mb-1 text-xl font-semibold">📁 {t('common.appName')}</h1>
            <p className="text-sm text-ink-muted">{t('auth.signInToYourArchive')}</p>
          </div>
          <LanguageSwitcher />
        </div>
        <label className="mb-3 block">
          <span className="text-sm text-ink-muted">{t('auth.username')}</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            className="mt-1 w-full rounded border border-surface-strong px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="mb-5 block">
          <span className="text-sm text-ink-muted">{t('auth.password')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 w-full rounded border border-surface-strong px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="mb-5 flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="shrink-0"
          />
          <span>{t('auth.rememberMe')}</span>
        </label>
        <button
          type="submit"
          disabled={m.isPending}
          className="w-full rounded bg-accent px-3 py-2 text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {m.isPending ? t('auth.signingIn') : t('auth.login')}
        </button>
      </form>
    </div>
  )
}

