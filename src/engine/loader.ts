import type { Loop, LoadedLoop } from './types'

/**
 * fetch + decodeAudioData with a small LRU cache of decoded AudioBuffers.
 * Decoding is on demand (iOS decode is slow), never for the whole library.
 */
export class Loader {
  private cache = new Map<string, AudioBuffer>() // insertion order == recency
  private inflight = new Map<string, Promise<AudioBuffer>>()

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly capacity = 30,
  ) {}

  get size(): number {
    return this.cache.size
  }

  has(url: string): boolean {
    return this.cache.has(url)
  }

  async buffer(url: string): Promise<AudioBuffer> {
    const hit = this.cache.get(url)
    if (hit) {
      // refresh recency
      this.cache.delete(url)
      this.cache.set(url, hit)
      return hit
    }
    const pending = this.inflight.get(url)
    if (pending) return pending

    const p = this.fetchAndDecode(url)
      .then((buf) => {
        this.cache.set(url, buf)
        this.evict()
        return buf
      })
      .finally(() => this.inflight.delete(url))
    this.inflight.set(url, p)
    return p
  }

  /** Returns the same Loop object with `buffer` populated. */
  async load<L extends Loop>(loop: L): Promise<L & LoadedLoop> {
    if (loop.buffer) return loop as L & LoadedLoop
    const buffer = await this.buffer(loop.url)
    loop.buffer = buffer
    return loop as L & LoadedLoop
  }

  private async fetchAndDecode(url: string): Promise<AudioBuffer> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
    const bytes = await res.arrayBuffer()
    return decode(this.ctx, bytes)
  }

  private evict(): void {
    while (this.cache.size > this.capacity) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }
}

/** Promise-style decode with a callback fallback for older WebKit. */
function decode(ctx: BaseAudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const maybe = ctx.decodeAudioData(bytes, resolve, reject) as unknown
    if (maybe && typeof (maybe as Promise<AudioBuffer>).then === 'function') {
      ;(maybe as Promise<AudioBuffer>).then(resolve, reject)
    }
  })
}
