import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { downloadsApi } from '@/api/downloads'
import { formatBytes, formatDateTime } from '@/lib/formatters'
import { mapErrorToI18n } from '@/i18n/errors'
import type { DownloadItem } from '@/types/api'
import { Download, Loader2, Share2, User } from 'lucide-react'

export function formatDownloadSource(item: DownloadItem, t: (k: string, opts?: Record<string, unknown>) => string): string {
  if (item.source === 'direct') {
    return item.username || t('downloads.directUser')
  }
  return item.share_id ? t('downloads.shareSourceWithId', { id: item.share_id }) : t('downloads.shareSource')
}

export function DownloadsPage() {
  const { t } = useTranslation()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['downloads'],
    queryFn: () => downloadsApi.list(100),
    refetchInterval: 1500,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-ink-muted">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  if (isError) {
    return <div className="p-6 text-red-600">{mapErrorToI18n(t, error)}</div>
  }

  const active = data?.active ?? []
  const history = data?.history ?? []

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t('downloads.title')}</h2>
          <p className="text-xs text-ink-muted">{t('downloads.subtitle')}</p>
        </div>
        <span className="rounded bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
          {t('downloads.activeCount', { count: active.length })}
        </span>
      </div>

      {/* Active Downloads */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">{t('downloads.activeSection')}</h3>
        <div className="rounded border border-surface-strong bg-surface">
          {active.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-muted">{t('downloads.noActive')}</div>
          ) : (
            active.map((d) => (
              <div key={d.id} className="border-b border-surface-strong p-3 last:border-b-0">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 font-medium text-ink">
                    <Download size={16} className="text-accent animate-bounce" />
                    <span className="truncate">{d.filename}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                      {d.source === 'direct' ? <User size={13} /> : <Share2 size={13} />}
                      {formatDownloadSource(d, t)}
                      {d.ip ? ` (${d.ip})` : ''}
                    </span>
                    <span className="font-mono">
                      {formatBytes(d.speed_bps)}/s
                    </span>
                    <span className="font-mono">
                      {formatBytes(d.bytes_sent)} / {formatBytes(d.total_bytes)} ({d.progress_pct.toFixed(1)}%)
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-surface-strong">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, d.progress_pct))}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Download History */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">{t('downloads.historySection')}</h3>
        <div className="overflow-x-auto rounded border border-surface-strong bg-surface">
          {history.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-muted">{t('downloads.noHistory')}</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-surface-strong bg-surface-muted text-xs text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('downloads.colFile')}</th>
                  <th className="px-3 py-2 font-medium">{t('downloads.colSource')}</th>
                  <th className="px-3 py-2 font-medium">{t('downloads.colIp')}</th>
                  <th className="px-3 py-2 font-medium">{t('downloads.colTransferred')}</th>
                  <th className="px-3 py-2 font-medium">{t('downloads.colStatus')}</th>
                  <th className="px-3 py-2 font-medium">{t('downloads.colTime')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-surface-strong last:border-b-0">
                    <td className="px-3 py-2 font-medium text-ink">{h.filename}</td>
                    <td className="px-3 py-2 text-xs text-ink-muted">
                      <span className="inline-flex items-center gap-1">
                        {h.source === 'direct' ? <User size={13} /> : <Share2 size={13} />}
                        {formatDownloadSource(h, t)}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-muted">{h.ip || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-muted">
                      {formatBytes(h.bytes_sent)} / {formatBytes(h.total_bytes)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span
                        className={`inline-block rounded px-2 py-0.5 font-medium ${
                          h.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : h.status === 'aborted'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {t(`downloads.status_${h.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-muted">
                      {formatDateTime(h.finished_at || h.started_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
