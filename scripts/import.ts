/**
 * Bulk importer: walks a folder of loops (your Splice "sounds" folder), reads
 * bpm + key from filenames (falling back to audio analysis), transcodes each
 * file to AAC for fast previews, uploads to Supabase Storage and registers a
 * row in `loops`. Originals stay on disk unless --originals is passed.
 *
 *   npm run import -- "~/Splice/sounds/packs" [--originals] [--dry-run]
 *                    [--format mp3|aac] [--bitrate 192k] [--kind drums|sample|auto]
 *
 * Needs ffmpeg + ffprobe on PATH and SUPABASE_EMAIL / SUPABASE_PASSWORD in
 * the environment (or a .env.local file at the repo root). --dry-run only
 * needs ffmpeg: it prints what would be imported without signing in.
 *
 * Preview format: mp3 by default. LAME writes gapless metadata that both
 * Chrome and Safari honour, so decoded previews line up sample-for-sample
 * with the originals. aac (m4a) is smaller but its priming handling varies
 * by decoder; either way the app measures the real offset from an uploaded
 * calibration click and compensates.
 */
import { createClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { combineEstimates, estimateBPM, bpmFromFilename, keyFromFilename } from '../src/lib/tempo'
import type { Bars, LoopKind } from '../src/engine/types'

const exec = promisify(execFile)

// ---- config -----------------------------------------------------------------

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://rwnxuaencumaftsvthim.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_uAACIh5IsM83Yl8pRZHjVQ_o8J9YV5V'
const BUCKET = 'loops'
const AUDIO_EXT = new Set(['.wav', '.aif', '.aiff', '.flac', '.mp3', '.m4a'])
const CLICK_AT_SEC = 0.1

function loadDotEnv(): void {
  const p = resolve('.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
  }
}

type Format = 'mp3' | 'aac'
type Args = { root: string; originals: boolean; dryRun: boolean; format: Format; bitrate: string; kind: LoopKind | 'auto' }

const PREVIEW_EXT: Record<Format, string> = { mp3: 'mp3', aac: 'm4a' }
const PREVIEW_MIME: Record<Format, string> = { mp3: 'audio/mpeg', aac: 'audio/mp4' }

function parseArgs(argv: string[]): Args {
  const a: Args = { root: '', originals: false, dryRun: false, format: 'mp3', bitrate: '192k', kind: 'auto' }
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]!
    if (v === '--originals') a.originals = true
    else if (v === '--dry-run') a.dryRun = true
    else if (v === '--format') a.format = (argv[++i] as Format) ?? 'mp3'
    else if (v === '--bitrate') a.bitrate = argv[++i] ?? a.bitrate
    else if (v === '--kind') a.kind = (argv[++i] as Args['kind']) ?? 'auto'
    else if (!a.root) a.root = v
  }
  if (!a.root || !(a.format in PREVIEW_EXT)) {
    console.error(
      'usage: npm run import -- <folder> [--originals] [--dry-run] [--format mp3|aac] [--bitrate 192k] [--kind auto|drums|sample]',
    )
    process.exit(2)
  }
  a.root = resolve(a.root.replace(/^~(?=$|\/)/, homedir()))
  return a
}

// ---- fs ---------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (AUDIO_EXT.has(extname(e.name).toLowerCase())) out.push(p)
  }
  return out.sort()
}

// ---- ffmpeg -----------------------------------------------------------------

async function probeDuration(file: string): Promise<number | null> {
  try {
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
    const d = Number(stdout.trim())
    return Number.isFinite(d) && d > 0 ? d : null
  } catch {
    return null
  }
}

/** Mono 44.1k float samples of the first 30 s, for tempo analysis. */
async function decodeMono(file: string): Promise<Float32Array | null> {
  try {
    const { stdout } = await exec(
      'ffmpeg',
      ['-v', 'error', '-t', '30', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', '44100', '-'],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
    )
    const buf = stdout as unknown as Buffer
    return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4))
  } catch {
    return null
  }
}

async function encode(input: string, output: string, format: Format, bitrate: string): Promise<void> {
  const codec = format === 'mp3' ? ['-c:a', 'libmp3lame'] : ['-c:a', 'aac', '-movflags', '+faststart']
  await exec('ffmpeg', ['-y', '-v', 'error', '-i', input, '-vn', ...codec, '-b:a', bitrate, output])
}

/** 1 s of silence with a short click at CLICK_AT_SEC, as 16-bit mono WAV. */
function clickWav(): Buffer {
  const sr = 44100
  const n = sr
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
  const at = Math.round(CLICK_AT_SEC * sr)
  for (let i = 0; i < 8; i++) buf.writeInt16LE(Math.round(0.9 * 32767 * (i % 2 === 0 ? 1 : -1)), 44 + (at + i) * 2)
  return buf
}

// ---- main -------------------------------------------------------------------

