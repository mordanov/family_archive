import { useParams } from 'react-router-dom'
import { useFolderDetail } from '@/hooks/useFolderTree'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { FileList } from '@/components/browser/FileList'
import { DropZone, UploadButton } from '@/components/upload/DropZone'
import { useUI } from '@/stores/uiStore'
import { NewFolderDialog } from '@/components/dialogs/NewFolderDialog'
import { PreviewModal } from '@/components/preview/PreviewModal'
import { FolderPlus } from 'lucide-react'

export function BrowserPage() {
  const { id } = useParams()
  const folderId = Number(id ?? 1)
  const { data } = useFolderDetail(folderId)
  const newOpen = useUI((s) => s.newFolderOpen)
  const setNewOpen = useUI((s) => s.setNewFolderOpen)

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
              <FolderPlus size={16} /> New folder
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

