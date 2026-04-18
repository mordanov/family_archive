import { Folder as FolderIcon, Home } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useFolderChildren } from '@/hooks/useFolderTree'

function FolderNode({ id, name, depth }: { id: number; name: string; depth: number }) {
  const { data } = useFolderChildren(id)
  return (
    <div>
      <Link
        to={`/folder/${id}`}
        className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-muted"
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {depth === 0 ? <Home size={14} /> : <FolderIcon size={14} />}
        <span className="truncate">{name || 'Home'}</span>
      </Link>
      {data?.folders.map((f) => (
        <FolderNode key={f.id} id={f.id} name={f.name} depth={depth + 1} />
      ))}
    </div>
  )
}

export function Sidebar() {
  const { id } = useParams()
  return (
    <aside className="hidden w-64 shrink-0 border-r border-surface-strong bg-surface md:block">
      <nav className="p-2">
        <FolderNode id={1} name="Home" depth={0} />
      </nav>
    </aside>
  )
}