async function main(): Promise<void> {
  loadDotEnv()
  const args = parseArgs(process.argv.slice(2))
  const ext = PREVIEW_EXT[args.format]
  for (const tool of ['ffmpeg', 'ffprobe']) {
    try {
      await exec(tool, ['-version'])
    } catch {
      console.error(`${tool} not found on PATH. On macOS: brew install ffmpeg`)
      process.exit(2)
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  let uid = 'dry-run'
  const existing = new Set<string>()
  if (!args.dryRun) {
    const email = process.env.SUPABASE_EMAIL
    const password = process.env.SUPABASE_PASSWORD
    if (!email || !password) {
      console.error('Set SUPABASE_EMAIL and SUPABASE_PASSWORD (env or .env.local).')
      process.exit(2)
    }
    const auth = await supabase.auth.signInWithPassword({ email, password })
    if (auth.error || !auth.data.user) throw new Error(`Sign-in failed: ${auth.error?.message}`)
    uid = auth.data.user.id

    // Existing rows, keyed by source_path, so reruns only add new files.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('loops').select('source_path').range(from, from + 999)
      if (error) throw new Error(error.message)
      for (const r of data as { source_path: string | null }[]) if (r.source_path) existing.add(r.source_path)
      if (data.length < 1000) break
    }
  }

  const files = walk(args.root)
  console.log(`${files.length} audio files under ${args.root}${args.dryRun ? ' (dry run)' : ''}`)

  const tmp = mkdtempSync(join(tmpdir(), 'loop-lab-'))
  const summary = { added: 0, skipped: 0, noTempo: 0, failed: 0 }
  const noTempo: string[] = []

  // Calibration click, encoded with the same settings as the previews.
  if (!args.dryRun) {
    const wav = join(tmp, 'click.wav')
    const out = join(tmp, `click.${ext}`)
    writeFileSync(wav, clickWav())
    await encode(wav, out, args.format, args.bitrate)
    const up = await supabase.storage.from(BUCKET).upload(`${uid}/calibration/click.${ext}`, readFileSync(out), {
      contentType: PREVIEW_MIME[args.format],
      upsert: true,
    })
    if (up.error) throw new Error(`Calibration upload failed: ${up.error.message}`)
  }

  try {
    for (const file of files) {
      const sourcePath = relative(args.root, file)
      if (existing.has(sourcePath)) {
        summary.skipped++
        continue
      }
      const name = basename(file, extname(file))
      const pack = basename(dirname(file))

      const duration = await probeDuration(file)
      const filenameBPM = bpmFromFilename(name)
      let audioBPM: number | null = null
      if (filenameBPM === null) {
        const mono = await decodeMono(file)
        if (mono) audioBPM = estimateBPM(mono, 44100)
      }
      const est = combineEstimates({ filenameBPM, duration, audioBPM })
      if (est.bpm === null) {
        summary.noTempo++
        noTempo.push(sourcePath)
        continue
      }
      const kind: LoopKind =
        args.kind !== 'auto' ? args.kind : /drum|beat|break|perc|kick|top/i.test(sourcePath) ? 'drums' : 'sample'
      const key = keyFromFilename(name)

      const line = `${sourcePath}  →  ${est.bpm} bpm · ${est.bars} bars · ${kind}${key ? ' · ' + key : ''}  (${est.source})`
      if (args.dryRun) {
        console.log(line)
        summary.added++
        continue
      }

      try {
        const id = createHash('sha1').update(`${uid}:${sourcePath}`).digest('hex').slice(0, 32)
        const loopId = `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-8${id.slice(17, 20)}-${id.slice(20, 32)}`
        const preview = join(tmp, `${loopId}.${ext}`)
        await encode(file, preview, args.format, args.bitrate)
        const previewPath = `${uid}/${loopId}.${ext}`
        const up = await supabase.storage.from(BUCKET).upload(previewPath, readFileSync(preview), {
          contentType: PREVIEW_MIME[args.format],
          upsert: true,
        })
        if (up.error) throw new Error(up.error.message)
        rmSync(preview, { force: true })

        let originalPath: string | null = null
        if (args.originals) {
          originalPath = `${uid}/originals/${loopId}${extname(file).toLowerCase()}`
          const upo = await supabase.storage.from(BUCKET).upload(originalPath, readFileSync(file), { upsert: true })
          if (upo.error) throw new Error(upo.error.message)
        }

        const ins = await supabase.from('loops').upsert(
          {
            id: loopId,
            name,
            storage_path: previewPath,
            original_path: originalPath,
            source_path: sourcePath,
            pack,
            bpm: est.bpm,
            bars: est.bars as Bars,
            kind,
            key,
            duration,
            size_bytes: statSync(file).size,
          },
          { onConflict: 'owner,source_path' },
        )
        if (ins.error) throw new Error(ins.error.message)
        summary.added++
        console.log(line)
      } catch (e) {
        summary.failed++
        console.error(`FAILED ${sourcePath}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  console.log(`\nadded ${summary.added} · skipped (already imported) ${summary.skipped} · failed ${summary.failed}`)
  if (noTempo.length) {
    console.log(`\n${noTempo.length} files had no detectable tempo and were not imported. Add them from the app with a bpm:`)
    for (const p of noTempo) console.log('  ' + p)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
