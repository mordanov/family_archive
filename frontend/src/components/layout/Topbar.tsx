import { Link, useNavigate } from 'react-router-dom'
import { LogOut, User as UserIcon, Trash2 } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api/auth'
import { useUI } from '@/stores/uiStore'
import { LanguageSwitcher } from './LanguageSwitcher'

export function Topbar() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const view = useUI((s) => s.viewMode)
  const setView = useUI((s) => s.setViewMode)
  const me = useQuery({ queryKey: ['me'], queryFn: authApi.me, retry: false })
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => nav('/login', { replace: true }),
  })
  return (
    <header className="flex h-12 items-center justify-between border-b border-surface-strong bg-surface px-4">
      <Link to="/" className="text-base font-semibold text-ink">📁 {t('common.appName')}</Link>
      <div className="flex items-center gap-3">
        <div className="hidden items-center rounded border border-surface-strong text-xs md:flex">
          <button
            className={`px-2 py-1 ${view === 'list' ? 'bg-surface-strong' : ''}`}
            onClick={() => setView('list')}
          >{t('navigation.list')}</button>
          <button
            className={`px-2 py-1 ${view === 'grid' ? 'bg-surface-strong' : ''}`}
            onClick={() => setView('grid')}
          >{t('navigation.grid')}</button>
        </div>
        <Link to="/trash" className="rounded p-2 text-ink-muted hover:bg-surface-muted" title={t('navigation.trash')}>
          <Trash2 size={18} />
        </Link>
        <LanguageSwitcher />
        <span className="hidden items-center gap-1 text-sm text-ink-muted md:flex">
          <UserIcon size={16} /> {me.data?.username ?? '…'}
        </span>
        <button
          onClick={() => logout.mutate()}
          className="flex items-center gap-1 rounded p-2 text-ink-muted hover:bg-surface-muted"
          title={t('auth.logout')}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}



