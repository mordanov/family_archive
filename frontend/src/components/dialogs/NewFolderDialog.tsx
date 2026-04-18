import { useState } from 'react'
import { Modal } from './Modal'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { foldersApi } from '@/api/folders'
import { useTranslation } from 'react-i18next'
import { mapErrorToI18n } from '@/i18n/errors'
import toast from 'react-hot-toast'

interface Props { open: boolean; onClose: () => void; parentId: number }

export function NewFolderDialog({ open, onClose, parentId }: Props) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: () => foldersApi.create(parentId, name.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folder-children', parentId] })
      onClose()
      setName('')
    },
    onError: (e: unknown) => toast.error(mapErrorToI18n(t, e)),
  })

  return (
    <Modal open={open} onClose={onClose} title={t('navigation.newFolder')}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) m.mutate()
        }}
        className="flex flex-col gap-3"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('folder.folderName')}
          className="rounded border border-surface-strong px-3 py-2 outline-none focus:border-accent"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-ink-muted hover:bg-surface-muted">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!name.trim() || m.isPending}
            className="rounded bg-accent px-3 py-1.5 text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('folder.createFolder')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

