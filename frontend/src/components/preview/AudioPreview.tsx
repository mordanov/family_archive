import { useQuery } from '@tanstack/react-query'
import { filesApi } from '@/api/files'
import type { FileItem } from '@/types/api'

export function AudioPreview({ file }: { file: FileItem }) {
  const { data: meta } = useQuery({
    queryKey: ['audio-meta', file.id],
    queryFn: () => filesApi.audioMeta(file.id),
  })
  const m = (meta ?? {}) as { title?: string; artist?: string; album?: string; duration?: number; bitrate?: number }
  return (
    <div className="flex w-full flex-col items-center gap-4 p-8">
      <div className="text-center">
        <div className="text-lg font-semibold">{m.title || file.name}</div>
        {(m.artist || m.album) && (
          <div className="text-sm text-ink-muted">
            {m.artist}{m.artist && m.album ? ' — ' : ''}{m.album}
          </div>
        )}
        {m.duration != null && (
          <div className="mt-1 text-xs text-ink-muted">
            {Math.floor(m.duration / 60)}:{String(Math.floor(m.duration % 60)).padStart(2, '0')}
            {m.bitrate ? ` • ${Math.round(m.bitrate / 1000)} kbps` : ''}
          </div>
        )}
      </div>
      <audio src={filesApi.rawUrl(file.id)} controls className="w-full max-w-2xl" />
    </div>
  )
}

