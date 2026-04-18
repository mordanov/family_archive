export type FileKind = 'image' | 'video' | 'audio' | 'zip' | 'pdf' | 'text' | 'other'

export function classifyMime(ct: string, name?: string): FileKind {
  const lower = (ct || '').toLowerCase()
  if (lower.startsWith('image/')) return 'image'
  if (lower.startsWith('video/')) return 'video'
  if (lower.startsWith('audio/')) return 'audio'
  if (lower === 'application/zip' || lower === 'application/x-zip-compressed') return 'zip'
  if (lower === 'application/pdf') return 'pdf'
  if (lower.startsWith('text/')) return 'text'
  if (name) {
    const ext = name.toLowerCase().split('.').pop() || ''
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic'].includes(ext)) return 'image'
    if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return 'video'
    if (['mp3', 'm4a', 'ogg', 'flac', 'wav'].includes(ext)) return 'audio'
    if (ext === 'zip') return 'zip'
    if (ext === 'pdf') return 'pdf'
  }
  return 'other'
}

