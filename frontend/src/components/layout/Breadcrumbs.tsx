import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Breadcrumb as B } from '@/types/api'

export function Breadcrumbs({ items }: { items: B[] }) {
  return (
    <nav aria-label="Breadcrumbs" className="flex items-center gap-1 text-sm text-ink-muted">
      {items.map((b, i) => (
        <span key={b.id} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={14} />}
          <Link
            to={`/folder/${b.id}`}
            className={`rounded px-1 hover:bg-surface-muted ${i === items.length - 1 ? 'font-semibold text-ink' : ''}`}
          >
            {b.name || 'Home'}
          </Link>
        </span>
      ))}
    </nav>
  )
}

