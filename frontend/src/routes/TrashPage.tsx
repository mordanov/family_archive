import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { trashApi } from '@/api/trash'
import { formatBytes, formatDateTime } from '@/lib/formatters'
import { mapErrorToI18n } from '@/i18n/errors'
import { Trash2, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'

export function TrashPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['trash'], queryFn: trashApi.list })
  const restoreFile = useMutation({
    mutationFn: (id: number) => trashApi.restoreFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trash'] }),
    onError: (e: unknown) => toast.error(mapErrorToI18n(t, e)),
  })
  const restoreFolder = useMutation({
    mutationFn: (id: number) => trashApi.restoreFolder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trash'] }),
    onError: (e: unknown) => toast.error(mapErrorToI18n(t, e)),
  })
  const empty = useMutation({
    mutationFn: trashApi.empty,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trash'] }); toast.success(t('trash.emptied')) },
  })

  return (
    <div className="mx-auto max-w-5xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('trash.trash')}</h2>
        <button
          onClick={() => { if (confirm(t('trash.permanentlyDeleteFilesOlderThan30Days'))) empty.mutate() }}
          className="flex items-center gap-1 rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
        >
          <Trash2 size={14} /> {t('trash.emptyTrashPurge')}
        </button>
      </div>
      <p className="mb-4 text-xs text-ink-muted">
        {t('trash.retentionHint')}
      </p>

      <div className="rounded border border-surface-strong bg-surface">
        {data?.folders.length === 0 && data?.files.length === 0 && (
          <div className="p-6 text-center text-ink-muted">{t('trash.trashIsEmpty')}</div>
        )}
        {data?.folders.map((f) => (
          <div key={`f${f.id}`} className="flex items-center justify-between border-b border-surface-strong px-3 py-2 text-sm">
            <div>
              <div className="font-medium">📁 {f.name}</div>
              <div className="text-xs text-ink-muted">{t('trash.deletedAt', { date: formatDateTime(f.updated_at) })}</div>
            </div>
            <button onClick={() => restoreFolder.mutate(f.id)} className="flex items-center gap-1 rounded px-2 py-1 text-accent hover:bg-accent/10">
              <RotateCcw size={14} /> {t('trash.restore')}
            </button>
          </div>
        ))}
        {data?.files.map((f) => (
          <div key={`F${f.id}`} className="flex items-center justify-between border-b border-surface-strong px-3 py-2 text-sm">
            <div>
              <div className="font-medium">{f.name}</div>
              <div className="text-xs text-ink-muted">{formatBytes(f.size_bytes)} • {t('trash.deletedAt', { date: formatDateTime(f.updated_at) })}</div>
            </div>
            <button onClick={() => restoreFile.mutate(f.id)} className="flex items-center gap-1 rounded px-2 py-1 text-accent hover:bg-accent/10">
              <RotateCcw size={14} /> {t('trash.restore')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

