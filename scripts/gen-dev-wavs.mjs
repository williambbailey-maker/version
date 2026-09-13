// Generates placeholder loops for /public/dev/ so phase 1 runs out of the box.
// Replace them with real recordings; keep src/lib/devLoops.ts in sync.
//
//   drums-100.wav   100 BPM, 2 bars  (kick / snare / hat)
//   sample-88.wav    88 BPM, 2 bars  (synth arpeggio, 8ths)
//   sample-120.wav  120 BPM, 1 bar   (synth stabs, offbeat)
//
// Each file is trimmed exactly to bars * 240 / bpm seconds. Mono 16-bit 44.1k.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'dev')
mkdirSync(OUT, { recursive: true })

function wav(samples) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return buf
}

function loopBuffer(bpm, bars) {
  return new Float32Array(Math.round((bars * 240 / bpm) * SR))
}

function add(out, at, gen, dur) {
  const start = Math.round(at * SR)
  const len = Math.round(dur * SR)
  for (let i = 0; i < len && start + i < out.length; i++) out[start + i] += gen(i / SR)
}

const kick = (t) => Math.sin(2 * Math.PI * (50 + 100 * Math.exp(-t * 40)) * t) * Math.exp(-t * 9) * 0.9
const snare = (t) => ((Math.random() * 2 - 1) * 0.5 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * Math.exp(-t * 18) * 0.7
const hat = (t) => (Math.random() * 2 - 1) * Math.exp(-t * 80) * 0.25
const midi = (n) => 440 * 2 ** ((n - 69) / 12)
const tone = (f, decay, amp) => (t) => (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t)) * Math.exp(-t * decay) * amp

function drums(bpm, bars) {
  const out = loopBuffer(bpm, bars)
  const beat = 60 / bpm
  for (let b = 0; b < bars * 4; b++) {
    const t = b * beat
    if (b % 2 === 0) add(out, t, kick, 0.4)
    else add(out, t, snare, 0.3)
    add(out, t, hat, 0.1)
    add(out, t + beat / 2, hat, 0.1)
  }
  return out
}

function arp(bpm, bars, notes) {
  const out = loopBuffer(bpm, bars)
  const eighth = 30 / bpm
  const steps = bars * 8
  for (let s = 0; s < steps; s++) {
    const n = notes[s % notes.length]
    add(out, s * eighth, tone(midi(n), 6, 0.35), eighth * 1.5)
  }
  return out
}

function stabs(bpm, bars, chord) {
  const out = loopBuffer(bpm, bars)
  const eighth = 30 / bpm
  for (let s = 1; s < bars * 8; s += 2) {
    for (const n of chord) add(out, s * eighth, tone(midi(n), 10, 0.2), eighth)
  }
  return out
}

writeFileSync(join(OUT, 'drums-100.wav'), wav(drums(100, 2)))
writeFileSync(join(OUT, 'sample-88.wav'), wav(arp(88, 2, [57, 64, 69, 72, 71, 69, 64, 60])))
writeFileSync(join(OUT, 'sample-120.wav'), wav(stabs(120, 1, [62, 65, 69, 72])))
console.log('wrote drums-100.wav, sample-88.wav, sample-120.wav to', OUT)
