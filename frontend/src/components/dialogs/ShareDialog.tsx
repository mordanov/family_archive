import { useState } from 'react'
import { Modal } from './Modal'
import { useUI } from '@/stores/uiStore'
import { sharesApi } from '@/api/shares'
import toast from 'react-hot-toast'
import { Copy, Trash2 } from 'lucide-react'

export function ShareDialog() {
  const target = useUI((s) => s.shareTarget)
  const setTarget = useUI((s) => s.setShareTarget)
  const [password, setPassword] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [maxDownloads, setMaxDownloads] = useState('')
  const [created, setCreated] = useState<{ token: string; url: string } | null>(null)

  if (!target) return null

  const create = async () => {
    try {
      const opts = {
        ...(password ? { password } : {}),
        ...(expiresAt ? { expires_at: new Date(expiresAt).toISOString() } : {}),
        ...(maxDownloads ? { max_downloads: parseInt(maxDownloads, 10) } : {}),
      }
      const s = target.kind === 'file'
        ? await sharesApi.createForFile(target.id, opts)
        : await sharesApi.createForFolder(target.id, opts)
      const url = `${window.location.origin}/s/${s.token}`
      setCreated({ token: s.token, url })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Modal open onClose={() => { setTarget(null); setCreated(null) }} title={`Share ${target.kind}: ${target.name}`} size="lg">
      {!created ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">Password (optional)</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password"
              className="rounded border border-surface-strong px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">Expires at (optional)</span>
            <input value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} type="datetime-local"
              className="rounded border border-surface-strong px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">Max downloads (optional)</span>
            <input value={maxDownloads} onChange={(e) => setMaxDownloads(e.target.value)} type="number" min={1}
              className="rounded border border-surface-strong px-3 py-2" />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setTarget(null)} className="rounded px-3 py-1.5 text-ink-muted hover:bg-surface-muted">
              Cancel
            </button>
            <button onClick={create} className="rounded bg-accent px-3 py-1.5 text-white hover:bg-accent-hover">
              Create link
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">Public link created:</p>
          <div className="flex gap-2">
            <input readOnly value={created.url} className="flex-1 rounded border border-surface-strong px-3 py-2 font-mono text-sm" />
            <button
              onClick={() => { navigator.clipboard.writeText(created.url); toast.success('Copied') }}
              className="flex items-center gap-1 rounded bg-accent px-3 py-2 text-white"
              aria-label="Copy"
            >
              <Copy size={16} /> Copy
            </button>
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={() => { setTarget(null); setCreated(null) }} className="rounded px-3 py-1.5 text-ink-muted hover:bg-surface-muted">
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

