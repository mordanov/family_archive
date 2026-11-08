import { apiBase } from '@/api/client'
import { sharesApi } from '@/api/shares'

export const QUICK_LINK_DAYS = 30

export function directDownloadUrl(token: string): string {
  return new URL(`${apiBase}/shares/${token}/download`, window.location.origin).toString()
}

export function joinLinks(urls: string[]): string {
  return urls.join('\r\n')
}

function expiry(): string {
  return new Date(Date.now() + QUICK_LINK_DAYS * 86_400_000).toISOString()
}

/** Writes text that is resolved asynchronously; keeps Safari's user-gesture requirement satisfied. */
export async function copyAsync(textPromise: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const blob = textPromise.then((t) => new Blob([t], { type: 'text/plain' }))
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
    return
  }
  await navigator.clipboard.writeText(await textPromise)
}

export function quickFileLink(fileId: number): Promise<string> {
  return sharesApi.createForFile(fileId, { expires_at: expiry() }).then((s) => directDownloadUrl(s.token))
}

export async function quickFolderLinks(folderId: number): Promise<{ text: string; count: number }> {
  const rows = await sharesApi.createFolderLinks(folderId, { expires_at: expiry() })
  return { text: joinLinks(rows.map((r) => directDownloadUrl(r.token))), count: rows.length }
}
