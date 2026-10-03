#!/usr/bin/env node
// Renders the PWA icons (PNG) from one inline SVG with the Chromium that Playwright already installs.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

// A white microphone with a sound arc on teal. `pad` leaves room for the maskable safe zone.
function svg(size, { rounded, pad }) {
  const radius = rounded ? size * 0.22 : 0;
  const s = (size * (1 - pad * 2)) / 100;
  const o = size * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#0f766e"/>
  <g transform="translate(${o} ${o}) scale(${s})" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <rect x="38" y="14" width="24" height="42" rx="12" fill="#ffffff"/>
    <path d="M26 50a24 24 0 0 0 48 0"/>
    <path d="M50 74v14M38 88h24"/>
  </g>
</svg>`;
}

const favicon = svg(64, { rounded: true, pad: 0.12 });
writeFileSync(path.join(OUT, 'favicon.svg'), favicon);

const targets = [
  { file: 'pwa-192x192.png', size: 192, rounded: true, pad: 0.12 },
  { file: 'pwa-512x512.png', size: 512, rounded: true, pad: 0.12 },
  { file: 'maskable-512x512.png', size: 512, rounded: false, pad: 0.22 },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, pad: 0.14 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(t.size, t)}</body>`);
  await page.screenshot({ path: path.join(OUT, t.file), omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  console.log('wrote', t.file);
}
await browser.close();
