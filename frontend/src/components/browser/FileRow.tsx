import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Folder as FolderIcon, FileIcon, Image as ImgIcon, Video, Music, FileArchive, Pencil, Share2, Trash2, SlidersHorizontal } from 'lucide-react'
import type { FileItem, Folder } from '@/types/api'
import { formatBytes, formatDate } from '@/lib/formatters'
import { classifyMime } from '@/lib/mime'
import { copyAsync, quickFileLink, quickFolderLinks } from '@/lib/quickShare'
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
  onVisibleFile?: (file: FileItem) => void
}

export function Row({ kind, item, parentId, viewMode, showFileCheckbox = false, showFolderCheckbox = false, onVisibleFile }: RowProps) {
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

  const quickShare = async () => {
    try {
      if (isFolder) {
        let count = 0
        await copyAsync(quickFolderLinks(item.id).then((r) => { count = r.count; return r.text }))
        if (!count) toast(t('share.folderEmpty'))
        else toast.success(t('share.folderLinksCopied', { count }))
      } else {
        await copyAsync(quickFileLink(item.id))
        toast.success(t('share.fileLinkCopied'))
      }
    } catch (e) {
      toast.error(mapErrorToI18n(t, e))
    }
  }

  const isGrid = viewMode === 'grid'
  const [thumbFailed, setThumbFailed] = useState(false)
  const actionSlotClass = isGrid
    ? 'absolute right-2 top-2 flex items-center gap-0.5 rounded-xl bg-surface/90 p-0.5 opacity-0 shadow-card backdrop-blur transition group-hover:opacity-100 group-focus-within:opacity-100'
    : 'ml-2 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100'
  const showCheckbox = isFolder ? showFolderCheckbox : showFileCheckbox
  const file = isFolder ? null : (item as FileItem)
  const fileKind = file ? classifyMime(file.content_type, file.name) : 'other'
  const rowRef = useRef<HTMLDivElement | null>(null)
  const notifiedVisibleRef = useRef(false)
  const canShowThumbnail = Boolean(isGrid && file && file.has_thumbnail && (fileKind === 'image' || fileKind === 'video') && !thumbFailed)

  useEffect(() => {
    if (!onVisibleFile || !isGrid || !file || (fileKind !== 'image' && fileKind !== 'video')) {
      return
    }
    if (!rowRef.current || notifiedVisibleRef.current) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting)
        if (visible && !notifiedVisibleRef.current) {
          notifiedVisibleRef.current = true
          onVisibleFile(file)
          observer.disconnect()
        }
      },
      { rootMargin: '200px 0px' },
    )
    observer.observe(rowRef.current)

    return () => observer.disconnect()
  }, [file, fileKind, isGrid, onVisibleFile])

  const checkboxVisible = isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'

  return (
    <div
      ref={rowRef}
      tabIndex={0}
      onDoubleClick={onDoubleClick}
      className={`group relative outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
        isGrid
          ? `rounded-xl2 border bg-surface p-2.5 shadow-card hover:-translate-y-0.5 hover:shadow-lift ${isSelected ? 'border-accent ring-2 ring-accent/30' : 'border-surface-strong'}`
          : `flex items-center gap-3 border-b border-surface-strong px-3 py-2 first:rounded-t-xl2 last:rounded-b-xl2 last:border-b-0 hover:bg-surface-muted ${isSelected ? 'bg-accent/10' : ''}`
      }`}
    >
      {showCheckbox && (
        <div
          className={`${isGrid ? `absolute left-4 top-4 z-10 rounded-md bg-surface/90 p-1 shadow-card ${checkboxVisible}` : 'shrink-0'} flex items-center`}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer rounded accent-[rgb(var(--accent))]"
            checked={isSelected}
            onChange={(e) => {
              if (isFolder) sel.setFolderSelected(item.id, e.target.checked)
              else sel.setFileSelected(item.id, e.target.checked)
            }}
            aria-label={t('file.select')}
          />
        </div>
      )}

      <div className={`overflow-hidden bg-surface-muted ${isGrid ? 'mb-2.5 h-32 w-full rounded-xl' : 'h-10 w-10 shrink-0 rounded-lg'}`}>
        {canShowThumbnail ? (
          <img
            src={filesApi.thumbnailUrl(file!.id, 256)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        ) : isFolder ? (
          <div className="flex h-full w-full items-center justify-center bg-accent/10"><FolderIcon size={isGrid ? 36 : 20} className="text-accent" /></div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">{kindIcon(file!)}</div>
        )}
      </div>

      <div className={`min-w-0 ${isGrid ? 'px-1 pb-1' : 'flex-1'}`}>
        <div className="truncate text-sm font-medium text-ink">{item.name || t('navigation.home')}</div>
        <div className="truncate text-xs text-ink-muted">
          {isFolder ? t('folder.typeLabel') : `${formatBytes((item as FileItem).size_bytes)} • ${(item as FileItem).content_type}`}
          {isGrid && ` • ${formatDate(item.updated_at)}`}
        </div>
      </div>

      {!isGrid && <div className="hidden w-32 shrink-0 text-xs text-ink-muted sm:block">{formatDate(item.updated_at)}</div>}

      <div className={actionSlotClass}>
        <button className="icon-btn" title={t('folder.rename')}
          onClick={(e) => { e.stopPropagation(); setRename({ kind, item }) }}
        ><Pencil size={15} /></button>
        <button className="icon-btn" title={isFolder ? t('share.quickFolder') : t('share.quickFile')}
          onClick={(e) => { e.stopPropagation(); void quickShare() }}
        ><Share2 size={15} /></button>
        <button className="icon-btn" title={t('share.advanced')}
          onClick={(e) => { e.stopPropagation(); setShare({ kind, id: item.id, name: item.name }) }}
        ><SlidersHorizontal size={15} /></button>
        <button className="icon-btn hover:!bg-red-500/10 hover:!text-red-600" title={t('common.delete')}
          onClick={(e) => { e.stopPropagation(); removeMut.mutate() }}
        ><Trash2 size={15} /></button>
      </div>
    </div>
  )
}
