import { useState } from 'react'
import { Modal } from './Modal'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { foldersApi } from '@/api/folders'
import toast from 'react-hot-toast'

interface Props { open: boolean; onClose: () => void; parentId: number }

export function NewFolderDialog({ open, onClose, parentId }: Props) {
  const [name, setName] = useState('')
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: () => foldersApi.create(parentId, name.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folder-children', parentId] })
      onClose()
      setName('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Modal open={open} onClose={onClose} title="New folder">
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
          placeholder="Folder name"
          className="rounded border border-surface-strong px-3 py-2 outline-none focus:border-accent"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-ink-muted hover:bg-surface-muted">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || m.isPending}
            className="rounded bg-accent px-3 py-1.5 text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </form>
    </Modal>
  )
}

