import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { filesApi } from '@/api/files'
import type { FileItem, ZipEntry } from '@/types/api'
import { formatBytes } from '@/lib/formatters'
import { mapErrorToI18n } from '@/i18n/errors'
import { Download, Folder as FolderIcon, FileIcon } from 'lucide-react'

export function ZipPreview({ file }: { file: FileItem }) {
  const { t } = useTranslation()
  const { data: entries, isLoading, error } = useQuery({
    queryKey: ['zip-entries', file.id],
    queryFn: () => filesApi.zipEntries(file.id),
  })
  const [selected, setSelected] = useState<ZipEntry | null>(null)

  if (isLoading) return <div className="p-8 text-ink-muted">{t('preview.readingArchive')}</div>
  if (error) return <div className="p-8 text-red-600">{mapErrorToI18n(t, error)}</div>

  return (
    <div className="grid w-full grid-cols-1 gap-3 p-3 md:grid-cols-2">
      <ul className="max-h-[60vh] overflow-auto rounded border border-surface-strong bg-surface text-sm">
        {entries!.map((e) => (
          <li key={e.path}>
            <button
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-surface-muted ${selected?.path === e.path ? 'bg-accent/10' : ''}`}
              onClick={() => setSelected(e)}
            >
              <span className="flex items-center gap-2 truncate">
                {e.is_dir ? <FolderIcon size={14} /> : <FileIcon size={14} />}
                <span className="truncate">{e.path}</span>
              </span>
              <span className="shrink-0 text-xs text-ink-muted">{e.is_dir ? '' : formatBytes(e.size)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="rounded border border-surface-strong bg-surface p-3 text-sm">
        {!selected && <p className="text-ink-muted">{t('preview.selectEntry')}</p>}
        {selected && (
          <div className="flex flex-col gap-2">
            <div className="font-mono text-xs break-all">{selected.path}</div>
            <div className="text-xs text-ink-muted">{formatBytes(selected.size)}</div>
            {!selected.is_dir && (
              <a
                href={filesApi.zipEntryUrl(file.id, selected.path)}
                className="inline-flex w-fit items-center gap-1 rounded bg-accent px-3 py-1.5 text-white hover:bg-accent-hover"
                download
              >
                <Download size={14} /> {t('preview.downloadEntry')}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

