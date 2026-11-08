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
        <button onClick={onClose} className="btn-ghost">
          {t('common.cancel')}
        </button>
        <button
          onClick={() => { onConfirm(); onClose() }}
          className={danger ? 'btn-danger' : 'btn-primary'}
        >
          {confirmText === 'Confirm' ? t('common.confirm') : confirmText}
        </button>
      </div>
    </Modal>
  )
}

