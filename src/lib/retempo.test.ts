import { describe, expect, it } from 'vitest'
import { barsSeconds, exportName, rateFor, renderFrames } from './retempo'
import { encodeWav, wavSize } from './wav'
import { buildZip, crc32 } from './zip'

describe('retempo maths', () => {
  it('rate and lengths follow the tempo ratio', () => {
    expect(rateFor(140, 70)).toBe(0.5)
    expect(rateFor(90, 90)).toBe(1)
    expect(() => rateFor(0, 90)).toThrow()
    expect(barsSeconds(2, 120)).toBe(4)
    expect(renderFrames(2, 120, 44100)).toBe(176400)
    expect(renderFrames(4, 90, 48000)).toBe(Math.round((4 * 240 / 90) * 48000))
  })
  it('names exports after the target, dropping an old bpm tag and the extension', () => {
    expect(exportName('Trombone Protection.wav', 90)).toBe('Trombone Protection 90bpm.wav')
    expect(exportName('Skank 140bpm.aif', 70)).toBe('Skank 70bpm.wav')
    expect(exportName('BOS - Bongo Bolero', 85)).toBe('BOS - Bongo Bolero 85bpm.wav')
  })
})

describe('wav', () => {
  it('writes a valid 24-bit stereo header and clamps samples', () => {
    const l = new Float32Array([0, 0.5, -0.5, 2])
    const r = new Float32Array([0, -1, 1, -2])
    const buf = encodeWav([l, r], 48000, 24)
    const v = new DataView(buf)
    expect(buf.byteLength).toBe(wavSize(4, 2, 24))
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF')
    expect(v.getUint16(22, true)).toBe(2) // channels
    expect(v.getUint32(24, true)).toBe(48000)
    expect(v.getUint16(34, true)).toBe(24)
    expect(v.getUint32(40, true)).toBe(4 * 2 * 3)
    // frame 3: L clamps to +max, R to -max
    const off = 44 + 3 * 6
    const l3 = v.getUint8(off) | (v.getUint8(off + 1) << 8) | (v.getUint8(off + 2) << 16)
    expect(l3).toBe(8388607)
    const r3 = (v.getUint8(off + 3) | (v.getUint8(off + 4) << 8) | (v.getUint8(off + 5) << 16)) << 8 >> 8
    expect(r3).toBe(-8388608)
  })
  it('16-bit is half the size', () => {
    const buf = encodeWav([new Float32Array(10)], 44100, 16)
    expect(buf.byteLength).toBe(44 + 20)
  })
})

describe('zip', () => {
  it('crc32 matches a known value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('lays out local headers, central directory and end record', () => {
    const a = new TextEncoder().encode('hello')
    const zip = buildZip([{ name: 'a.txt', data: a }], new Date(2026, 0, 2, 3, 4, 6))
    const v = new DataView(zip.buffer)
    expect(v.getUint32(0, true)).toBe(0x04034b50)
    expect(v.getUint32(18, true)).toBe(5)
    const localLen = 30 + 5 + 5
    expect(v.getUint32(localLen, true)).toBe(0x02014b50)
    const endOff = zip.length - 22
    expect(v.getUint32(endOff, true)).toBe(0x06054b50)
    expect(v.getUint16(endOff + 10, true)).toBe(1)
    expect(v.getUint32(endOff + 16, true)).toBe(localLen)
    expect(new TextDecoder().decode(zip.slice(30, 35))).toBe('a.txt')
  })
})
