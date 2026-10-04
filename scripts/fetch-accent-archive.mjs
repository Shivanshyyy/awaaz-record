#!/usr/bin/env node
// Downloads 40 recordings from the Speech Accent Archive (CC BY-NC-SA 4.0, George Mason University) into eval/accent/,
// which is git-ignored: the audio is not redistributed here. Who is picked is decided by slotsOf() in src/eval/accent.ts
// (the first 10 women and 10 men of each of two groups, by speaker id), never by how well the model does.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'eval', 'accent');
const NODE_ID = 'yh23d';
const API = `https://api.osf.io/v2/nodes/${NODE_ID}/files/osfstorage/`;

// The host sometimes answers a download with a 500; a short wait and another try usually works.
async function retrying(fn, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= tries || /HTTP (4\d\d)/.test(String(error))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
}

const json = (url) =>
  retrying(async () => {
    const res = await fetch(url, { headers: { 'User-Agent': 'awaaz-record-eval' } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}${res.status === 429 ? ' (the OSF rate limit: wait a while and run again; files already saved are kept)' : ''}`);
    return res.json();
  });

const bytes = (url) =>
  retrying(async () => {
    const res = await fetch(url, { headers: { 'User-Agent': 'awaaz-record-eval' }, redirect: 'follow' });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  });

// A minimal .xlsx reader: enough to read one sheet of text and numbers.
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compressed);
    files[name] = method === 0 ? data : inflateRawSync(data);
    p += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml) => unescapeXml([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

function readSheet(buf) {
  const files = unzip(buf);
  const shared = [...files['xl/sharedStrings.xml'].toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rows = [];
  for (const row of files['xl/worksheets/sheet1.xml'].toString('utf8').matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const c of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const body = c[3] ?? '';
      const value = /t="s"/.test(c[2]) ? shared[Number(/<v>(\d+)<\/v>/.exec(body)?.[1])] : /t="inlineStr"/.test(c[2]) ? textOf(body) : /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (value !== undefined) cells[c[1]] = unescapeXml(String(value));
    }
    rows.push(cells);
  }
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(Object.entries(r).map(([col, v]) => [header[col], v])));
}

const vite = await createServer({ configFile: false, root: ROOT, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, watch: null, hmr: false } });
const { toSpeaker, slotsOf, ACCENT_RULE } = await vite.ssrLoadModule('/src/eval/accent.ts');

mkdirSync(OUT, { recursive: true });
const root = await json(API);
const folder = (name) => root.data.find((d) => d.attributes.name === name && d.attributes.kind === 'folder');
const sheetEntry = root.data.find((d) => d.attributes.name === 'speaker_information.xlsx');
const mp3Folder = folder('mp3_files');
if (!sheetEntry || !mp3Folder) throw new Error('The OSF repository no longer has the layout this script expects.');

const sheet = await bytes(sheetEntry.links.download);
const speakers = readSheet(sheet).map(toSpeaker).filter(Boolean);
console.log(`${speakers.length} speakers in the sheet; taking ${ACCENT_RULE.perGender} women and ${ACCENT_RULE.perGender} men in each of 2 groups.`);

const listUrl = mp3Folder.relationships.files.links.related.href;
const files = [];
const skipped = [];
let total = 0;

async function recording(speaker) {
  const target = path.join(OUT, speaker.file);
  // A file is only written once it has arrived whole, so one already on disk is reused.
  if (existsSync(target) && readFileSync(target).length >= 10_000) return readFileSync(target);
  const found = await json(`${listUrl}?filter%5Bname%5D=${encodeURIComponent(speaker.file)}&page%5Bsize%5D=10`);
  const entry = found.data.find((d) => d.attributes.name === speaker.file);
  if (!entry) return null;
  const data = await bytes(entry.links.download);
  if (data.length < 10_000) throw new Error(`${speaker.file} came back with only ${data.length} bytes.`);
  writeFileSync(target, data);
  return data;
}

// Walk each slot in speaker-id order. A recording the repository does not have is skipped and the next speaker is taken:
// availability has nothing to do with how well the model does.
for (const slot of slotsOf(speakers)) {
  let taken = 0;
  for (const speaker of slot.candidates) {
    if (taken >= ACCENT_RULE.perGender) break;
    const data = await recording(speaker);
    if (!data) {
      skipped.push({ group: slot.group, speakerId: speaker.speakerId, file: speaker.file, reason: 'not in the OSF repository' });
      console.log(`  skipped ${speaker.file}: not in the OSF repository`);
      continue;
    }
    taken++;
    total += data.length;
    files.push({ group: slot.group, speakerId: speaker.speakerId, file: speaker.file, nativeLanguage: speaker.nativeLanguage, country: speaker.country, residence: speaker.residence, gender: speaker.gender, age: speaker.age, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    process.stdout.write(`  ${slot.group.padEnd(5)} ${speaker.file.padEnd(16)} ${speaker.gender.padEnd(6)} ${data.length} bytes\n`);
  }
}

writeFileSync(
  path.join(OUT, 'manifest.json'),
  `${JSON.stringify(
    {
      dataset: 'Speech Accent Archive',
      source: 'https://accent.gmu.edu',
      files_from: `https://osf.io/${NODE_ID}`,
      licence: 'CC BY-NC-SA 4.0',
      credit: 'Steven H. Weinberger and Matthew C. Kelley, The Speech Accent Archive, George Mason University',
      retrievedOn: new Date().toLocaleDateString('en-CA'),
      sheetSha256: createHash('sha256').update(sheet).digest('hex'),
      rule: ACCENT_RULE,
      totalBytes: total,
      skipped,
      files,
    },
    null,
    2,
  )}\n`,
);
console.log(`\n${files.length} recordings, ${(total / 1e6).toFixed(1)} MB in eval/accent/ (git-ignored). CC BY-NC-SA 4.0: the credit is in docs/EVALUATION.md.`);
await vite.close();
