import { Pad } from './components/Pad'
import { useEngine } from './hooks/useEngine'
import { DEV_LOOPS } from './lib/devLoops'
import type { Loop } from './engine/types'

export default function App() {
  const engine = useEngine()
  const drums = DEV_LOOPS.filter((l) => l.kind === 'drums')
  const samples = DEV_LOOPS.filter((l) => l.kind === 'sample')

  const activeId = (loop: Loop) => {
    const slot = engine[loop.kind]
    return slot.loop?.id ?? slot.pending?.id ?? null
  }

  const onSelect = (loop: Loop) => {
    void engine.select(loop).catch(() => {})
  }

  const onToggle = () => {
    void engine.toggle().catch(() => {})
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 bg-stone-50 p-6 text-stone-900">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl">Loop Lab</h1>
        <span className="font-mono text-sm text-stone-600">{engine.masterBPM} bpm</span>
      </header>

      <button
        type="button"
        onClick={onToggle}
        className={[
          'min-h-16 rounded-lg px-6 text-xl text-white',
          engine.playing ? 'bg-stone-900' : 'bg-orange-600',
        ].join(' ')}
      >
        {engine.playing ? 'Stop' : 'Play'}
      </button>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm uppercase tracking-wide text-stone-500">Drums</h2>
        {drums.map((loop) => (
          <Pad
            key={loop.id}
            loop={loop}
            active={activeId(loop) === loop.id}
            loading={engine.loading.includes(loop.id)}
            onSelect={onSelect}
          />
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm uppercase tracking-wide text-stone-500">Samples</h2>
        <div className="grid grid-cols-2 gap-2">
          {samples.map((loop) => (
            <Pad
              key={loop.id}
              loop={loop}
              active={activeId(loop) === loop.id}
              loading={engine.loading.includes(loop.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      </section>

      {engine.error && <p className="text-sm text-red-700">{engine.error}</p>}
    </main>
  )
}
