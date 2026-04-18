import { filesApi } from '@/api/files'
import type { FileItem } from '@/types/api'

export function ImagePreview({ file }: { file: FileItem }) {
  return <img src={filesApi.rawUrl(file.id)} alt={file.name} className="max-h-[70vh] max-w-full object-contain" />
}

