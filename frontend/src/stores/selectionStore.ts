import { create } from 'zustand'

interface Sel {
  files: Set<number>
  folders: Set<number>
  toggleFile: (id: number) => void
  toggleFolder: (id: number) => void
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
  toggleFolder: (id) =>
    set((s) => {
      const n = new Set(s.folders)
      n.has(id) ? n.delete(id) : n.add(id)
      return { folders: n }
    }),
  clear: () => set({ files: new Set(), folders: new Set() }),
  selectOnlyFile: (id) => set({ files: new Set([id]), folders: new Set() }),
}))

