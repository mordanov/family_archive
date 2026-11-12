import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { filesApi } from '@/api/files'
import type { FileItem } from '@/types/api'

interface Props {
  file: FileItem
}

export function PdfPreview({ file }: Props) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
  }, [page, file.id])

  const { data: info } = useQuery({
    queryKey: ['pdf-info', file.id],
    queryFn: () => filesApi.pdfInfo(file.id),
  })

  const pageCount = info?.page_count ?? 1

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
          className="max-w-full shadow-lg"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      </div>

      {pageCount > 1 && (
        <div className="flex shrink-0 items-center gap-3 border-t border-white/10 bg-black/50 px-4 py-2">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
            className="flex h-8 w-8 items-center justify-center rounded text-white hover:bg-white/10 disabled:opacity-40"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-white/70">
            {t('preview.counter', { current: page + 1, total: pageCount })}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page === pageCount - 1}
            className="flex h-8 w-8 items-center justify-center rounded text-white hover:bg-white/10 disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
