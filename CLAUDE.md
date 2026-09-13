# Loop Lab — project brief

Browser-based loop auditioning tool. I record exact, loopable drum beats. I have a library of sampled loops recorded at other tempos. I want to click a sample loop and immediately hear it locked to my drums, at the drum tempo, swapped in on the next bar. That's the product.

## Stack

React 18, Vite, TypeScript (strict), Tailwind. Supabase for library metadata + Storage for audio files. Deployed on Vercel as a PWA. Must work on iPhone Safari and desktop Chrome.

## Core model — read this before touching audio code

**Every loop is the same kind of object.** A drum loop and a sample loop are both `Loop`:

```ts
type Loop = {
  id: string
  name: string
  url: string          // Supabase Storage
  bpm: number          // native tempo of the recording
  bars: 1 | 2 | 4 | 8  // length in bars, 4/4 assumed
  kind: 'drums' | 'sample'
  gain: number         // 0..1, default 0.8
  buffer?: AudioBuffer // decoded, in-memory only
}
```

**The drum slot is the master clock.** `masterBPM = drumLoop.bpm`. `barSec = 240 / masterBPM`. Nothing else defines time.

**Tempo matching is varispeed, not time-stretch.** `source.playbackRate = masterBPM / loop.bpm`. Pitch changes with tempo. This is intentional and is the default forever. Do not add a time-stretch/phase-vocoder implementation unless explicitly asked.

**All loops start on the same scheduled timestamp and loop natively.** One `AudioBufferSourceNode` per slot, `loop = true`, `loopEnd = loop.buffer.duration` (native length — playbackRate handles the rest). Never call `.start()` with no argument; always `.start(atTime)` where `atTime` is a bar boundary computed from a single stored `transportStart` timestamp. Never use `setTimeout`/`setInterval` for musical timing.

**Swapping is bar-quantized.** When the user picks a new loop for a slot: compute `nextBar = transportStart + ceil((ctx.currentTime - transportStart) / barSec) * barSec`, `.start(nextBar)` the new node, `.stop(nextBar)` the old one. Same for stopping. Optional `swapMode: 'bar' | 'beat' | 'now'` — build `'bar'` first.

**Loop lengths must divide evenly.** Enforce powers-of-two bars. A 2-bar drum loop and a 4-bar sample loop are fine; they realign every 4 bars.

**Audio engine is pure TypeScript, no React.** Lives in `src/engine/`. The UI talks to it only through a single `useEngine()` hook. This is so it can be unit-tested and reasoned about without UI noise.

## Architecture

```
src/
  engine/
    context.ts      // create/resume AudioContext inside a user gesture; singleton
    transport.ts    // transportStart, masterBPM, barSec, nextBar(), start/stop
    slot.ts         // Slot class: holds current Loop + source node + gain node; load(), swap(loop, at), stop(at)
    loader.ts       // fetch + decodeAudioData, LRU cache of AudioBuffers (cap ~30)
    engine.ts       // composes transport + 2 slots (drums, sample); public API
    export.ts       // OfflineAudioContext render of N bars → WAV blob  (phase 4)
  hooks/
    useEngine.ts    // the only React ↔ engine bridge
  lib/
    supabase.ts
    loops.ts        // CRUD on `loops` table, signed URLs
  components/
    Transport.tsx   // play/stop, BPM readout, bar counter
    PadGrid.tsx     // two rows: drums, samples. Click = swap at next bar
    Pad.tsx         // name, bpm, ratio badge (e.g. "92 → 104  +13%"), active state
    Uploader.tsx    // drop file, set bpm + bars + kind, upload
```

## Supabase

Table `loops`: `id uuid pk`, `name text`, `storage_path text`, `bpm numeric`, `bars int`, `kind text`, `gain numeric default 0.8`, `created_at`. Storage bucket `loops`, private, signed URLs. Single user, so keep RLS simple (authenticated user owns everything).

## UI

Editorial, restrained. Fraunces for display, Space Grotesk for UI, JetBrains Mono for numbers (BPM, ratios, bar counter). Warm off-white background, one accent for the active pad. No gradients, no cards-within-cards. Pads are big and thumb-friendly — this gets used on an iPhone.

Ratio badge colors: |ratio − 1| ≤ 0.10 neutral, ≤ 0.20 amber, > 0.20 red. Red doesn't disable anything, it's just a warning.

Keyboard on desktop: `space` = play/stop, `1–9` = sample pads, `q w e r` = drum pads.

## Build order — do these in sequence, one PR each

1. **Engine + hardcoded proof.** Two local WAVs in `/public/dev/` (I'll add them). Drums at 100 BPM, sample at 88. Play button starts both locked; sample is varispeed'd to 100. Add a second sample pad and verify bar-quantized swap is seamless. Write a test for `nextBar()` and for `playbackRate` math. Nothing else.
2. **Pad grid + transport UI.** Real layout, keyboard shortcuts, bar counter, ratio badges. Still local files.
3. **Supabase library.** Uploader, `loops` table, load library on boot, signed URLs, buffer cache.
4. **Half-time / double-time per pad** (`playbackRate ×0.5 / ×2`, bars adjusts accordingly) and **offline export** of the current combo (N bars → WAV download).

Don't skip ahead. Don't add features not listed here without asking.

## Gotchas

- `AudioContext` must be created or `resume()`d inside a click/touch handler. Safari will silently produce no sound otherwise.
- `decodeAudioData` on iOS is slow for large files — decode on demand, not the whole library on boot.
- Never restart a looping node per cycle; native `loop = true` is sample-accurate, restarts are not.
- WAV/AIFF export from Pro Tools should be trimmed exactly to the bar. If a loop is not exactly `bars × 240/bpm` seconds long, trust `bpm` + `bars` and set `loopEnd = bars * 240 / bpm` rather than the file's duration.
- Use `GainNode` per slot → master `GainNode` → destination. Ramp gain changes with `setTargetAtTime`, never set `.value` directly while playing.

## Start

Scaffold the Vite + React + TS + Tailwind project, install `@supabase/supabase-js`, set up the folder structure above, and implement phase 1. Show me the engine code before writing any UI beyond a single play button and two pads.
