import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { filesApi } from '@/api/files'
import type { FileItem } from '@/types/api'

const ZOOM_STEPS = [0.75, 1, 1.5, 2, 3]

interface Props {
  file: FileItem
}

export function PdfPreview({ file }: Props) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setPage(0)
    setZoom(1)
  }, [file.id])

  useEffect(() => {
    setLoaded(false)
  }, [page, file.id])

  const { data: info } = useQuery({
    queryKey: ['pdf-info', file.id],
    queryFn: () => filesApi.pdfInfo(file.id),
  })

  const pageCount = info?.page_count ?? 1
  const zoomIdx = ZOOM_STEPS.indexOf(zoom)

  return (
    <div className="flex h-full w-full flex-col items-center">
      <div className="relative min-h-0 flex-1 overflow-auto flex items-start justify-center p-4">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-white/50" />
          </div>
        )}
        <img
          key={`${file.id}-${page}`}
          src={filesApi.pdfPageUrl(file.id, page)}
          alt={file.name}
          className="shadow-lg"
          style={{
            width: `${zoom * 100}%`,
            maxWidth: zoom > 1 ? 'none' : '100%',
            opacity: loaded ? 1 : 0,
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1 border-t border-white/10 bg-black/50 px-4 py-2">
        <button
          onClick={() => setZoom(ZOOM_STEPS[Math.max(0, zoomIdx - 1)])}
          disabled={zoomIdx === 0}
          className="flex h-8 w-8 items-center justify-center rounded text-white hover:bg-white/10 disabled:opacity-40"
        >
          <ZoomOut size={16} />
        </button>
        <span className="w-12 text-center text-xs text-white/70">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zoomIdx + 1)])}
          disabled={zoomIdx === ZOOM_STEPS.length - 1}
          className="flex h-8 w-8 items-center justify-center rounded text-white hover:bg-white/10 disabled:opacity-40"
        >
          <ZoomIn size={16} />
        </button>

        {pageCount > 1 && (
          <>
            <div className="mx-1 h-5 w-px bg-white/20" />
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              className="flex h-8 w-8 items-center justify-center rounded text-white hover:bg-white/10 disabled:opacity-40"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="w-16 text-center text-sm text-white/70">
              {t('preview.counter', { current: page + 1, total: pageCount })}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page === pageCount - 1}
              className="flex h-8 w-8 items-center justify-center rounded text-white hover:bg-white/10 disabled:opacity-40"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
