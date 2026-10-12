/**
 * Read a drag-and-drop payload, walking dropped folders recursively.
 *
 * Browsers expose dropped directories through `webkitGetAsEntry()`
 * (Chrome, Safari, Firefox). Each file comes back with the path it had
 * inside the drop, e.g. "Reggae Horns/Trombone/BOS_90_Protection_C.wav",
 * so the top folder can become the pack and deeper folders the category.
 */

export type DroppedFile = { file: File; path: string }

const AUDIO_RE = /\.(wav|aif|aiff|flac|mp3|m4a)$/i

export async function readDrop(dt: DataTransfer): Promise<DroppedFile[]> {
  const out: DroppedFile[] = []
  const entries: FileSystemEntry[] = []
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== 'file') continue
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
    if (entry) entries.push(entry)
  }
  if (entries.length > 0) {
    for (const entry of entries) await walk(entry, '', out)
  } else {
    // No entry API: plain files only, no folder structure.
    for (const file of Array.from(dt.files ?? [])) out.push({ file, path: file.name })
  }
  return out.filter((d) => AUDIO_RE.test(d.file.name) && !d.file.name.startsWith('.'))
}

async function walk(entry: FileSystemEntry, prefix: string, out: DroppedFile[]): Promise<void> {
  if (entry.name.startsWith('.')) return // .DS_Store, ._resource forks
  const path = prefix ? `${prefix}/${entry.name}` : entry.name
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    out.push({ file, path })
    return
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries returns batches; keep reading until an empty one.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
      if (batch.length === 0) break
      for (const child of batch) await walk(child, path, out)
    }
  }
}

/** True when a drag carries files (so we can light up the drop target). */
export function dragHasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types ?? []).includes('Files')
}
