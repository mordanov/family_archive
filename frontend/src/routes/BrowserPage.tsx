import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useFolderDetail } from '@/hooks/useFolderTree'
import { mapErrorToI18n } from '@/i18n/errors'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { FileList } from '@/components/browser/FileList'
import { DropZone, UploadButton } from '@/components/upload/DropZone'
import { useUI } from '@/stores/uiStore'
import { NewFolderDialog } from '@/components/dialogs/NewFolderDialog'
import { PreviewModal } from '@/components/preview/PreviewModal'
import { FolderPlus } from 'lucide-react'

export function BrowserPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const folderId = Number(id ?? 1)
  const detail = useFolderDetail(folderId)
  const newOpen = useUI((s) => s.newFolderOpen)
  const setNewOpen = useUI((s) => s.setNewFolderOpen)

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
        <FileList folderId={folderId} />
      </div>
      <NewFolderDialog open={newOpen} onClose={() => setNewOpen(false)} parentId={folderId} />
      <PreviewModal />
    </DropZone>
  )
}

