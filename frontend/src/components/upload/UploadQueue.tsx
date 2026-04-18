import { useEffect, useMemo, useState } from 'react'
import { useUploads } from '@/stores/uploadStore'
import { formatBytes } from '@/lib/formatters'
import { Pause, Play, X, ChevronDown, ChevronUp, Upload as UpIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

export function UploadQueue() {
  const itemsMap = useUploads((s) => s.items)
  const items = useMemo(() => Object.values(itemsMap), [itemsMap])
  const pause = useUploads((s) => s.pause)
  const resume = useUploads((s) => s.resume)
  const remove = useUploads((s) => s.remove)
  const [open, setOpen] = useState(true)
  const qc = useQueryClient()

  // Refresh listing whenever an upload finishes
  useEffect(() => {
    const done = items.filter((i) => i.status === 'done')
    if (done.length) {
      const folders = new Set(done.map((i) => i.folderId))
      folders.forEach((fid) => qc.invalidateQueries({ queryKey: ['folder-children', fid] }))
    }
  }, [items, qc])

  if (!items.length) return null

  return (
    <div className="fixed bottom-3 right-3 z-40 w-[26rem] max-w-[calc(100vw-1.5rem)] rounded-lg border border-surface-strong bg-surface shadow-xl">
      <button
        className="flex w-full items-center justify-between border-b border-surface-strong px-3 py-2 text-sm font-semibold"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2"><UpIcon size={16} /> Uploads ({items.length})</span>
        {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      {open && (
        <ul className="max-h-72 overflow-auto">
          {items.map((u) => {
            const pct = u.size > 0 ? Math.min(100, Math.floor((u.bytesUploaded / u.size) * 100)) : 0
            return (
              <li key={u.localId} className="border-b border-surface-strong px-3 py-2 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{u.filename}</div>
                    <div className="text-xs text-ink-muted">
                      {u.status} • {formatBytes(u.bytesUploaded)} / {formatBytes(u.size)}
                      {u.status === 'paused' && !u.file && ' • re-pick file to resume'}
                      {u.error && <span className="text-red-600"> • {u.error}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {u.status === 'uploading' && (
                      <button onClick={() => pause(u.localId)} className="rounded p-1 hover:bg-surface-muted" title="Pause">
                        <Pause size={14} />
                      </button>
                    )}
                    {(u.status === 'paused' || u.status === 'error') && u.file && (
                      <button onClick={() => resume(u.localId)} className="rounded p-1 hover:bg-surface-muted" title="Resume">
                        <Play size={14} />
                      </button>
                    )}
                    <button onClick={() => remove(u.localId)} className="rounded p-1 hover:bg-surface-muted" title="Cancel">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded bg-surface-muted">
                  <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

