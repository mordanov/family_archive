import { useFolderChildren } from '@/hooks/useFolderTree'
import { useTranslation } from 'react-i18next'
import { Row } from './FileRow'
import { Loader2, FolderOpen } from 'lucide-react'
import { mapErrorToI18n } from '@/i18n/errors'
import { useUI } from '@/stores/uiStore'
import { useSelection } from '@/stores/selectionStore'

export function FileList({ folderId }: { folderId: number }) {
  const { t } = useTranslation()
  const viewMode = useUI((s) => s.viewMode)
  const selection = useSelection()
  const { data, isLoading, isError, error } = useFolderChildren(folderId)
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
  const folderIds = data!.folders.map((f) => f.id)
  const selectedInFolder = fileIds.filter((id) => selection.files.has(id)).length
  const selectedFoldersInFolder = folderIds.filter((id) => selection.folders.has(id)).length
  const allSelected = fileIds.length > 0 && selectedInFolder === fileIds.length
  const allFoldersSelected = folderIds.length > 0 && selectedFoldersInFolder === folderIds.length

  return (
    <>
      {(fileIds.length > 0 || folderIds.length > 0) && (
        <div className="mb-2 flex items-center justify-between rounded border border-surface-strong bg-surface px-3 py-2 text-xs text-ink-muted">
          <div className="flex flex-wrap items-center gap-4">
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
            {folderIds.length > 0 && (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allFoldersSelected}
                  onChange={(e) => (e.target.checked ? selection.selectAllFolders(folderIds) : selection.clearFolders())}
                />
                {t('folder.selectAllInFolder', { count: folderIds.length })}
              </label>
            )}
          </div>
          <span>{t('common.selectedMixed', { files: selectedInFolder, folders: selectedFoldersInFolder })}</span>
        </div>
      )}
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'
            : 'rounded-md border border-surface-strong bg-surface'
        }
      >
      {data!.folders.map((f) => (
        <Row key={`f${f.id}`} kind="folder" item={f} parentId={folderId} viewMode={viewMode} showFolderCheckbox />
      ))}
      {data!.files.map((f) => (
        <Row key={`F${f.id}`} kind="file" item={f} parentId={folderId} viewMode={viewMode} showFileCheckbox />
      ))}
      </div>
    </>
  )
}

