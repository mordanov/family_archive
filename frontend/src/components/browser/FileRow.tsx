import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Folder as FolderIcon, FileIcon, Image as ImgIcon, Video, Music, FileArchive, Pencil, Share2, Trash2 } from 'lucide-react'
import type { FileItem, Folder } from '@/types/api'
import { formatBytes, formatDate } from '@/lib/formatters'
import { classifyMime } from '@/lib/mime'
import { mapErrorToI18n } from '@/i18n/errors'
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
  viewMode: 'list' | 'grid'
  showFileCheckbox?: boolean
  showFolderCheckbox?: boolean
}

export function Row({ kind, item, parentId, viewMode, showFileCheckbox = false, showFolderCheckbox = false }: RowProps) {
  const { t } = useTranslation()
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
    onError: (e: unknown) => toast.error(mapErrorToI18n(t, e)),
  })

  const onDoubleClick = () => {
    if (isFolder) nav(`/folder/${item.id}`)
    else setPreview(item.id)
  }

  const file = !isFolder ? (item as FileItem) : null
  const showThumb = file && file.has_thumbnail
  const isImage = file && classifyMime(file.content_type, file.name) === 'image'
  const showCheckbox = (isFolder && showFolderCheckbox) || (!isFolder && showFileCheckbox)

  const isGrid = viewMode === 'grid'
  const actionSlotClass = isGrid
    ? 'mt-2 flex w-full items-center justify-end gap-1'
    : 'ml-2 flex w-[108px] shrink-0 items-center justify-end gap-1'
  const actionVisibilityClass = isGrid
    ? 'opacity-100'
    : 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'

  return (
    <div
      tabIndex={0}
      onClick={() => (isFolder ? sel.toggleFolder(item.id) : sel.toggleFile(item.id))}
      onDoubleClick={onDoubleClick}
      className={`group outline-none hover:bg-surface ${isSelected ? 'bg-accent/10' : ''} ${
        isGrid
          ? 'rounded-md border border-surface-strong bg-surface p-3'
          : 'flex items-center gap-3 border-b border-surface-strong px-3 py-2'
      }`}
    >
      <div
        className={`flex h-6 w-6 items-center justify-center ${isGrid ? 'mb-2' : 'shrink-0'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {showCheckbox ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              if (isFolder) sel.setFolderSelected(item.id, e.target.checked)
              else sel.setFileSelected(item.id, e.target.checked)
            }}
            aria-label={t('file.select')}
          />
        ) : (
          <span aria-hidden="true" className="block h-4 w-4" />
        )}
      </div>

      {/* Icon / thumb */}
      <div className={`overflow-hidden rounded bg-surface-muted ${isGrid ? 'mb-2 h-28 w-full' : 'h-9 w-9 shrink-0'}`}>
        {showThumb && isImage ? (
          <img src={filesApi.thumbnailUrl(file!.id, 256)} alt="" className="h-full w-full object-cover" />
        ) : isFolder ? (
          <div className="flex h-full w-full items-center justify-center"><FolderIcon size={20} className="text-ink-muted" /></div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">{kindIcon(file!)}</div>
        )}
      </div>

      {/* Name */}
      <div className={`min-w-0 ${isGrid ? '' : 'flex-1'}`}>
        <div className="truncate text-sm text-ink">{item.name || t('navigation.home')}</div>
        <div className="truncate text-xs text-ink-muted">
          {isFolder ? t('folder.typeLabel') : `${formatBytes((item as FileItem).size_bytes)} • ${(item as FileItem).content_type}`}
        </div>
      </div>

      {/* Date */}
      <div className={`${isGrid ? 'mt-1 text-xs text-ink-muted' : 'hidden w-32 shrink-0 text-xs text-ink-muted sm:block'}`}>{formatDate(item.updated_at)}</div>

      {/* Actions */}
      <div className={`${actionSlotClass} ${actionVisibilityClass}`}>
        <button
          className="rounded p-1.5 text-ink-muted hover:bg-surface-strong"
          title={t('folder.rename')}
          onClick={(e) => { e.stopPropagation(); setRename({ kind, item }) }}
        ><Pencil size={15} /></button>
        <button
          className="rounded p-1.5 text-ink-muted hover:bg-surface-strong"
          title={t('share.share')}
          onClick={(e) => { e.stopPropagation(); setShare({ kind, id: item.id, name: item.name }) }}
        ><Share2 size={15} /></button>
        <button
          className="rounded p-1.5 text-red-600 hover:bg-red-50"
          title={t('common.delete')}
          onClick={(e) => { e.stopPropagation(); if (confirm(t('folder.deleteConfirm', { name: item.name }))) removeMut.mutate() }}
        ><Trash2 size={15} /></button>
      </div>
    </div>
  )
}

