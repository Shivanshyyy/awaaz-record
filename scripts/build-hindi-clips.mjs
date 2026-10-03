#!/usr/bin/env node
// Copies the patient clips out of docs/HINDI_CLIPS.md into src/patient/clips.generated.json, character for character,
// so no Hindi is ever typed into the code. Also lists which mp3 files exist in public/audio/hi/.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const markdown = readFileSync(path.join(ROOT, 'docs', 'HINDI_CLIPS.md'), 'utf8');

const clips = [];
let group = '';
for (const line of markdown.split('\n')) {
  const heading = /^###\s+(.+)$/.exec(line);
  if (heading) group = heading[1].trim();
  // | `id` | Hindi | Romanized | English meaning |
  const row = /^\|\s*`([a-z0-9_]+)`\s*\|(.+)\|(.+)\|(.+)\|\s*$/.exec(line);
  if (row) clips.push({ id: row[1], group, hindi: row[2].trim(), romanized: row[3].trim(), english: row[4].trim() });
}

const reviewLog = markdown.split('## Review log')[1]?.split('## Lines waiting')[0] ?? '';
const reviewed = reviewLog
  .split('\n')
  .filter((l) => l.startsWith('|') && !/^\|\s*(Date|---)/.test(l))
  .some((l) => l.split('|').slice(1, 3).every((cell) => cell.trim() !== ''));

writeFileSync(path.join(ROOT, 'src', 'patient', 'clips.generated.json'), `${JSON.stringify({ reviewedByHindiSpeaker: reviewed, clips }, null, 2)}\n`);

const audioDir = path.join(ROOT, 'public', 'audio', 'hi');
mkdirSync(audioDir, { recursive: true });
const files = existsSync(audioDir) ? readdirSync(audioDir).filter((f) => f.endsWith('.mp3')) : [];
const available = Object.fromEntries(files.map((f) => [path.basename(f, '.mp3'), { bytes: statSync(path.join(audioDir, f)).size }]));
const missing = clips.map((c) => c.id).filter((id) => !(id in available));
writeFileSync(path.join(audioDir, 'manifest.json'), `${JSON.stringify({ clips: available }, null, 2)}\n`);

console.log(`${clips.length} clips from docs/HINDI_CLIPS.md (reviewed by a Hindi speaker: ${reviewed ? 'yes' : 'no'})`);
console.log(`mp3 files present: ${files.length}${missing.length ? `; no file yet for: ${missing.join(', ')}` : ''}`);
