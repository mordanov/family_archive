import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Loader2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { filesApi } from '@/api/files'
import { classifyMime } from '@/lib/mime'
import { useFolderChildren } from '@/hooks/useFolderTree'
import { useUI } from '@/stores/uiStore'
import { ImagePreview } from './ImagePreview'
import { VideoPreview } from './VideoPreview'
import { AudioPreview } from './AudioPreview'
import { ZipPreview } from './ZipPreview'
import { FileInfoPanel } from './FileInfoPanel'

const ZOOM_STEPS = [1, 1.5, 2, 3, 4]

export function PreviewModal() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const fileId = useUI((s) => s.previewFileId)
  const close = () => useUI.getState().setPreviewFileId(null)

  const [zoom, setZoom] = useState(1)
  const [infoOpen, setInfoOpen] = useState(false)

  const { data: file } = useQuery({
    queryKey: ['file', fileId],
    queryFn: () => filesApi.get(fileId!),
    enabled: fileId != null,
  })

  const kind = file ? classifyMime(file.content_type, file.name) : null

  // Folder children for prev/next navigation (likely already cached from FileList)
  const { data: folderData } = useFolderChildren(file?.folder_id ?? 0, {
    enabled: file != null,
  })

  const siblings = useMemo(() => {
    if (!file || !folderData || !kind) return []
    return folderData.files.filter(
      (f) => classifyMime(f.content_type, f.name) === kind,
    )
  }, [file, folderData, kind])

  const currentIndex = file ? siblings.findIndex((f) => f.id === file.id) : -1

  const goNext = () => {
    if (siblings.length < 2 || currentIndex === -1) return
    const next = siblings[(currentIndex + 1) % siblings.length]
    useUI.getState().setPreviewFileId(next.id)
    setZoom(1)
  }

  const goPrev = () => {
    if (siblings.length < 2 || currentIndex === -1) return
    const prev = siblings[(currentIndex - 1 + siblings.length) % siblings.length]
    useUI.getState().setPreviewFileId(prev.id)
    setZoom(1)
  }

  const zoomIn = () => {
    setZoom((z) => {
      const idx = ZOOM_STEPS.indexOf(z)
      return idx < ZOOM_STEPS.length - 1 ? ZOOM_STEPS[idx + 1] : z
    })
  }

  const zoomOut = () => {
    setZoom((z) => {
      const idx = ZOOM_STEPS.indexOf(z)
      return idx > 0 ? ZOOM_STEPS[idx - 1] : z
    })
  }

  const rotateMutation = useMutation({
    mutationFn: () => filesApi.rotate(fileId!),
    onSuccess: (updated) => {
      qc.setQueryData(['file', fileId], updated)
      qc.invalidateQueries({ queryKey: ['file-meta', fileId] })
      setZoom(1)
    },
  })

  const handleRotate = () => {
    if (kind !== 'image' || rotateMutation.isPending) return
    rotateMutation.mutate()
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
      else if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.metaKey)
        setInfoOpen((v) => !v)
      else if ((e.key === 'r' || e.key === 'R') && kind === 'image' && !e.ctrlKey && !e.metaKey)
        handleRotate()
      else if (e.key === '+' || e.key === '=') zoomIn()
      else if (e.key === '-') zoomOut()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  if (fileId == null) return null

  const canShowInfo = kind === 'image' || kind === 'video'

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-white/10 bg-surface/90 px-3 backdrop-blur">
        {/* filename */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {file?.name ?? '…'}
        </span>

        {/* navigation */}
        {siblings.length > 1 && (
          <>
            <button
              onClick={goPrev}
              title={t('preview.previous')}
              className="flex h-8 w-8 items-center justify-center rounded hover:bg-surface-strong"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-[3rem] text-center text-xs text-ink-muted">
              {t('preview.counter', { current: currentIndex + 1, total: siblings.length })}
            </span>
            <button
              onClick={goNext}
              title={t('preview.next')}
              className="flex h-8 w-8 items-center justify-center rounded hover:bg-surface-strong"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}

        <div className="mx-1 h-5 w-px bg-surface-strong" />

        {/* zoom (images only) */}
        {kind === 'image' && (
          <>
            <button
              onClick={zoomOut}
              disabled={zoom === ZOOM_STEPS[0]}
              title={t('preview.zoomOut')}
              className="flex h-8 w-8 items-center justify-center rounded hover:bg-surface-strong disabled:opacity-40"
            >
              <ZoomOut size={16} />
            </button>
            <span className="w-10 text-center text-xs text-ink-muted">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={zoomIn}
              disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              title={t('preview.zoomIn')}
              className="flex h-8 w-8 items-center justify-center rounded hover:bg-surface-strong disabled:opacity-40"
            >
              <ZoomIn size={16} />
            </button>
            <div className="mx-1 h-5 w-px bg-surface-strong" />
          </>
        )}

        {/* rotate (images only) */}
        {kind === 'image' && (
          <button
            onClick={handleRotate}
            disabled={rotateMutation.isPending}
            title={t('preview.rotate')}
            className="flex h-8 w-8 items-center justify-center rounded hover:bg-surface-strong disabled:opacity-40"
          >
            {rotateMutation.isPending
              ? <Loader2 size={16} className="animate-spin" />
              : <RotateCw size={16} />}
          </button>
        )}

        {/* info toggle */}
        {canShowInfo && (
          <button
            onClick={() => setInfoOpen((v) => !v)}
            title={t('preview.info')}
            className={`flex h-8 w-8 items-center justify-center rounded hover:bg-surface-strong ${infoOpen ? 'bg-accent/10 text-accent' : ''}`}
          >
            <Info size={16} />
          </button>
        )}

        {/* download */}
        {file && (
          <a
            href={filesApi.downloadUrl(file.id)}
            title={t('preview.download')}
            className="flex h-8 w-8 items-center justify-center rounded hover:bg-surface-strong"
          >
            <Download size={16} />
          </a>
        )}

        {/* close */}
        <button
          onClick={close}
          title={t('common.close')}
          className="flex h-8 w-8 items-center justify-center rounded hover:bg-surface-strong"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">
          {!file && (
            <Loader2 size={32} className="animate-spin text-white/50" />
          )}
          {file && kind === 'image' && <ImagePreview file={file} zoom={zoom} />}
          {file && kind === 'video' && <VideoPreview file={file} />}
          {file && kind === 'audio' && (
            <div className="w-full max-w-xl p-6">
              <AudioPreview file={file} />
            </div>
          )}
          {file && kind === 'zip' && (
            <div className="h-full w-full overflow-auto">
              <ZipPreview file={file} />
            </div>
          )}
          {file && kind && !['image', 'video', 'audio', 'zip'].includes(kind) && (
            <div className="p-12 text-center text-white/60">
              {t('preview.notAvailable')}
            </div>
          )}
        </div>

        {/* Info panel */}
        {infoOpen && canShowInfo && file && (
          <div className="w-64 shrink-0 overflow-y-auto border-l border-white/10 bg-surface">
            <div className="border-b border-surface-strong px-3 py-2 text-xs font-medium text-ink-muted uppercase tracking-wide">
              {t('preview.info')}
            </div>
            <FileInfoPanel file={file} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
