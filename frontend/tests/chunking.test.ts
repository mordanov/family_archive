import { describe, it, expect } from 'vitest'
import { chunksOf } from '@/lib/chunking'

describe('chunksOf', () => {
  it('handles empty file', () => {
    const f = new File([], 'a.bin')
    expect(chunksOf(f, 1024)).toEqual([{ partNumber: 1, start: 0, end: 0 }])
  })

  it('splits file into equal parts plus remainder', () => {
    const f = new File([new Uint8Array(2500)], 'a.bin')
    const c = chunksOf(f, 1024)
    expect(c).toEqual([
      { partNumber: 1, start: 0, end: 1024 },
      { partNumber: 2, start: 1024, end: 2048 },
      { partNumber: 3, start: 2048, end: 2500 },
    ])
  })

  it('returns single part when file fits in one chunk', () => {
    const f = new File([new Uint8Array(100)], 'a.bin')
    expect(chunksOf(f, 1024)).toEqual([{ partNumber: 1, start: 0, end: 100 }])
  })
})

