import { ChevronDown, ChevronRight, Folder as FolderIcon, Home } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useFolderChildren } from '@/hooks/useFolderTree'
import { useUI } from '@/stores/uiStore'
import { useTranslation } from 'react-i18next'

interface NodeProps {
  id: number
  name: string
  depth: number
  trail: Set<number>
  activeFolderId: number | null
}

function FolderNode({ id, name, depth, trail, activeFolderId }: NodeProps) {
  const { t } = useTranslation()
  const isExpanded = useUI((s) => s.expandedFolderIds.has(id))
  const toggle = useUI((s) => s.toggleFolderExpanded)

  if (trail.has(id) || depth > 32) return null

  const { data } = useFolderChildren(id, { enabled: isExpanded })

  const nextTrail = new Set(trail)
  nextTrail.add(id)

  // Hide chevron only when we've loaded the data and confirmed there are no subfolders.
  const hasChildren = !data || data.folders.length > 0
  const isActive = id === activeFolderId
  const isRoot = depth === 0

  return (
    <div>
      <div
        style={{ paddingLeft: depth * 14 }}
        className={`group flex items-center gap-0.5 rounded text-sm ${
          isActive
            ? 'bg-accent/10 font-medium text-accent'
            : 'text-ink hover:bg-surface-muted'
        }`}
      >
        {/* Chevron toggle — hidden for root (always visible) */}
        {!isRoot ? (
          <button
            onClick={() => toggle(id)}
            className="flex h-6 w-5 shrink-0 items-center justify-center rounded hover:bg-surface-strong"
            tabIndex={-1}
          >
            {hasChildren
              ? isExpanded
                ? <ChevronDown size={12} />
                : <ChevronRight size={12} />
              : null}
          </button>
        ) : (
          <span className="w-1 shrink-0" />
        )}

        <Link
          to={`/folder/${id}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2"
        >
          {isRoot ? <Home size={14} className="shrink-0" /> : <FolderIcon size={14} className="shrink-0" />}
          <span className="truncate">{name || t('navigation.home')}</span>
        </Link>
      </div>

      {isExpanded &&
        data?.folders.map((f) => (
          <FolderNode
            key={f.id}
            id={f.id}
            name={f.name}
            depth={depth + 1}
            trail={nextTrail}
            activeFolderId={activeFolderId}
          />
        ))}
    </div>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const { id } = useParams()
  const activeFolderId = id ? parseInt(id, 10) : null

  return (
    <aside className="hidden w-64 shrink-0 border-r border-surface-strong bg-surface md:block">
      <nav className="p-2">
        <FolderNode
          id={1}
          name={t('navigation.home')}
          depth={0}
          trail={new Set()}
          activeFolderId={activeFolderId}
        />
      </nav>
    </aside>
  )
}
