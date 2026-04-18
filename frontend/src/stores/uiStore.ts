import { create } from 'zustand'
import type { FileItem, Folder } from '@/types/api'

type ViewMode = 'list' | 'grid'

interface UIState {
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void

  // Active modals/dialogs
  previewFileId: number | null
  setPreviewFileId: (id: number | null) => void
  newFolderOpen: boolean
  setNewFolderOpen: (v: boolean) => void
  renameTarget: { kind: 'file' | 'folder'; item: FileItem | Folder } | null
  setRenameTarget: (t: UIState['renameTarget']) => void
  shareTarget: { kind: 'file' | 'folder'; id: number; name: string } | null
  setShareTarget: (t: UIState['shareTarget']) => void
}

export const useUI = create<UIState>((set) => ({
  viewMode: (localStorage.getItem('archive.viewMode') as ViewMode) || 'list',
  setViewMode: (m) => {
    localStorage.setItem('archive.viewMode', m)
    set({ viewMode: m })
  },
  previewFileId: null,
  setPreviewFileId: (id) => set({ previewFileId: id }),
  newFolderOpen: false,
  setNewFolderOpen: (v) => set({ newFolderOpen: v }),
  renameTarget: null,
  setRenameTarget: (t) => set({ renameTarget: t }),
  shareTarget: null,
  setShareTarget: (t) => set({ shareTarget: t }),
}))

