import { useFolderChildren } from '@/hooks/useFolderTree'
import { Row } from './FileRow'
import { Loader2, FolderOpen } from 'lucide-react'

export function FileList({ folderId }: { folderId: number }) {
  const { data, isLoading, isError, error } = useFolderChildren(folderId)
  if (isLoading)
    return (
      <div className="flex items-center justify-center p-12 text-ink-muted">
        <Loader2 className="animate-spin" />
      </div>
    )
  if (isError) return <div className="p-6 text-red-600">{(error as Error).message}</div>
  const empty = !data?.folders.length && !data?.files.length
  if (empty)
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-16 text-ink-muted">
        <FolderOpen size={36} />
        <p>This folder is empty.</p>
        <p className="text-xs">Drag files here or use the Upload button.</p>
      </div>
    )
  return (
    <div className="rounded-md border border-surface-strong bg-surface">
      {data!.folders.map((f) => (
        <Row key={`f${f.id}`} kind="folder" item={f} parentId={folderId} />
      ))}
      {data!.files.map((f) => (
        <Row key={`F${f.id}`} kind="file" item={f} parentId={folderId} />
      ))}
    </div>
  )
}

