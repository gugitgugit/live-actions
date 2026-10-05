// Renders the extension icon (rounded square + progress ring) to PNGs without dependencies.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const SIZES = [16, 32, 48, 128]
const SS = 4 // supersampling for anti-aliasing
const BG = [9, 105, 218] // #0969da
const FG = [255, 255, 255]
const TRACK = [255, 255, 255, 90]

function inRoundedRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r)
  const cy = Math.min(Math.max(y, r), 1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function sample(x, y) {
  // unit coordinates 0..1
  if (!inRoundedRect(x, y, 0.22)) return null
  const dx = x - 0.5
  const dy = y - 0.5
  const d = Math.hypot(dx, dy)
  const ringR = 0.29
  const ringW = 0.085
  if (Math.abs(d - ringR) <= ringW / 2) {
    // progress arc: from 12 o'clock clockwise for 75%
    const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI)
    return angle <= 1.5 * Math.PI ? [...FG, 255] : blend(BG, TRACK)
  }
  if (d <= 0.085) return [...FG, 255]
  return [...BG, 255]
}

function blend(base, [r, g, b, a]) {
  const t = a / 255
  return [base[0] * (1 - t) + r * t, base[1] * (1 - t) + g * t, base[2] * (1 - t) + b * t, 255]
}

function render(size) {
  const px = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size)
          if (!c) continue
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3]
        }
      }
      const i = (y * size + x) * 4
      if (a > 0) {
        px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a
      }
      px[i + 3] = a / (SS * SS)
    }
  }
  return encodePng(size, size, px)
}

function crc32(buf) {
  let c, crc = 0xffffffff
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
for (const size of SIZES) writeFileSync(`public/icons/icon-${size}.png`, render(size))
console.log('icons written:', SIZES.join(', '))
