// tools/og-image.mjs: writes og.png, the 1200x630 link preview (SPEC W6, Y-8), with no browser and no packages: a pixel
// font, the watch's trace of a fall and its catch, and the share card's sparkline, encoded as a PNG with node:zlib.
// Run once when the picture should change: node tools/og-image.mjs  (writes og.png in the repo root).
import {writeFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

export const W = 1200, H = 630;
const BG = [13, 17, 23], LINE = [48, 54, 61], DIM = [139, 148, 158], BRIGHT = [230, 237, 243], CYAN = [57, 197, 207], AMBER = [210, 153, 34], GREEN = [63, 185, 80];

// A 5x7 pixel font: the letters and marks the picture uses, each row 5 bits, top row first
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17], '/': [1, 1, 2, 4, 8, 16, 16], Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31], '0': [14, 17, 19, 21, 25, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12], '.': [0, 0, 0, 0, 0, 12, 12],
  ':': [0, 12, 12, 0, 12, 12, 0], ',': [0, 0, 0, 0, 12, 4, 8], "'": [4, 4, 8, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0], ' ': [0, 0, 0, 0, 0, 0, 0],
};

/** The picture's pixels: an RGB buffer, W x H. */
export function draw() {
  const px = Buffer.alloc(W * H * 3);
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) { const i = 3 * (y * W + x); px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; } };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
  const text = (s, x, y, k, c) => {
    for (const ch of s) {
      const g = FONT[ch] || FONT[' '];
      g.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row & (16 >> i)) rect(x + i * k, y + j * k, k, k, c); });
      x += 6 * k;
    }
    return x;
  };
  rect(0, 0, W, H, BG);
  text('GRIDWATCH', 72, 64, 14, BRIGHT);
  text('KEEP A CITY\'S LIGHTS ON FOR ONE DAY.', 76, 196, 4, DIM);
  text('A NEW DAILY, ABOUT SIX MINUTES.', 76, 236, 4, DIM);
  // the watch: 50 Hz, a fall to its nadir, the battery and the governors catching it, and the slow climb back
  const x0 = 76, x1 = W - 76, yHz = hz => Math.round(330 + (50 - hz) * 250);
  for (let x = x0; x <= x1; x += 6) set(x, yHz(50), LINE);
  for (const hz of [49.85, 50.15]) for (let x = x0; x <= x1; x += 12) set(x, yHz(hz), LINE);
  text('50.00', x1 - 64, yHz(50) - 22, 2, DIM);
  let prev = null;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0) * 10 - 2;   // (grid seconds around the trip at 0)
    const hz = t < 0 ? 50 : 50 - 0.62 * (1 - Math.exp(-t * 1.6)) * Math.exp(-t * 0.22) - 0.07 * (1 - Math.exp(-t * 0.5));
    const y = yHz(hz);
    if (prev !== null) for (let yy = Math.min(prev, y); yy <= Math.max(prev, y); yy++) rect(x, yy - 2, 1, 5, t < 2.2 ? AMBER : CYAN);
    prev = y;
  }
  // the share card's sparkline under it
  const blocks = [7, 7, 6, 7, 5, 7, 7, 1, 5, 6, 7, 7];
  blocks.forEach((b, i) => { const h = 6 + b * 6; rect(76 + i * 30, 600 - h, 24, h, b < 3 ? AMBER : GREEN); });
  text('DATABERRYAU.GITHUB.IO/GRIDWATCH', 520, 572, 3, DIM);
  return px;
}

// PNG: signature, IHDR, IDAT (filter 0 per row, deflated), IEND; CRC-32 per chunk
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4), crc = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** An RGB buffer as PNG bytes. */
export function png(px, w = W, h = H) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;   // 8-bit RGB
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = fileURLToPath(new URL('../og.png', import.meta.url)), bytes = png(draw());
  writeFileSync(out, bytes);
  console.log('og.png ' + W + 'x' + H + ', ' + bytes.length + ' bytes');
}
