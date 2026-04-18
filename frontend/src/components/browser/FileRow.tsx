import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Folder as FolderIcon, FileIcon, Image as ImgIcon, Video, Music, FileArchive, MoreVertical, Pencil, Share2, Trash2 } from 'lucide-react'
import type { FileItem, Folder } from '@/types/api'
import { formatBytes, formatDate } from '@/lib/formatters'
import { classifyMime } from '@/lib/mime'
import { filesApi } from '@/api/files'
import { foldersApi } from '@/api/folders'
import { useUI } from '@/stores/uiStore'
import { useSelection } from '@/stores/selectionStore'
import toast from 'react-hot-toast'

function kindIcon(file: FileItem) {
  const k = classifyMime(file.content_type, file.name)
  const cls = 'shrink-0 text-ink-muted'
  if (k === 'image') return <ImgIcon size={18} className={cls} />
  if (k === 'video') return <Video size={18} className={cls} />
  if (k === 'audio') return <Music size={18} className={cls} />
  if (k === 'zip') return <FileArchive size={18} className={cls} />
  return <FileIcon size={18} className={cls} />
}

interface RowProps {
  kind: 'folder' | 'file'
  item: Folder | FileItem
  parentId: number
}

export function Row({ kind, item, parentId }: RowProps) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const setRename = useUI((s) => s.setRenameTarget)
  const setShare = useUI((s) => s.setShareTarget)
  const setPreview = useUI((s) => s.setPreviewFileId)
  const sel = useSelection()
  const isFolder = kind === 'folder'
  const isSelected = isFolder
    ? sel.folders.has(item.id)
    : sel.files.has(item.id)

  const removeMut = useMutation({
    mutationFn: () => (isFolder ? foldersApi.remove(item.id) : filesApi.remove(item.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folder-children', parentId] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const onDoubleClick = () => {
    if (isFolder) nav(`/folder/${item.id}`)
    else setPreview(item.id)
  }

  const file = !isFolder ? (item as FileItem) : null
  const showThumb = file && file.has_thumbnail
  const isImage = file && classifyMime(file.content_type, file.name) === 'image'

  return (
    <div
      tabIndex={0}
      onClick={() => (isFolder ? sel.toggleFolder(item.id) : sel.toggleFile(item.id))}
      onDoubleClick={onDoubleClick}
      className={`group flex items-center gap-3 border-b border-surface-strong px-3 py-2 outline-none hover:bg-surface ${isSelected ? 'bg-accent/10' : ''}`}
    >
      {/* Icon / thumb */}
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-surface-muted">
        {showThumb && isImage ? (
          <img src={filesApi.thumbnailUrl(file!.id, 256)} alt="" className="h-full w-full object-cover" />
        ) : isFolder ? (
          <div className="flex h-full w-full items-center justify-center"><FolderIcon size={20} className="text-ink-muted" /></div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">{kindIcon(file!)}</div>
        )}
      </div>

      {/* Name */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink">{item.name || 'Home'}</div>
        <div className="truncate text-xs text-ink-muted">
          {isFolder ? 'Folder' : `${formatBytes((item as FileItem).size_bytes)} • ${(item as FileItem).content_type}`}
        </div>
      </div>

      {/* Date */}
      <div className="hidden w-32 shrink-0 text-xs text-ink-muted sm:block">{formatDate(item.updated_at)}</div>

      {/* Actions */}
      <div className="ml-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          className="rounded p-1.5 text-ink-muted hover:bg-surface-strong"
          title="Rename"
          onClick={(e) => { e.stopPropagation(); setRename({ kind, item }) }}
        ><Pencil size={15} /></button>
        <button
          className="rounded p-1.5 text-ink-muted hover:bg-surface-strong"
          title="Share"
          onClick={(e) => { e.stopPropagation(); setShare({ kind, id: item.id, name: item.name }) }}
        ><Share2 size={15} /></button>
        <button
          className="rounded p-1.5 text-red-600 hover:bg-red-50"
          title="Delete"
          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${item.name}?`)) removeMut.mutate() }}
        ><Trash2 size={15} /></button>
      </div>
    </div>
  )
}

