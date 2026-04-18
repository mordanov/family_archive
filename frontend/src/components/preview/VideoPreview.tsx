import { filesApi } from '@/api/files'
import type { FileItem } from '@/types/api'

export function VideoPreview({ file }: { file: FileItem }) {
  return (
    <video
      src={filesApi.rawUrl(file.id)}
      poster={file.has_poster ? filesApi.posterUrl(file.id) : undefined}
      controls
      preload="metadata"
      className="max-h-[70vh] max-w-full"
    />
  )
}

