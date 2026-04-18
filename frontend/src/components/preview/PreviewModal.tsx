import { useEffect, useState } from 'react'
import { Modal } from '@/components/dialogs/Modal'
import { useUI } from '@/stores/uiStore'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { filesApi } from '@/api/files'
import { classifyMime } from '@/lib/mime'
import { Download } from 'lucide-react'
import { ImagePreview } from './ImagePreview'
import { VideoPreview } from './VideoPreview'
import { AudioPreview } from './AudioPreview'
import { ZipPreview } from './ZipPreview'

export function PreviewModal() {
  const { t } = useTranslation()
  const fileId = useUI((s) => s.previewFileId)
  const close = () => useUI.getState().setPreviewFileId(null)
  const { data: file } = useQuery({
    queryKey: ['file', fileId],
    queryFn: () => filesApi.get(fileId!),
    enabled: fileId != null,
  })

  if (fileId == null || !file) return null
  const kind = classifyMime(file.content_type, file.name)

  return (
    <Modal open onClose={close} title={file.name} size="xl">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{file.content_type}</span>
          <a
            href={filesApi.downloadUrl(file.id)}
            className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-white hover:bg-accent-hover"
          >
            <Download size={14} /> {t('preview.download')}
          </a>
        </div>
        <div className="flex max-h-[70vh] items-center justify-center overflow-auto rounded bg-black/5">
          {kind === 'image' && <ImagePreview file={file} />}
          {kind === 'video' && <VideoPreview file={file} />}
          {kind === 'audio' && <AudioPreview file={file} />}
          {kind === 'zip' && <ZipPreview file={file} />}
          {!['image', 'video', 'audio', 'zip'].includes(kind) && (
            <div className="p-12 text-center text-ink-muted">
              {t('preview.notAvailable')} {t('preview.notAvailableHint')}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

