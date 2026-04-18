import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { sharesApi } from '@/api/shares'
import { formatBytes } from '@/lib/formatters'
import { Download, Lock } from 'lucide-react'

export function SharePage() {
  const { token = '' } = useParams()
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const meta = useQuery({ queryKey: ['share', token], queryFn: () => sharesApi.publicMeta(token), retry: false })

  const tryUnlock = async () => {
    setError(null)
    try {
      await sharesApi.unlock(token, password)
      setUnlocked(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (meta.isLoading) return <div className="p-8 text-center text-ink-muted">Loading…</div>
  if (meta.isError) return <div className="p-8 text-center text-red-600">{(meta.error as Error).message}</div>
  if (!meta.data) return null
  const m = meta.data
  const needPassword = m.requires_password && !unlocked

  return (
    <div className="mx-auto max-w-2xl p-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">{m.name}</h1>
        <p className="text-xs text-ink-muted">
          Shared {m.target_type} • expires {m.expires_at ? new Date(m.expires_at).toLocaleString() : 'never'}
        </p>
      </header>

      {needPassword && (
        <div className="mb-4 rounded border border-surface-strong bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Lock size={16} /> Password required</div>
          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 rounded border border-surface-strong px-3 py-2"
            />
            <button onClick={tryUnlock} className="rounded bg-accent px-3 py-2 text-white hover:bg-accent-hover">
              Unlock
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}

      {!needPassword && m.target_type === 'file' && m.files?.[0] && (
        <div className="rounded border border-surface-strong bg-surface p-4">
          <div className="mb-1 font-medium">{m.files[0].name}</div>
          <div className="mb-3 text-xs text-ink-muted">
            {formatBytes(m.files[0].size_bytes)} • {m.files[0].content_type}
          </div>
          <a
            href={sharesApi.publicDownloadUrl(token)}
            className="inline-flex items-center gap-1 rounded bg-accent px-3 py-2 text-white hover:bg-accent-hover"
          >
            <Download size={16} /> Download
          </a>
        </div>
      )}

      {!needPassword && m.target_type === 'folder' && (
        <div className="rounded border border-surface-strong bg-surface">
          {(m.folders ?? []).map((f) => (
            <div key={`F${f.id}`} className="border-b border-surface-strong px-3 py-2 text-sm">📁 {f.name}</div>
          ))}
          {(m.files ?? []).map((f) => (
            <div key={`f${f.id}`} className="border-b border-surface-strong px-3 py-2 text-sm">
              {f.name} <span className="text-xs text-ink-muted">({formatBytes(f.size_bytes)})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

