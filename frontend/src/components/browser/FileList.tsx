import { useFolderChildren } from '@/hooks/useFolderTree'
import { useTranslation } from 'react-i18next'
import { Row } from './FileRow'
import { Loader2, FolderOpen } from 'lucide-react'
import { mapErrorToI18n } from '@/i18n/errors'
import { useUI } from '@/stores/uiStore'

export function FileList({ folderId }: { folderId: number }) {
  const { t } = useTranslation()
  const viewMode = useUI((s) => s.viewMode)
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
  return (
    <div
      className={
        viewMode === 'grid'
          ? 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'
          : 'rounded-md border border-surface-strong bg-surface'
      }
    >
      {data!.folders.map((f) => (
        <Row key={`f${f.id}`} kind="folder" item={f} parentId={folderId} viewMode={viewMode} />
      ))}
      {data!.files.map((f) => (
        <Row key={`F${f.id}`} kind="file" item={f} parentId={folderId} viewMode={viewMode} />
      ))}
    </div>
  )
}

