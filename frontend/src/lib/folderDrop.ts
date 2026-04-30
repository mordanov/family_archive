import { foldersApi } from '@/api/folders'

export interface FileWithFolder {
  file: File
  folderId: number
}

// readEntries() returns at most 100 entries per call — drain until empty.
async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    )
    if (!batch.length) break
    all.push(...batch)
  }
  return all
}

async function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function processEntries(
  entries: FileSystemEntry[],
  folderId: number,
  result: FileWithFolder[],
): Promise<void> {
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.isFile) {
        const file = await entryFile(entry as FileSystemFileEntry)
        result.push({ file, folderId })
      } else if (entry.isDirectory) {
        const created = await foldersApi.create(folderId, entry.name)
        const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader())
        await processEntries(children, created.id, result)
      }
    }),
  )
}

/**
 * Collect all files from a drop event, creating backend folders for any
 * dropped directories (recursively). Returns flat list of {file, folderId}
 * pairs ready to queue.
 *
 * IMPORTANT: entries are extracted from DataTransferItemList synchronously
 * before the first await, because the browser clears the list after the
 * event handler's synchronous portion returns.
 */
export async function collectDroppedFiles(
  items: DataTransferItemList,
  rootFolderId: number,
): Promise<FileWithFolder[]> {
  const entries: FileSystemEntry[] = []
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }
  if (!entries.length) return []
  const result: FileWithFolder[] = []
  await processEntries(entries, rootFolderId, result)
  return result
}
