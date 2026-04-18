import { Modal } from './Modal'

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
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="mb-4 text-sm text-ink">{message}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded px-3 py-1.5 text-ink-muted hover:bg-surface-muted">
          Cancel
        </button>
        <button
          onClick={() => { onConfirm(); onClose() }}
          className={`rounded px-3 py-1.5 text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-accent hover:bg-accent-hover'}`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}

