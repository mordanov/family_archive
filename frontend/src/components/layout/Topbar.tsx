import { Link, useNavigate } from 'react-router-dom'
import { LogOut, User as UserIcon, Trash2, Archive, Download, LayoutGrid, List } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api/auth'
import { downloadsApi } from '@/api/downloads'
import { useUI } from '@/stores/uiStore'
import { LanguageSwitcher } from './LanguageSwitcher'

export function Topbar() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const qc = useQueryClient()
  const view = useUI((s) => s.viewMode)
  const setView = useUI((s) => s.setViewMode)
  const me = useQuery({ queryKey: ['me'], queryFn: authApi.me, retry: false })
  const downloads = useQuery({
    queryKey: ['downloads'],
    queryFn: () => downloadsApi.list(20),
    refetchInterval: 3000,
    enabled: me.isSuccess,
  })
  const activeCount = downloads.data?.active.length ?? 0
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      qc.clear()
      nav('/', { replace: true })
    },
  })
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-surface-strong/70 bg-surface/80 px-4 backdrop-blur-md">
      <Link to="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white dark:text-canvas"><Archive size={17} /></span>
        {t('common.appName')}
      </Link>
      <div className="flex items-center gap-3">
        <div className="segmented hidden md:inline-flex">
          <button data-active={view === 'list'} className="inline-flex items-center gap-1" onClick={() => setView('list')}>
            <List size={14} />{t('navigation.list')}
          </button>
          <button data-active={view === 'grid'} className="inline-flex items-center gap-1" onClick={() => setView('grid')}>
            <LayoutGrid size={14} />{t('navigation.grid')}
          </button>
        </div>
        <Link
          to="/downloads"
          className="relative rounded p-2 text-ink-muted hover:bg-surface-muted"
          title={t('navigation.downloads')}
        >
          <Download size={18} />
          {activeCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </Link>
        <Link to="/trash" className="rounded p-2 text-ink-muted hover:bg-surface-muted" title={t('navigation.trash')}>
          <Trash2 size={18} />
        </Link>
        <LanguageSwitcher />
        <span className="hidden items-center gap-1 text-sm text-ink-muted md:flex">
          <UserIcon size={16} />
        </span>
        <button
          onClick={() => logout.mutate()}
          className="icon-btn"
          title={t('auth.logout')}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}



