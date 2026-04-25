import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useFolderDetail } from '@/hooks/useFolderTree'
import { mapErrorToI18n } from '@/i18n/errors'
import { filesApi } from '@/api/files'
import { foldersApi } from '@/api/folders'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { FileList } from '@/components/browser/FileList'
import { DropZone, UploadButton } from '@/components/upload/DropZone'
import { useUI } from '@/stores/uiStore'
import { useSelection } from '@/stores/selectionStore'
import { NewFolderDialog } from '@/components/dialogs/NewFolderDialog'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { BulkMoveDialog } from '@/components/dialogs/BulkMoveDialog'
import { PreviewModal } from '@/components/preview/PreviewModal'
import { FolderPlus, MoveRight, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

export function BrowserPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { id } = useParams()
  const folderId = Number(id ?? 1)
  const detail = useFolderDetail(folderId)
  const selection = useSelection()
  const newOpen = useUI((s) => s.newFolderOpen)
  const setNewOpen = useUI((s) => s.setNewFolderOpen)

  const selectedFileIds = Array.from(selection.files)
  const selectedFolderIds = Array.from(selection.folders)
  const totalSelected = selectedFileIds.length + selectedFolderIds.length
  const hasSelection = totalSelected > 0

  const [bulkMoveOpen, setBulkMoveOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  async function runBulkMove(targetFolderId: number) {
    setBulkMoveOpen(false)
    const targetDetail = await foldersApi.detail(targetFolderId)
    const ancestorIds = new Set(targetDetail.breadcrumb.map((b) => b.id))

    let protectedSkipped = 0
    const folderOps = selectedFolderIds
      .filter((folderId) => {
        const blocked = folderId === targetFolderId || ancestorIds.has(folderId)
        if (blocked) protectedSkipped += 1
        return !blocked
      })
      .map((folderId) => foldersApi.move(folderId, targetFolderId))

    const fileOps = selectedFileIds.map((fileId) => filesApi.move(fileId, targetFolderId))

    const [folderResults, fileResults] = await Promise.all([
      Promise.allSettled(folderOps),
      Promise.allSettled(fileOps),
    ])

    const movedFolders = folderResults.filter((r) => r.status === 'fulfilled').length
    const failedFolders = folderResults.length - movedFolders
    const movedFiles = fileResults.filter((r) => r.status === 'fulfilled').length
    const failedFiles = fileResults.length - movedFiles

    if (movedFolders) toast.success(t('folder.bulkMoved', { count: movedFolders }))
    if (failedFolders) toast.error(t('folder.bulkMoveFailed', { count: failedFolders }))
    if (protectedSkipped) toast.error(t('folder.bulkMoveProtected', { count: protectedSkipped }))
    if (movedFiles) toast.success(t('file.bulkMoved', { count: movedFiles }))
    if (failedFiles) toast.error(t('file.bulkMoveFailed', { count: failedFiles }))

    selection.clear()
    qc.invalidateQueries({ queryKey: ['folder-children', folderId] })
    qc.invalidateQueries({ queryKey: ['folder-children', targetFolderId] })
  }

  async function runBulkDelete() {
    setBulkDeleteOpen(false)
    const ops = await Promise.allSettled(selectedFileIds.map((fileId) => filesApi.remove(fileId)))
    const success = ops.filter((r) => r.status === 'fulfilled').length
    const failed = ops.length - success
    if (success) toast.success(t('file.bulkDeleted', { count: success }))
    if (failed) toast.error(t('file.bulkDeleteFailed', { count: failed }))
    selection.clearFiles()
    qc.invalidateQueries({ queryKey: ['folder-children', folderId] })
  }

  if (detail.isLoading) {
    return <div className="p-6 text-ink-muted">{t('common.loading')}</div>
  }

  if (detail.isError) {
    return <div className="p-6 text-red-600">{mapErrorToI18n(t, detail.error)}</div>
  }

  const data = detail.data

  return (
    <DropZone folderId={folderId}>
      <div className="mx-auto max-w-6xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {data ? <Breadcrumbs items={data.breadcrumb} /> : <div />}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNewOpen(true)}
              className="flex items-center gap-1 rounded border border-surface-strong bg-surface px-3 py-1.5 text-sm hover:bg-surface-muted"
            >
              <FolderPlus size={16} /> {t('navigation.newFolder')}
            </button>
            <UploadButton folderId={folderId} />
          </div>
        </div>

        {hasSelection && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-surface-strong bg-surface px-3 py-2 text-sm">
            <span className="text-ink-muted">{t('common.selectedMixed', { files: selectedFileIds.length, folders: selectedFolderIds.length })}</span>
            <button
              onClick={() => setBulkMoveOpen(true)}
              className="inline-flex items-center gap-1 rounded border border-surface-strong px-2 py-1 hover:bg-surface-muted"
            >
              <MoveRight size={14} /> {t('common.moveSelected')}
            </button>
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700"
            >
              <Trash2 size={14} /> {t('common.deleteSelected')}
            </button>
            <button
              onClick={() => selection.clear()}
              className="ml-auto text-ink-muted hover:text-ink"
            >
              {t('common.clearSelection')}
            </button>
          </div>
        )}

        <FileList folderId={folderId} />
      </div>
      <NewFolderDialog open={newOpen} onClose={() => setNewOpen(false)} parentId={folderId} />
      <BulkMoveDialog
        open={bulkMoveOpen}
        selectedCount={totalSelected}
        initialFolderId={folderId}
        onClose={() => setBulkMoveOpen(false)}
        onConfirm={runBulkMove}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={runBulkDelete}
        title={t('file.bulkDeleteTitle', { count: selectedFileIds.length })}
        message={t('file.bulkDeleteConfirm', { count: selectedFileIds.length })}
        confirmText={t('file.bulkDelete')}
        danger
      />
      <PreviewModal />
    </DropZone>
  )
}
