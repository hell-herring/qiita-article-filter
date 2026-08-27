// icons/ の PNG (16/32/48/128) を依存ライブラリなしで生成するスクリプト。
// 図柄: Qiita グリーン (#4AA802) の角丸タイルに白のスピーカー + ×印。
// 実行: npm run icons
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");

// ---- PNG エンコーダ (truecolor + alpha, 非圧縮に近い最小実装) ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 図形定義 (0..1 の正規化座標) ----
const GREEN = [0x4a, 0xa8, 0x02];
const WHITE = [0xff, 0xff, 0xff];

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// 1 サブピクセルの色 (RGBA, 0..255) を返す
function sample(x, y) {
  // 角丸タイル
  const r = 0.16;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  if (Math.hypot(x - cx, y - cy) > r) return [0, 0, 0, 0];

  // スピーカー本体 (矩形) + コーン (台形)
  const inBody = x >= 0.17 && x <= 0.3 && y >= 0.38 && y <= 0.62;
  let inCone = false;
  if (x >= 0.28 && x <= 0.5) {
    const t = (x - 0.28) / 0.22; // 0..1 で広がる
    const half = 0.12 + t * 0.14;
    inCone = Math.abs(y - 0.5) <= half;
  }

  // ×印 (2 本の線分ストローク)
  const w = 0.055;
  const inX =
    distToSegment(x, y, 0.6, 0.36, 0.86, 0.64) < w ||
    distToSegment(x, y, 0.86, 0.36, 0.6, 0.64) < w;

  return inBody || inCone || inX ? [...WHITE, 255] : [...GREEN, 255];
}

function render(size) {
  const SS = 4; // supersampling
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [sr, sg, sb, sa] = sample(
            (px + (sx + 0.5) / SS) / size,
            (py + (sy + 0.5) / SS) / size,
          );
          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round(a / (SS * SS));
    }
  }
  return encodePng(size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, render(size));
  console.log(`wrote ${file}`);
}
