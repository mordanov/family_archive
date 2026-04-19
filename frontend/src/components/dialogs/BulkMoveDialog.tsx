import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { foldersApi } from '@/api/folders'
import { Modal } from './Modal'

interface Props {
  open: boolean
  selectedCount: number
  initialFolderId: number
  onClose: () => void
  onConfirm: (targetFolderId: number) => void
}

export function BulkMoveDialog({ open, selectedCount, initialFolderId, onClose, onConfirm }: Props) {
  const { t } = useTranslation()
  const [cursorId, setCursorId] = useState(initialFolderId)

  useEffect(() => {
    if (open) setCursorId(initialFolderId)
  }, [open, initialFolderId])

  const detail = useQuery({
    queryKey: ['folder-detail', cursorId],
    queryFn: () => foldersApi.detail(cursorId),
    enabled: open,
  })

  const children = useQuery({
    queryKey: ['folder-children', cursorId],
    queryFn: () => foldersApi.children(cursorId),
    enabled: open,
  })

  const crumbs = detail.data?.breadcrumb ?? []
  const subfolders = children.data?.folders ?? []

  return (
    <Modal open={open} onClose={onClose} title={t('common.bulkMoveTitleMixed', { count: selectedCount })} size="lg">
      <div className="flex flex-col gap-3">
        <div className="text-xs text-ink-muted">{t('file.bulkMoveHint')}</div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {crumbs.map((c, idx) => (
            <button
              key={c.id}
              onClick={() => setCursorId(c.id)}
              className="rounded border border-surface-strong px-2 py-1 hover:bg-surface-muted"
            >
              {c.name || t('navigation.home')}
              {idx < crumbs.length - 1 ? ' /' : ''}
            </button>
          ))}
        </div>

        <div className="max-h-72 overflow-auto rounded border border-surface-strong bg-surface">
          {children.isLoading && <div className="p-3 text-sm text-ink-muted">{t('common.loading')}</div>}
          {!children.isLoading && subfolders.length === 0 && (
            <div className="p-3 text-sm text-ink-muted">{t('folder.noSubfolders')}</div>
          )}
          {subfolders.map((f) => (
            <button
              key={f.id}
              onClick={() => setCursorId(f.id)}
              className="block w-full border-b border-surface-strong px-3 py-2 text-left text-sm hover:bg-surface-muted last:border-0"
            >
              {f.name}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-ink-muted hover:bg-surface-muted">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => onConfirm(cursorId)}
            className="rounded bg-accent px-3 py-1.5 text-white hover:bg-accent-hover"
          >
            {t('common.moveHere')}
          </button>
        </div>
      </div>
    </Modal>
  )
}


