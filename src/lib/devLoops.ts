import type { Loop } from '../engine/types'
import { DEFAULT_GAIN } from '../engine/types'

/**
 * Phase-1 hardcoded library. Files live in /public/dev/. Replace the WAVs
 * with real recordings; keep bpm + bars here in sync with what you drop in.
 */
export const DEV_LOOPS: readonly Loop[] = [
  { id: 'drums-100', name: 'Drums 100', url: '/dev/drums-100.wav', bpm: 100, bars: 2, kind: 'drums', gain: DEFAULT_GAIN },
  { id: 'sample-88', name: 'Sample 88', url: '/dev/sample-88.wav', bpm: 88, bars: 2, kind: 'sample', gain: DEFAULT_GAIN },
  { id: 'sample-120', name: 'Sample 120', url: '/dev/sample-120.wav', bpm: 120, bars: 1, kind: 'sample', gain: DEFAULT_GAIN },
]
