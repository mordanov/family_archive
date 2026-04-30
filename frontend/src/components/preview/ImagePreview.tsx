import { filesApi } from '@/api/files'
import type { FileItem } from '@/types/api'

interface Props {
  file: FileItem
  zoom: number
}

export function ImagePreview({ file, zoom }: Props) {
  const isZoomed = zoom > 1
  return (
    <div
      className={`w-full ${isZoomed ? 'max-h-[calc(100vh-6rem)] overflow-auto' : 'flex max-h-[calc(100vh-6rem)] items-center justify-center'}`}
    >
      <img
        key={file.id}
        src={`${filesApi.rawUrl(file.id)}?v=${new Date(file.updated_at).getTime()}`}
        alt={file.name}
        style={
          isZoomed
            ? { width: `${zoom * 100}%`, maxWidth: 'none', height: 'auto' }
            : { maxHeight: 'calc(100vh - 6rem)', maxWidth: '100%', objectFit: 'contain' }
        }
      />
    </div>
  )
}
