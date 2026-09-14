/**
 * AudioContext singleton.
 *
 * Safari (especially iOS) only lets a context run when it was created or
 * resume()d from inside a user gesture. `ensureRunning()` is the thing to
 * call from click/touch handlers; everything else uses `getContext()`.
 */

type AudioContextCtor = typeof AudioContext

let ctx: AudioContext | null = null

function ctor(): AudioContextCtor {
  const w = globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  const C = w.AudioContext ?? w.webkitAudioContext
  if (!C) throw new Error('Web Audio API is not available in this browser')
  return C
}

export function getContext(): AudioContext {
  if (!ctx) {
    const C = ctor()
    ctx = new C({ latencyHint: 'interactive' })
  }
  return ctx
}

/** Create/resume inside a user gesture. Resolves once the context is running. */
export async function ensureRunning(): Promise<AudioContext> {
  const c = getContext()
  if (c.state !== 'running') {
    await c.resume()
  }
  return c
}

/** Test seam: drop the singleton so a fresh context is created next time. */
export function _resetContextForTests(): void {
  ctx = null
}
