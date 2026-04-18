import { useState } from 'react'
import { Modal } from './Modal'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { mapErrorToI18n } from '@/i18n/errors'
import { useUI } from '@/stores/uiStore'
import { foldersApi } from '@/api/folders'
import { filesApi } from '@/api/files'
import toast from 'react-hot-toast'

export function RenameDialog() {
  const { t } = useTranslation()
  const target = useUI((s) => s.renameTarget)
  const setTarget = useUI((s) => s.setRenameTarget)
  const [name, setName] = useState(target?.item.name ?? '')
  const qc = useQueryClient()

  const m = useMutation({
    mutationFn: async () => {
      if (!target) return
      if (target.kind === 'folder') return foldersApi.rename(target.item.id, name.trim())
      return filesApi.rename(target.item.id, name.trim())
    },
    onSuccess: () => {
      const folderId = target?.kind === 'folder'
        ? (target.item as { parent_id: number | null }).parent_id ?? 1
        : (target?.item as { folder_id: number }).folder_id
      qc.invalidateQueries({ queryKey: ['folder-children', folderId] })
      setTarget(null)
    },
    onError: (e: unknown) => toast.error(mapErrorToI18n(t, e)),
  })

  if (!target) return null
  return (
    <Modal
      open
      onClose={() => setTarget(null)}
      title={t('folder.renameTitle', { kind: target.kind === 'folder' ? t('folder.kindFolder') : t('folder.kindFile') })}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) m.mutate()
        }}
        className="flex flex-col gap-3"
      >
        <input
          autoFocus
          defaultValue={target.item.name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-surface-strong px-3 py-2 outline-none focus:border-accent"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setTarget(null)} className="rounded px-3 py-1.5 text-ink-muted hover:bg-surface-muted">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={m.isPending} className="rounded bg-accent px-3 py-1.5 text-white hover:bg-accent-hover">
            {t('folder.rename')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

