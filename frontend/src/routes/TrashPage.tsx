import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { trashApi } from '@/api/trash'
import { formatBytes, formatDateTime } from '@/lib/formatters'
import { Trash2, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'

export function TrashPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['trash'], queryFn: trashApi.list })
  const restoreFile = useMutation({
    mutationFn: (id: number) => trashApi.restoreFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trash'] }),
    onError: (e: Error) => toast.error(e.message),
  })
  const restoreFolder = useMutation({
    mutationFn: (id: number) => trashApi.restoreFolder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trash'] }),
    onError: (e: Error) => toast.error(e.message),
  })
  const empty = useMutation({
    mutationFn: trashApi.empty,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trash'] }); toast.success('Trash emptied') },
  })

  return (
    <div className="mx-auto max-w-5xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Trash</h2>
        <button
          onClick={() => { if (confirm('Permanently delete files older than 30 days?')) empty.mutate() }}
          className="flex items-center gap-1 rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
        >
          <Trash2 size={14} /> Empty trash (purge expired)
        </button>
      </div>
      <p className="mb-4 text-xs text-ink-muted">
        Items in trash are kept for 30 days and then automatically removed.
      </p>

      <div className="rounded border border-surface-strong bg-surface">
        {data?.folders.length === 0 && data?.files.length === 0 && (
          <div className="p-6 text-center text-ink-muted">Trash is empty.</div>
        )}
        {data?.folders.map((f) => (
          <div key={`f${f.id}`} className="flex items-center justify-between border-b border-surface-strong px-3 py-2 text-sm">
            <div>
              <div className="font-medium">📁 {f.name}</div>
              <div className="text-xs text-ink-muted">deleted {formatDateTime(f.updated_at)}</div>
            </div>
            <button onClick={() => restoreFolder.mutate(f.id)} className="flex items-center gap-1 rounded px-2 py-1 text-accent hover:bg-accent/10">
              <RotateCcw size={14} /> Restore
            </button>
          </div>
        ))}
        {data?.files.map((f) => (
          <div key={`F${f.id}`} className="flex items-center justify-between border-b border-surface-strong px-3 py-2 text-sm">
            <div>
              <div className="font-medium">{f.name}</div>
              <div className="text-xs text-ink-muted">{formatBytes(f.size_bytes)} • deleted {formatDateTime(f.updated_at)}</div>
            </div>
            <button onClick={() => restoreFile.mutate(f.id)} className="flex items-center gap-1 rounded px-2 py-1 text-accent hover:bg-accent/10">
              <RotateCcw size={14} /> Restore
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

