#!/usr/bin/env node
// Downloads the clinician channel of the first five PriMock57 consultations (CC BY 4.0) into eval/primock57/, an
// outside benchmark of real human speech. Audio is checked against the sha256 in its Git LFS pointer.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'eval', 'primock57');
const REPO = 'babylonhealth/primock57';
const COMMIT = 'cd2ac707ad03cb4d2531f4ec6b90c659bf4357c5';
const CONSULTATIONS = ['day1_consultation01', 'day1_consultation02', 'day1_consultation03', 'day1_consultation04', 'day1_consultation05'];

mkdirSync(OUT, { recursive: true });
const raw = (file) => `https://raw.githubusercontent.com/${REPO}/${COMMIT}/${file}`;
const lfs = (file) => `https://media.githubusercontent.com/media/${REPO}/${COMMIT}/${file}`;

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const files = [];
let total = 0;
for (const id of CONSULTATIONS) {
  const grid = path.join(OUT, `${id}_doctor.TextGrid`);
  if (!existsSync(grid)) writeFileSync(grid, await get(raw(`transcripts/${id}_doctor.TextGrid`)));

  const pointer = (await get(raw(`audio/${id}_doctor.wav`))).toString('utf8');
  const oid = /oid sha256:([0-9a-f]{64})/.exec(pointer)?.[1];
  const size = Number(/size (\d+)/.exec(pointer)?.[1]);
  if (!oid || !size) throw new Error(`${id}: not a Git LFS pointer`);

  const wav = path.join(OUT, `${id}_doctor.wav`);
  const ok = existsSync(wav) && statSync(wav).size === size && createHash('sha256').update(readFileSync(wav)).digest('hex') === oid;
  if (!ok) {
    const bytes = await get(lfs(`audio/${id}_doctor.wav`));
    if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== oid) throw new Error(`${id}: audio does not match its LFS pointer`);
    writeFileSync(wav, bytes);
    console.log(`fetched ${id}_doctor.wav (${size} bytes, sha256 verified)`);
  } else {
    console.log(`ok      ${id}_doctor.wav`);
  }
  total += size;
  files.push({ id, bytes: size, sha256: oid });
}

writeFileSync(
  path.join(OUT, 'manifest.json'),
  JSON.stringify(
    {
      dataset: 'PriMock57',
      source: `https://github.com/${REPO}`,
      commit: COMMIT,
      licence: 'CC BY 4.0 (LICENSE.md in the repository)',
      citation: 'Papadopoulos Korfiatis A, Moramarco F, Sarac R, Savkov A. PriMock57: A Dataset Of Primary Care Mock Consultations. ACL 2022 (arXiv:2204.00333).',
      note: 'Clinician channel only. 57 mock primary-care consultations, 7 Babylon clinicians and 57 employees acting as patients, UK English. Audio 16-bit 16 kHz.',
      totalBytes: total,
      files,
    },
    null,
    2,
  ),
);
console.log(`\n${files.length} consultations, ${(total / 1e6).toFixed(1)} MB in eval/primock57/ (git-ignored). CC BY 4.0, Babylon Health: attribution is in docs/EVALUATION.md.`);
