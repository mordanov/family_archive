import { create } from 'zustand'

interface Sel {
  files: Set<number>
  folders: Set<number>
  toggleFile: (id: number) => void
  setFileSelected: (id: number, selected: boolean) => void
  selectAllFiles: (ids: number[]) => void
  clearFiles: () => void
  toggleFolder: (id: number) => void
  setFolderSelected: (id: number, selected: boolean) => void
  selectAllFolders: (ids: number[]) => void
  clearFolders: () => void
  clear: () => void
  selectOnlyFile: (id: number) => void
}

export const useSelection = create<Sel>((set) => ({
  files: new Set(),
  folders: new Set(),
  toggleFile: (id) =>
    set((s) => {
      const n = new Set(s.files)
      n.has(id) ? n.delete(id) : n.add(id)
      return { files: n }
    }),
  setFileSelected: (id, selected) =>
    set((s) => {
      const n = new Set(s.files)
      selected ? n.add(id) : n.delete(id)
      return { files: n }
    }),
  selectAllFiles: (ids) => set({ files: new Set(ids) }),
  clearFiles: () => set({ files: new Set() }),
  toggleFolder: (id) =>
    set((s) => {
      const n = new Set(s.folders)
      n.has(id) ? n.delete(id) : n.add(id)
      return { folders: n }
    }),
  setFolderSelected: (id, selected) =>
    set((s) => {
      const n = new Set(s.folders)
      selected ? n.add(id) : n.delete(id)
      return { folders: n }
    }),
  selectAllFolders: (ids) => set({ folders: new Set(ids) }),
  clearFolders: () => set({ folders: new Set() }),
  clear: () => set({ files: new Set(), folders: new Set() }),
  selectOnlyFile: (id) => set({ files: new Set([id]), folders: new Set() }),
}))

