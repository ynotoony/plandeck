import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, pixelAt) {
  const stride = 1 + w * 4;
  const raw = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      const o = y * stride + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function roundRectDist(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - r;
}

function cover(dist) {
  return Math.min(1, Math.max(0, 0.5 - dist));
}

function blend(bg, fg, a) {
  return [
    Math.round(fg[0] * a + bg[0] * (1 - a)),
    Math.round(fg[1] * a + bg[1] * (1 - a)),
    Math.round(fg[2] * a + bg[2] * (1 - a)),
  ];
}

const S = 1024;
const BG = [15, 17, 21];
const CARDS = [
  { color: [217, 164, 65], ox: 70, oy: 70 },
  { color: [63, 185, 111], ox: 0, oy: 0 },
  { color: [110, 168, 254], ox: -70, oy: -70 },
];

const appIcon = encodePng(S, S, (x, y) => {
  let rgb = BG;
  for (const c of CARDS) {
    const d = roundRectDist(x, y, S / 2 + c.ox, S / 2 + c.oy, 280, 200, 60);
    rgb = blend(rgb, c.color, cover(d));
  }
  return [...rgb, 255];
});

const T = 64;
const cards = [
  { ox: 7, oy: 7 },
  { ox: 0, oy: 0 },
];
const trayIcon = encodePng(T, T, (x, y) => {
  let a = 0;
  for (const c of cards) {
    const d = roundRectDist(x, y, T / 2 + c.ox - 3, T / 2 + c.oy - 3, 17, 13, 5);
    a = Math.max(a, cover(d));
  }
  return [0, 0, 0, Math.round(a * 255)];
});

mkdirSync(join(ROOT, "scripts", "out"), { recursive: true });
mkdirSync(join(ROOT, "src-tauri", "icons"), { recursive: true });
writeFileSync(join(ROOT, "scripts", "out", "app-icon.png"), appIcon);
writeFileSync(join(ROOT, "src-tauri", "icons", "tray.png"), trayIcon);
console.log("wrote scripts/out/app-icon.png + src-tauri/icons/tray.png");
