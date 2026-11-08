import { describe, expect, it } from 'vitest'
import { formatDownloadSource } from '@/routes/DownloadsPage'
import type { DownloadItem } from '@/types/api'

const baseItem: DownloadItem = {
  id: '11111111-1111-1111-1111-111111111111',
  file_id: 1,
  filename: 'photo.jpg',
  source: 'direct',
  username: 'alice',
  share_id: null,
  ip: '127.0.0.1',
  total_bytes: 1000,
  bytes_sent: 500,
  progress_pct: 50,
  speed_bps: 250,
  status: 'active',
  started_at: '2026-11-08T10:00:00Z',
  updated_at: '2026-11-08T10:00:02Z',
  finished_at: null,
}

const dummyT = (k: string, opts?: Record<string, unknown>) =>
  opts?.id !== undefined ? `${k}:${opts.id}` : k

describe('formatDownloadSource', () => {
  it('returns username for direct downloads', () => {
    expect(formatDownloadSource(baseItem, dummyT)).toBe('alice')
  })

  it('returns formatted share label for share downloads', () => {
    expect(
      formatDownloadSource({ ...baseItem, source: 'share', username: null, share_id: 42 }, dummyT),
    ).toBe('downloads.shareSourceWithId:42')
  })
})
