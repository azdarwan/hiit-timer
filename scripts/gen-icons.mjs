// Génère les icônes PNG (192, 180, 512) sans dépendance externe.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function iconPixel(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const d = Math.hypot(x - cx, y - cy);
  const r = size * 0.4;
  const handWidth = size * 0.045;
  // fond sombre
  if (d > r) return [18, 18, 18, 255];
  // anneau orange
  if (d > r * 0.78) return [255, 109, 31, 255];
  // aiguille blanche vers le haut + point central
  if (Math.abs(x - cx) < handWidth && y < cy) return [245, 245, 245, 255];
  if (d < size * 0.06) return [245, 245, 245, 255];
  // intérieur
  return [30, 30, 30, 255];
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 180, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, encodePng(size, iconPixel));
  console.log(`public/icons/icon-${size}.png généré`);
}
