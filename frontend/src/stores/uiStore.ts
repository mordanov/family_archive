import { create } from 'zustand'
import type { FileItem, Folder } from '@/types/api'

type ViewMode = 'list' | 'grid'

export const SIDEBAR_MIN = 160
export const SIDEBAR_MAX = 480

interface UIState {
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void

  sidebarWidth: number
  setSidebarWidth: (w: number) => void

  expandedFolderIds: Set<number>
  toggleFolderExpanded: (id: number) => void

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

function readInitialSidebarWidth(): number {
  try {
    const raw = localStorage.getItem('archive.sidebarWidth')
    const n = raw ? parseInt(raw, 10) : NaN
    return isNaN(n) ? 256 : Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n))
  } catch {
    return 256
  }
}

function persistSidebarWidth(w: number): void {
  try {
    localStorage.setItem('archive.sidebarWidth', String(w))
  } catch { /* non-fatal */ }
}

function readExpandedFolderIds(): Set<number> {
  try {
    const raw = localStorage.getItem('archive.treeExpanded')
    if (!raw) return new Set([1])
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.map(Number) : [1])
  } catch {
    return new Set([1])
  }
}

function persistExpandedFolderIds(ids: Set<number>): void {
  try {
    localStorage.setItem('archive.treeExpanded', JSON.stringify([...ids]))
  } catch { /* non-fatal */ }
}

export const useUI = create<UIState>((set) => ({
  viewMode: readInitialViewMode(),
  setViewMode: (m) => {
    persistViewMode(m)
    set({ viewMode: m })
  },

  sidebarWidth: readInitialSidebarWidth(),
  setSidebarWidth: (w) => {
    const clamped = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w))
    persistSidebarWidth(clamped)
    set({ sidebarWidth: clamped })
  },

  expandedFolderIds: readExpandedFolderIds(),
  toggleFolderExpanded: (id) =>
    set((s) => {
      const next = new Set(s.expandedFolderIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persistExpandedFolderIds(next)
      return { expandedFolderIds: next }
    }),

  previewFileId: null,
  setPreviewFileId: (id) => set({ previewFileId: id }),
  newFolderOpen: false,
  setNewFolderOpen: (v) => set({ newFolderOpen: v }),
  renameTarget: null,
  setRenameTarget: (t) => set({ renameTarget: t }),
  shareTarget: null,
  setShareTarget: (t) => set({ shareTarget: t }),
}))

