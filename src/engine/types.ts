export type Bars = 1 | 2 | 4 | 8

export type LoopKind = 'drums' | 'sample'

export type Loop = {
  id: string
  name: string
  url: string          // Supabase Storage (or /dev/*.wav in phase 1)
  bpm: number          // native tempo of the recording
  bars: Bars           // length in bars, 4/4 assumed
  kind: LoopKind
  gain: number         // 0..1, default 0.8
  buffer?: AudioBuffer // decoded, in-memory only
}

export type LoadedLoop = Loop & { buffer: AudioBuffer }

export const DEFAULT_GAIN = 0.8

export function isPowerOfTwoBars(bars: number): bars is Bars {
  return bars === 1 || bars === 2 || bars === 4 || bars === 8
}

/** Musical length of a loop in seconds at its native tempo. */
export function loopLengthSec(loop: Pick<Loop, 'bpm' | 'bars'>): number {
  return (loop.bars * 240) / loop.bpm
}
