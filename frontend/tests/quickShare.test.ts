import { describe, expect, it } from 'vitest'
import { directDownloadUrl, joinLinks } from '@/lib/quickShare'

describe('quickShare', () => {
  it('joins links with CR/LF', () => {
    expect(joinLinks(['a', 'b', 'c'])).toBe('a\r\nb\r\nc')
  })

  it('builds an absolute direct download url', () => {
    expect(directDownloadUrl('tok')).toMatch(/^https?:\/\/[^/]+.*\/shares\/tok\/download$/)
  })
})
