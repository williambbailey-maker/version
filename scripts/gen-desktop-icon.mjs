// Generates the 1024px macOS app icon (rounded tile, stone ground, orange
// disc) without any image library. `tauri icon` turns it into the .icns set.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'app-icon.png')
mkdirSync(dirname(OUT), { recursive: true })

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

const SIZE = 1024
const TILE = 824 // Apple's icon grid: 824px tile on a 1024px canvas
const RADIUS = 185
const bg = [0xfa, 0xfa, 0xf9], fg = [0xea, 0x58, 0x0c]
const c = SIZE / 2, half = TILE / 2, disc = TILE * 0.3
const cover = (d) => Math.max(0, Math.min(1, 0.5 - d)) // signed distance → coverage

const row = SIZE * 4 + 1
const raw = Buffer.alloc(row * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * row] = 0
  for (let x = 0; x < SIZE; x++) {
    const px = x + 0.5 - c, py = y + 0.5 - c
    // rounded-rect signed distance
    const qx = Math.abs(px) - (half - RADIUS), qy = Math.abs(py) - (half - RADIUS)
    const tile = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RADIUS
    const r = Math.hypot(px, py)
    const aDisc = cover(r - disc)
    const o = y * row + 1 + x * 4
    for (let i = 0; i < 3; i++) {
      raw[o + i] = Math.round(bg[i] + (fg[i] - bg[i]) * aDisc)
    }
    raw[o + 3] = Math.round(255 * cover(tile))
  }
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8; ihdr[9] = 6 // 8-bit RGBA
writeFileSync(OUT, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]))
console.log('wrote', OUT)
