#!/usr/bin/env node
/**
 * Draws the app icon and writes every size the site and the Android app use.
 *
 *   npm run icons
 *
 * One drawing, here, so the browser tab, the phone's home screen, the
 * notification and the Android launcher can never drift apart. The icon is a
 * single capital A: white strokes on the site's dark background, with the
 * crossbar in the brand green. The name is the logo in the header, and a name
 * does not fit in a 48-pixel square, so the icon is its first letter.
 *
 * The outputs are committed. This is not part of `npm run build`: run it only
 * when the drawing changes, then rebuild the Android app (mobile/README.md),
 * which has its own copies of the launcher icons.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(fileURLToPath(import.meta.url), "../..");
const BG = "#070C0A"; // --surface-0
const WHITE = "#F1F6F3"; // --text-primary
const GREEN = "#5FC791"; // --brand-300

/**
 * The letter on a 512 canvas. The two legs are one path so the top is a
 * clean point; the crossbar is a separate, green stroke.
 * `scale` shrinks the letter around the center (maskable icons are cropped
 * to a circle 80% wide, so theirs is smaller).
 */
function letter({ scale = 1, legs = WHITE, bar = GREEN } = {}) {
  return `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)"
     fill="none" stroke-width="58" stroke-linejoin="miter" stroke-miterlimit="10">
    <path d="M128 400 L256 116 L384 400" stroke="${legs}" stroke-linecap="butt"/>
    <path d="M190 322 H322" stroke="${bar}" stroke-width="44" stroke-linecap="butt"/>
  </g>`;
}

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${body}</svg>`;

/** Rounded square: browser tabs, the install sheet, Android's legacy icon. */
const rounded = svg(
  `<rect width="512" height="512" rx="112" fill="${BG}"/>
  <rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="#1E2A23" stroke-width="12"/>${letter({ scale: 0.92 })}`,
);
/** Full square, letter inside the safe circle: Android adaptive icons. */
const maskable = svg(`<rect width="512" height="512" fill="${BG}"/>${letter({ scale: 0.7 })}`);
/** Full square, no transparency: iPhones round the corners themselves. */
const apple = svg(`<rect width="512" height="512" fill="${BG}"/>${letter({ scale: 0.86 })}`);
/** White on clear: Android tints it for the status bar. */
const badge = svg(letter({ scale: 1.1, legs: "#fff", bar: "#fff" }));

const png = (source, size) =>
  sharp(Buffer.from(source), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** A .ico file holding PNG images (every current browser reads these). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size, at);
    header.writeUInt8(size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const out = (path, data) => {
  const file = join(root, path);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, data);
  console.log(`  ${path}`);
};

console.log("Icons:");
out("public/icons/icon-192.png", await png(rounded, 192));
out("public/icons/icon-512.png", await png(rounded, 512));
out("public/icons/maskable-192.png", await png(maskable, 192));
out("public/icons/maskable-512.png", await png(maskable, 512));
out("public/icons/badge-96.png", await png(badge, 96));
out("src/app/apple-icon.png", await png(apple, 180));
out(
  "src/app/favicon.ico",
  ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(rounded, size) })))),
);
out(
  "src/app/icon.svg",
  rounded
    .replace("<svg ", '<svg role="img" aria-label="Adedayo Aremu Autos" ')
    .replace(">", ">\n  <!-- Written by scripts/build-icons.mjs. Change the drawing there. -->\n  ") + "\n",
);

// A contact sheet for review, only when asked: node scripts/build-icons.mjs --preview <file.png>
const at = process.argv.indexOf("--preview");
if (at > -1 && process.argv[at + 1]) {
  const items = [
    [rounded, 48],
    [rounded, 96],
    [rounded, 512],
    [maskable, 192],
    [apple, 180],
    [badge, 96],
  ];
  const tiles = [];
  let x = 20;
  for (const [source, size] of items) {
    tiles.push({ input: await png(source, size), left: x, top: 20 });
    x += size + 20;
  }
  await sharp({ create: { width: x, height: 552, channels: 4, background: "#7a7a7a" } })
    .composite(tiles)
    .png()
    .toFile(process.argv[at + 1]);
}
