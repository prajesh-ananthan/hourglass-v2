#!/usr/bin/env node
'use strict';

/**
 * Generate the Hourglass app icon as a PNG using only Node's built-in modules
 * (zlib + Buffer) — no native or npm dependencies.
 *
 * Draws a rounded-square gradient badge with a stylised hourglass and falling
 * sand. Writes build/icon.png (electron-builder derives .ico/.icns from it) and
 * assets/icon.png (used as the window icon). Run automatically by the npm
 * `prestart` / `predist` hooks; safe to run directly:  node scripts/gen-icon.cjs
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 1024;

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [0, 1, 2].map((i) => Math.round(lerp(c1[i], c2[i], t)));

function roundedRectAlpha(x, y, w, h, radius, cx, cy) {
  const dx = Math.max(x + radius - cx, 0, cx - (x + w - radius));
  const dy = Math.max(y + radius - cy, 0, cy - (y + h - radius));
  if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) {
    if (dx === 0 || dy === 0) return 1;
    const d = Math.hypot(dx, dy);
    return Math.max(0, Math.min(1, radius - d + 0.5));
  }
  return 0;
}

function main() {
  const top = [0x3b, 0x82, 0xf6];
  const bottom = [0x6d, 0x28, 0xd9];
  const sand = [0xfb, 0xbf, 0x24];
  const glass = [0xf8, 0xfa, 0xfc];
  const glassDim = [0xcb, 0xd5, 0xe1];

  const W = SIZE;
  const H = SIZE;
  const px = Buffer.alloc(W * H * 4, 0);

  const setPx = (ix, iy, rgb, a) => {
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    const o = (iy * W + ix) * 4;
    const ba = px[o + 3] / 255;
    const na = a + ba * (1 - a);
    if (na <= 0) return;
    for (let k = 0; k < 3; k++) {
      const existing = px[o + k];
      px[o + k] = Math.round((rgb[k] * a + existing * ba * (1 - a)) / na);
    }
    px[o + 3] = Math.round(na * 255);
  };

  const margin = SIZE * 0.06;
  const radius = SIZE * 0.22;
  const rw = SIZE - 2 * margin;

  const cxm = SIZE / 2;
  const topY = SIZE * 0.24;
  const botY = SIZE * 0.76;
  const neckY = SIZE * 0.5;
  const halfTop = SIZE * 0.2;
  const neckHalf = SIZE * 0.022;
  const frame = SIZE * 0.02;

  const hourglassHalf = (cy) => {
    if (cy < topY || cy > botY) return -1;
    if (cy <= neckY) return lerp(halfTop, neckHalf, (cy - topY) / (neckY - topY));
    return lerp(neckHalf, halfTop, (cy - neckY) / (botY - neckY));
  };

  for (let iy = 0; iy < H; iy++) {
    const cy = iy + 0.5;
    for (let ix = 0; ix < W; ix++) {
      const cx = ix + 0.5;
      const cover = roundedRectAlpha(margin, margin, rw, rw, radius, cx, cy);
      if (cover <= 0) continue;

      let t = (cy - margin) / rw;
      t = Math.max(0, Math.min(1, t));
      let bg = mix(top, bottom, t);
      const hl = Math.max(
        0,
        1 - Math.hypot(cx - SIZE * 0.32, cy - SIZE * 0.3) / (SIZE * 0.9)
      );
      bg = mix(bg, [255, 255, 255], hl * 0.12);
      setPx(ix, iy, bg, cover);

      const half = hourglassHalf(cy);
      if (half > 0 && Math.abs(cx - cxm) <= half) {
        const d = Math.abs(cx - cxm);
        const edge = half - d;
        if (edge < frame) {
          setPx(ix, iy, glass, cover);
        } else {
          let isSand = false;
          if (cy <= neckY) {
            if (cy > lerp(topY, neckY, 0.45)) isSand = true;
          } else if (cy > lerp(neckY, botY, 0.55)) {
            isSand = true;
          }
          if (isSand) setPx(ix, iy, sand, cover);
          else setPx(ix, iy, mix(glass, glassDim, 0.5), cover * 0.35);
        }
      }

      if (cy > neckY && cy < lerp(neckY, botY, 0.55) && Math.abs(cx - cxm) < SIZE * 0.01) {
        setPx(ix, iy, sand, cover);
      }
    }
  }

  // horizontal caps
  const capH = SIZE * 0.03;
  for (const barcy of [topY, botY]) {
    for (let iy = Math.floor(barcy - capH); iy < barcy + capH; iy++) {
      for (let ix = Math.floor(cxm - halfTop - frame); ix < cxm + halfTop + frame; ix++) {
        const cx = ix + 0.5;
        const cy = iy + 0.5;
        const cover = roundedRectAlpha(margin, margin, rw, rw, radius, cx, cy);
        if (cover <= 0) continue;
        setPx(ix, iy, glass, cover);
      }
    }
  }

  // Assemble PNG (filter byte 0 per scanline)
  const raw = Buffer.alloc(H * (W * 4 + 1));
  for (let iy = 0; iy < H; iy++) {
    raw[iy * (W * 4 + 1)] = 0;
    px.copy(raw, iy * (W * 4 + 1) + 1, iy * W * 4, (iy + 1) * W * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  const root = path.resolve(__dirname, '..');
  for (const rel of ['build/icon.png', 'assets/icon.png']) {
    const outPath = path.join(root, rel);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, png);
    console.log('wrote', rel, png.length, 'bytes');
  }
}

// CRC32 (PNG uses the standard IEEE polynomial)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

main();
