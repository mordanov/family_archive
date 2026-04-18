// Slice a File into chunks of a given size.
export function chunksOf(file: File, chunkSize: number): { partNumber: number; start: number; end: number }[] {
  const out: { partNumber: number; start: number; end: number }[] = []
  if (file.size === 0) {
    out.push({ partNumber: 1, start: 0, end: 0 })
    return out
  }
  let start = 0
  let n = 1
  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size)
    out.push({ partNumber: n, start, end })
    start = end
    n += 1
  }
  return out
}

