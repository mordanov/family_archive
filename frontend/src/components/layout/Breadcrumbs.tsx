import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Breadcrumb as B } from '@/types/api'
import { useTranslation } from 'react-i18next'

export function Breadcrumbs({ items }: { items: B[] }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('common.appName')} className="flex items-center gap-1 text-sm text-ink-muted">
      {items.map((b, i) => (
        <span key={b.id} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={14} />}
          <Link
            to={`/folder/${b.id}`}
            className={`rounded px-1 hover:bg-surface-muted ${i === items.length - 1 ? 'font-semibold text-ink' : ''}`}
          >
            {b.name || t('navigation.home')}
          </Link>
        </span>
      ))}
    </nav>
  )
}

