#!/usr/bin/env node
/**
 * Generate the app icon set.
 *
 * Draws procedurally and encodes PNG directly, so there is no image-library
 * dependency. Shapes are anti-aliased by supersampling.
 *
 * Usage: node scripts/generate-icons.mjs [--preview]
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encode straight RGBA bytes as an 8-bit truecolour-with-alpha PNG. */
function encodePng(size, rgba) {
  const stride = size * 4;
  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Geometry ---------------------------------------------------------------

/** Is (x, y) inside a rounded rectangle? Units are fractions of the canvas. */
function inRoundedRect(x, y, cx, cy, w, h, r) {
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  const hw = w / 2;
  const hh = h / 2;
  if (dx > hw || dy > hh) return false;

  const inset = Math.min(r, hw, hh);
  const px = dx - (hw - inset);
  const py = dy - (hh - inset);
  if (px <= 0 || py <= 0) return true;
  return px * px + py * py <= inset * inset;
}

/** Is (x, y) inside the triangle a-b-c? */
function inTriangle(x, y, a, b, c) {
  const sign = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = sign([x, y], a, b);
  const d2 = sign([x, y], b, c);
  const d3 = sign([x, y], c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// --- The icon ---------------------------------------------------------------

const BLUE_TOP = [56, 158, 255];
const BLUE_BOTTOM = [10, 100, 224];
const WHITE = [255, 255, 255];

/**
 * A speech bubble on a blue tile.
 *
 * `scale` shrinks the artwork toward the centre, leaving the padding a
 * maskable icon needs so nothing important is clipped by a circular mask.
 */
function drawIcon(size, { squircle = true, scale = 1 } = {}) {
  const SS = 4; // supersampling factor per axis
  const rgba = Buffer.alloc(size * size * 4);

  // Bubble geometry in canvas fractions, centred and scaled.
  const bw = 0.62 * scale;
  const bh = 0.46 * scale;
  const br = 0.15 * scale;
  const cx = 0.5;
  const cy = 0.47;

  // Tail hanging from the lower-left of the bubble body.
  const tail = [
    [cx - bw * 0.38, cy + bh * 0.30],
    [cx - bw * 0.02, cy + bh * 0.34],
    [cx - bw * 0.30, cy + bh * 0.88],
  ];

  const dotR = 0.042 * scale;
  const dots = [cx - bw * 0.26, cx, cx + bw * 0.26].map((dx) => [dx, cy - bh * 0.02]);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const fx = (x + (sx + 0.5) / SS) / size;
          const fy = (y + (sy + 0.5) / SS) / size;

          const onTile = squircle
            ? inRoundedRect(fx, fy, 0.5, 0.5, 1, 1, 0.2237)
            : true;
          if (!onTile) continue;

          // Vertical gradient across the tile.
          const t = fy;
          let px = [
            BLUE_TOP[0] + (BLUE_BOTTOM[0] - BLUE_TOP[0]) * t,
            BLUE_TOP[1] + (BLUE_BOTTOM[1] - BLUE_TOP[1]) * t,
            BLUE_TOP[2] + (BLUE_BOTTOM[2] - BLUE_TOP[2]) * t,
          ];

          const inBubble =
            inRoundedRect(fx, fy, cx, cy, bw, bh, br) || inTriangle(fx, fy, ...tail);

          if (inBubble) {
            // Dots are punched back out to the tile colour.
            const onDot = dots.some(
              ([dx, dy]) => (fx - dx) ** 2 + (fy - dy) ** 2 <= dotR * dotR,
            );
            if (!onDot) px = WHITE;
          }

          r += px[0];
          g += px[1];
          b += px[2];
          a += 255;
        }
      }

      const samples = SS * SS;
      const idx = (y * size + x) * 4;
      const alpha = a / samples;
      if (alpha > 0) {
        // Un-premultiply so edge pixels keep their colour.
        rgba[idx] = Math.round(r / (a / 255));
        rgba[idx + 1] = Math.round(g / (a / 255));
        rgba[idx + 2] = Math.round(b / (a / 255));
      }
      rgba[idx + 3] = Math.round(alpha);
    }
  }

  return rgba;
}

/** Rough terminal rendering, so the shape can be checked without an image viewer. */
function preview(size, rgba, cols = 44) {
  const ramp = " .:-=+*#%@";
  const lines = [];
  for (let row = 0; row < cols / 2; row += 1) {
    let line = "";
    for (let col = 0; col < cols; col += 1) {
      const x = Math.floor((col / cols) * size);
      const y = Math.floor((row / (cols / 2)) * size);
      const i = (y * size + x) * 4;
      const alpha = rgba[i + 3] / 255;
      const lum = (rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114) / 255;
      line += alpha < 0.5 ? " " : ramp[Math.min(9, Math.round(lum * 9))];
    }
    lines.push(line);
  }
  return lines.join("\n");
}

// --- Output -----------------------------------------------------------------

const root = new URL("../", import.meta.url);
const out = (p) => fileURLToPath(new URL(p, root));

mkdirSync(out("public/icons"), { recursive: true });

const targets = [
  // Manifest icons.
  { path: "public/icons/icon-192.png", size: 192, opts: {} },
  { path: "public/icons/icon-512.png", size: 512, opts: {} },
  // Maskable needs the artwork inside the safe zone; the tile fills the square.
  { path: "public/icons/maskable-512.png", size: 512, opts: { squircle: false, scale: 0.7 } },
  // Next file conventions: browser tab and iOS home screen.
  { path: "src/app/icon.png", size: 256, opts: {} },
  { path: "src/app/apple-icon.png", size: 180, opts: { squircle: false } },
];

for (const { path, size, opts } of targets) {
  const rgba = drawIcon(size, opts);
  writeFileSync(out(path), encodePng(size, rgba));
  console.log(`wrote ${path} (${size}x${size})`);
}

if (process.argv.includes("--preview")) {
  console.log("\nStandard icon:");
  console.log(preview(512, drawIcon(512, {})));
  console.log("\nMaskable (note the padding):");
  console.log(preview(512, drawIcon(512, { squircle: false, scale: 0.7 })));
}
