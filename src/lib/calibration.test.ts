import { describe, expect, it } from 'vitest'
import { CLICK_AT_SEC, offsetFromClick } from './calibration'

const SR = 44100

function clickAt(sec: number, preEcho = 0): Float32Array {
  const s = new Float32Array(SR)
  const at = Math.round(sec * SR)
  for (let i = 0; i < 8; i++) s[at + i] = 0.9 * (i % 2 === 0 ? 1 : -1)
  for (let i = 1; i <= 200; i++) s[at - i] = preEcho * Math.sin(i)
  return s
}

describe('offsetFromClick', () => {
  it('is zero when the decoder trims priming', () => {
    expect(offsetFromClick(clickAt(CLICK_AT_SEC), SR)).toBe(0)
  })
  it('measures untrimmed priming (e.g. 1105 samples for mp3)', () => {
    const off = offsetFromClick(clickAt(CLICK_AT_SEC + 1105 / SR), SR)
    expect(Math.round(off * SR)).toBe(1105)
  })
  it('ignores codec pre-echo before the click', () => {
    const off = offsetFromClick(clickAt(CLICK_AT_SEC + 0.05, 0.2), SR)
    expect(Math.abs(off - 0.05)).toBeLessThan(0.0005)
  })
  it('is zero for silence', () => {
    expect(offsetFromClick(new Float32Array(SR), SR)).toBe(0)
  })
})
