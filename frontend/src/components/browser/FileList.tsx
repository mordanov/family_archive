import { useCallback, useEffect, useRef } from 'react'
import { useFolderChildren } from '@/hooks/useFolderTree'
import { useTranslation } from 'react-i18next'
import { Row } from './FileRow'
import { Loader2, FolderOpen } from 'lucide-react'
import { mapErrorToI18n } from '@/i18n/errors'
import { filesApi } from '@/api/files'
import { useUI } from '@/stores/uiStore'
import { useSelection } from '@/stores/selectionStore'
import type { FileItem } from '@/types/api'
import { classifyMime } from '@/lib/mime'

export function FileList({ folderId }: { folderId: number }) {
  const { t } = useTranslation()
  const viewMode = useUI((s) => s.viewMode)
  const selection = useSelection()
  const { data, isLoading, isError, error } = useFolderChildren(folderId)
  const queuedIdsRef = useRef<Set<number>>(new Set())
  const sentIdsRef = useRef<Set<number>>(new Set())
  const timerRef = useRef<number | null>(null)

  const flushPrewarm = useCallback(() => {
    if (timerRef.current !== null) return
    timerRef.current = window.setTimeout(async () => {
      timerRef.current = null
      const ids = Array.from(queuedIdsRef.current).filter((id) => !sentIdsRef.current.has(id)).slice(0, 24)
      ids.forEach((id) => queuedIdsRef.current.delete(id))
      if (!ids.length) return
      ids.forEach((id) => sentIdsRef.current.add(id))
      try {
        await filesApi.prewarmThumbnails(ids)
      } catch {
        ids.forEach((id) => sentIdsRef.current.delete(id))
      }
      if (queuedIdsRef.current.size) flushPrewarm()
    }, 150)
  }, [])

  const handleVisibleFile = useCallback((file: FileItem) => {
    if (viewMode !== 'grid') return
    const kind = classifyMime(file.content_type, file.name)
    if (kind !== 'image' && kind !== 'video') return
    if (sentIdsRef.current.has(file.id)) return
    queuedIdsRef.current.add(file.id)
    flushPrewarm()
  }, [flushPrewarm, viewMode])

  useEffect(() => {
    if (viewMode !== 'grid') return
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [viewMode])
  if (isLoading)
    return (
      <div className="flex items-center justify-center p-12 text-ink-muted">
        <Loader2 className="animate-spin" />
      </div>
    )
  if (isError) return <div className="p-6 text-red-600">{mapErrorToI18n(t, error)}</div>
  const empty = !data?.folders.length && !data?.files.length
  if (empty)
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-16 text-ink-muted">
        <FolderOpen size={36} />
        <p>{t('folder.thisFolder')} {t('folder.empty')}</p>
        <p className="text-xs">{t('folder.dragFilesHere')}</p>
      </div>
    )
  const fileIds = data!.files.map((f) => f.id)
  const selectedInFolder = fileIds.filter((id) => selection.files.has(id)).length
  const allSelected = fileIds.length > 0 && selectedInFolder === fileIds.length
  const folderIds = data!.folders.map((f) => f.id)
  const selectedFoldersInFolder = folderIds.filter((id) => selection.folders.has(id)).length

  return (
    <div>
      <div className="mb-2 flex items-center justify-between rounded border border-surface-strong bg-surface px-3 py-2 text-xs text-ink-muted">
        {fileIds.length > 0 && (
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => (e.target.checked ? selection.selectAllFiles(fileIds) : selection.clearFiles())}
            />
            {t('file.selectAllInFolder', { count: fileIds.length })}
          </label>
        )}
        <span>{t('file.selectedCount', { count: selectedInFolder + selectedFoldersInFolder })}</span>
      </div>
      <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4' : ''}>
        {data!.folders.map((f) => (
          <Row key={`f${f.id}`} kind="folder" item={f} parentId={folderId} viewMode={viewMode} showFolderCheckbox />
        ))}
        {data!.files.map((f) => (
          <Row key={`F${f.id}`} kind="file" item={f} parentId={folderId} viewMode={viewMode} showFileCheckbox onVisibleFile={handleVisibleFile} />
        ))}
      </div>
    </div>
  )
}
