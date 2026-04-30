import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { filesApi } from '@/api/files'
import type { FileItem } from '@/types/api'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div className="flex gap-2 py-0.5 text-xs">
      <span className="w-28 shrink-0 text-ink-muted">{label}</span>
      <span className="break-all text-ink">{String(value)}</span>
    </div>
  )
}

export function FileInfoPanel({ file }: { file: FileItem }) {
  const { t } = useTranslation()
  const { data: meta, isLoading } = useQuery({
    queryKey: ['file-meta', file.id],
    queryFn: () => filesApi.meta(file.id),
    staleTime: 60_000,
  })

  if (isLoading) {
    return <div className="p-3 text-xs text-ink-muted">{t('common.loading')}</div>
  }

  const camera = [meta?.Make, meta?.Model].filter(Boolean).join(' ') || null
  const exposure = meta?.ExposureTime != null
    ? (meta.ExposureTime < 1 ? `1/${Math.round(1 / meta.ExposureTime)}s` : `${meta.ExposureTime}s`)
    : null

  return (
    <div className="flex flex-col gap-0.5 p-3">
      <Row label={t('preview.infoSize')} value={formatBytes(file.size_bytes)} />
      <Row label={t('preview.infoType')} value={file.content_type} />
      <Row label={t('preview.infoCreated')} value={new Date(file.created_at).toLocaleString()} />
      {meta?.width != null && meta?.height != null && (
        <Row label={t('preview.infoDimensions')} value={`${meta.width} × ${meta.height}`} />
      )}
      {camera && <Row label={t('preview.infoCamera')} value={camera} />}
      {meta?.DateTimeOriginal && <Row label={t('preview.infoTaken')} value={String(meta.DateTimeOriginal)} />}
      {exposure && <Row label={t('preview.infoExposure')} value={exposure} />}
      {meta?.FNumber != null && <Row label={t('preview.infoAperture')} value={`f/${meta.FNumber}`} />}
      {meta?.ISOSpeedRatings != null && <Row label={t('preview.infoISO')} value={String(meta.ISOSpeedRatings)} />}
      {meta?.FocalLength != null && <Row label={t('preview.infoFocal')} value={`${meta.FocalLength} mm`} />}
      {meta?.GPSLatitude != null && meta?.GPSLongitude != null && (
        <Row label={t('preview.infoGPS')} value={`${meta.GPSLatitude}, ${meta.GPSLongitude}`} />
      )}
      {meta?.duration != null && (
        <Row label={t('preview.infoDuration')} value={formatDuration(meta.duration)} />
      )}
      {meta?.video_codec && <Row label={t('preview.infoVideoCodec')} value={String(meta.video_codec)} />}
      {meta?.audio_codec && <Row label={t('preview.infoAudioCodec')} value={String(meta.audio_codec)} />}
      {meta?.fps != null && <Row label={t('preview.infoFPS')} value={`${meta.fps} fps`} />}
      {meta?.bit_rate != null && (
        <Row label={t('preview.infoBitrate')} value={`${Math.round(meta.bit_rate / 1000)} kbps`} />
      )}
    </div>
  )
}
