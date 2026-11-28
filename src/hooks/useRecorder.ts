import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { ChannelMode } from '../engine/capture'
import { getContext } from '../engine/context'
import { getEngine } from '../engine/engine'
import { getRecorder } from '../engine/recorder'
import type { RecordedTake, RecorderState } from '../engine/recorder'

/**
 * The React ↔ recorder bridge, the recording counterpart of useEngine().
 * Capturing, bar timing and latency all happen inside the engine layer.
 */
export function useRecorder(): RecorderState & {
  open: (deviceId?: string | null) => Promise<void>
  close: () => void
  /** Record up to 64 bars; ends on Stop, when playback stops, or at the limit. */
  record: (mode: ChannelMode) => Promise<RecordedTake>
  /** Play some recorded audio once; returns a stop function. */
  preview: (channels: readonly Float32Array[], sampleRate: number, onEnded?: () => void) => () => void
  finish: () => void
  cancel: () => void
  calibrate: ReturnType<typeof getRecorder>['calibrate']
  setLatency: (latencySec: number) => void
  levels: () => [number, number]
  /** AudioContext clock, for countdown displays only. */
  now: () => number
  /** Wrap a take's samples in an AudioBuffer so it can be auditioned as a loop. */
  toBuffer: (take: Pick<RecordedTake, 'channels' | 'sampleRate'>) => AudioBuffer
} {
  const recorder = useMemo(() => getRecorder(getContext()), [])
  const subscribe = useCallback((fn: () => void) => recorder.subscribe(fn), [recorder])
  const state = useSyncExternalStore(subscribe, () => recorder.state, () => recorder.state)

  const open = useCallback((id?: string | null) => recorder.open(id), [recorder])
  const close = useCallback(() => recorder.close(), [recorder])
  const record = useCallback((mode: ChannelMode) => recorder.record(getEngine(), mode), [recorder])
  const preview = useCallback((channels: readonly Float32Array[], sampleRate: number, onEnded?: () => void) => recorder.preview(getEngine(), channels, sampleRate, onEnded), [recorder])
  const finish = useCallback(() => recorder.finish(), [recorder])
  const cancel = useCallback(() => recorder.cancel(), [recorder])
  const calibrate = useCallback(() => recorder.calibrate(), [recorder])
  const setLatency = useCallback((v: number) => recorder.setLatency(v), [recorder])
  const levels = useCallback(() => recorder.levels(), [recorder])
  const now = useCallback(() => getContext().currentTime, [])
  const toBuffer = useCallback((take: Pick<RecordedTake, 'channels' | 'sampleRate'>) => {
    const buffer = getContext().createBuffer(take.channels.length, take.channels[0]!.length, take.sampleRate)
    take.channels.forEach((c, i) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i))
    return buffer
  }, [])

  return { ...state, open, close, record, preview, finish, cancel, calibrate, setLatency, levels, now, toBuffer }
}
