import { useState } from 'react'
import { orphanedFiles, removeFiles } from '../lib/loops'

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`

/** Finds audio files in storage that no loop points at any more, and removes them. */
export function TidyStorage() {
  const [state, setState] = useState<'idle' | 'scanning' | 'removing' | 'done'>('idle')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setError(null)
    setNote(null)
    setState('scanning')
    try {
      const orphans = await orphanedFiles()
      if (orphans.length === 0) {
        setNote('Storage is tidy: every file belongs to a loop.')
        setState('done')
        return
      }
      const bytes = orphans.reduce((n, f) => n + f.size, 0)
      if (!window.confirm(`Remove ${orphans.length} file${orphans.length === 1 ? '' : 's'} (${mb(bytes)}) that no loop uses any more?`)) {
        setState('idle')
        return
      }
      setState('removing')
      const n = await removeFiles(
        orphans.map((f) => f.path),
        (done) => setNote(`Removing… ${done} / ${orphans.length}`),
      )
      setNote(`Removed ${n} file${n === 1 ? '' : 's'}, freed ${mb(bytes)}.`)
      setState('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('idle')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void run()} disabled={state === 'scanning' || state === 'removing'} className="pill pill-outline">
        {state === 'scanning' ? 'Checking…' : state === 'removing' ? 'Removing…' : 'Tidy storage'}
      </button>
      <span className="mono-label text-muted">{error ?? note ?? 'Removes audio files that no loop uses any more.'}</span>
    </div>
  )
}
