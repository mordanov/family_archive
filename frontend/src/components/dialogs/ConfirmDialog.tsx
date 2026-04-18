import { Modal } from './Modal'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  danger?: boolean
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText = 'Confirm', danger }: Props) {
  const { t } = useTranslation()
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="mb-4 text-sm text-ink">{message}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded px-3 py-1.5 text-ink-muted hover:bg-surface-muted">
          {t('common.cancel')}
        </button>
        <button
          onClick={() => { onConfirm(); onClose() }}
          className={`rounded px-3 py-1.5 text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-accent hover:bg-accent-hover'}`}
        >
          {confirmText === 'Confirm' ? t('common.confirm') : confirmText}
        </button>
      </div>
    </Modal>
  )
}

