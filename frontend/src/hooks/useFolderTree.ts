import { useQuery, useQueryClient } from '@tanstack/react-query'
import { foldersApi } from '@/api/folders'

export function useFolderChildren(folderId: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['folder-children', folderId],
    queryFn: () => foldersApi.children(folderId),
    staleTime: 30_000,
    enabled: options?.enabled !== false,
  })
}

export function useFolderDetail(folderId: number) {
  return useQuery({
    queryKey: ['folder-detail', folderId],
    queryFn: () => foldersApi.detail(folderId),
    staleTime: 30_000,
  })
}

export function useInvalidateFolder() {
  const qc = useQueryClient()
  return (folderId: number) => {
    qc.invalidateQueries({ queryKey: ['folder-children', folderId] })
    qc.invalidateQueries({ queryKey: ['folder-detail', folderId] })
  }
}

