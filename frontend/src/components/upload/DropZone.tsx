import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useUploads } from '@/stores/uploadStore'
import { collectDroppedFiles } from '@/lib/folderDrop'

interface Props { folderId: number; children: React.ReactNode }

export function DropZone({ folderId, children }: Props) {
  const { t } = useTranslation()
  const [over, setOver] = useState(false)
  const add = useUploads((s) => s.add)
  const qc = useQueryClient()

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setOver(true) }}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={(e) => { e.preventDefault(); setOver(false) }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        // Capture flat file list synchronously as fallback for browsers without
        // Entry API support (webkitGetAsEntry returns null for all items).
        const flatFiles = Array.from(e.dataTransfer.files)
        collectDroppedFiles(e.dataTransfer.items, folderId).then((collected) => {
          if (collected.length > 0) {
            collected.forEach(({ file, folderId: targetId }) => add(file, targetId))
            qc.invalidateQueries({ queryKey: ['folder-children', folderId] })
          } else {
            flatFiles.forEach((f) => add(f, folderId))
          }
        })
      }}
      className="relative h-full"
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-accent/5 text-accent">
          <Upload className="mr-2" />
          <span className="font-semibold">{t('upload.dropToUploadHere')}</span>
        </div>
      )}
    </div>
  )
}

export function UploadButton({ folderId }: { folderId: number }) {
  const { t } = useTranslation()
  const add = useUploads((s) => s.add)
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-hover">
      <Upload size={16} /> {t('navigation.upload')}
      <input
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          files.forEach((f) => add(f, folderId))
          e.target.value = ''
        }}
      />
    </label>
  )
}
