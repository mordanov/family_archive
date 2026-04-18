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

function readInitialViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem('archive.viewMode')
    return raw === 'grid' || raw === 'list' ? raw : 'list'
  } catch {
    return 'list'
  }
}

function persistViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem('archive.viewMode', mode)
  } catch {
    // Non-fatal: continue with in-memory state if storage is unavailable.
  }
}

export const useUI = create<UIState>((set) => ({
  viewMode: readInitialViewMode(),
  setViewMode: (m) => {
    persistViewMode(m)
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

