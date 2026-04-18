import { useState } from 'react'
import { Modal } from './Modal'
import { useTranslation } from 'react-i18next'
import { mapErrorToI18n } from '@/i18n/errors'
import { useUI } from '@/stores/uiStore'
import { sharesApi } from '@/api/shares'
import toast from 'react-hot-toast'
import { Copy } from 'lucide-react'

export function ShareDialog() {
  const { t } = useTranslation()
  const target = useUI((s) => s.shareTarget)
  const setTarget = useUI((s) => s.setShareTarget)
  const [password, setPassword] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [maxDownloads, setMaxDownloads] = useState('')
  const [created, setCreated] = useState<{ token: string; url: string } | null>(null)

  if (!target) return null
  const kindLabel = target.kind === 'folder' ? t('folder.kindFolder') : t('folder.kindFile')

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
      toast.error(mapErrorToI18n(t, e))
    }
  }

  return (
    <Modal
      open
      onClose={() => { setTarget(null); setCreated(null) }}
      title={t('share.shareTitle', { kind: kindLabel, name: target.name })}
      size="lg"
    >
      {!created ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">{t('share.password')}</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password"
              className="rounded border border-surface-strong px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">{t('share.expiresAt')}</span>
            <input value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} type="datetime-local"
              className="rounded border border-surface-strong px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">{t('share.maxDownloads')}</span>
            <input value={maxDownloads} onChange={(e) => setMaxDownloads(e.target.value)} type="number" min={1}
              className="rounded border border-surface-strong px-3 py-2" />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setTarget(null)} className="rounded px-3 py-1.5 text-ink-muted hover:bg-surface-muted">
              {t('common.cancel')}
            </button>
            <button onClick={create} className="rounded bg-accent px-3 py-1.5 text-white hover:bg-accent-hover">
              {t('share.createLink')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">{t('share.publicLinkCreated')}</p>
          <div className="flex gap-2">
            <input readOnly value={created.url} className="flex-1 rounded border border-surface-strong px-3 py-2 font-mono text-sm" />
            <button
              onClick={() => { navigator.clipboard.writeText(created.url); toast.success(t('share.copied')) }}
              className="flex items-center gap-1 rounded bg-accent px-3 py-2 text-white"
              aria-label={t('share.copy')}
            >
              <Copy size={16} /> {t('share.copy')}
            </button>
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={() => { setTarget(null); setCreated(null) }} className="rounded px-3 py-1.5 text-ink-muted hover:bg-surface-muted">
              {t('common.done')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

