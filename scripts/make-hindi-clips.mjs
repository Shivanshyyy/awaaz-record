#!/usr/bin/env node
// Makes the Hindi patient clips with ElevenLabs text-to-speech: one mp3 for every clip in docs/HINDI_CLIPS.md that does
// not already have public/audio/hi/<id>.mp3. Existing files are never overwritten. The Hindi is copied from the
// markdown exactly as written; nothing is typed here. The key and voice id come from .env (git-ignored) and are never printed.
//   node scripts/make-hindi-clips.mjs --dry-run    shows what would be made and calls nothing
//   node scripts/make-hindi-clips.mjs              makes the missing clips (uses ElevenLabs credits: one per character)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio', 'hi');
const MODEL_ID = 'eleven_multilingual_v2';
const dryRun = process.argv.includes('--dry-run');

function readEnv(file) {
  const env = {};
  if (!existsSync(file)) return env;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  return env;
}

function envFileIsTracked() {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '.env'], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ---- the clips, from the markdown: | `id` | Hindi | Romanized | English | -----------------------------------------
const markdown = readFileSync(path.join(ROOT, 'docs', 'HINDI_CLIPS.md'), 'utf8');
const clips = [];
for (const line of markdown.split('\n')) {
  const row = /^\|\s*`([a-z0-9_]+)`\s*\|(.+)\|(.+)\|(.+)\|\s*$/.exec(line);
  // A line still waiting for translation has no Devanagari, so it is never sent anywhere.
  if (row && /[ऀ-ॿ]/.test(row[2])) clips.push({ id: row[1], hindi: row[2].trim() });
}
if (new Set(clips.map((c) => c.id)).size !== clips.length) {
  console.error('docs/HINDI_CLIPS.md has the same clip id twice. Nothing was made.');
  process.exit(1);
}
if (clips.length !== 23) console.warn(`Warning: found ${clips.length} clips with Hindi text in docs/HINDI_CLIPS.md, not 23.`);

const fileFor = (id) => path.join(OUT, `${id}.mp3`);
const have = clips.filter((c) => existsSync(fileFor(c.id)));
const todo = clips.filter((c) => !existsSync(fileFor(c.id)));
const characters = todo.reduce((n, c) => n + [...c.hindi].length, 0);
console.log(`${clips.length} clips in docs/HINDI_CLIPS.md; ${have.length} already have an mp3 and are left exactly as they are; ${todo.length} to make (${characters} characters of Hindi).`);
if (todo.length) console.log(`To make: ${todo.map((c) => c.id).join(', ')}`);

// ---- keys ----------------------------------------------------------------------------------------------------------
if (envFileIsTracked()) {
  console.error('.env is tracked by git. Remove it from git (git rm --cached .env) before using real keys. Nothing was made.');
  process.exit(1);
}
const env = readEnv(path.join(ROOT, '.env'));
const apiKey = (env.ELEVENLABS_API_KEY ?? '').trim();
const voiceId = (env.ELEVENLABS_VOICE_ID ?? '').trim();
console.log(`.env: ELEVENLABS_API_KEY ${apiKey ? 'is set' : 'is EMPTY'}; ELEVENLABS_VOICE_ID ${voiceId ? 'is set' : 'is EMPTY'} (values are never printed).`);
if (!apiKey || !voiceId) {
  console.error('Fill in both values in .env first. Nothing was made.');
  process.exit(1);
}
const redact = (text) => [apiKey, voiceId].reduce((t, secret) => t.split(secret).join('[hidden]'), String(text));

if (dryRun || todo.length === 0) {
  console.log(dryRun ? '\nDry run: nothing was sent to ElevenLabs.' : '\nNothing to make.');
  process.exit(0);
}

// ---- make the missing clips ---------------------------------------------------------------------------------------
const isMp3 = (b) => (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function synthesise(clip) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: clip.hindi, model_id: MODEL_ID }),
      });
    } catch (error) {
      if (attempt >= 3) throw new Error(`network error: ${redact(error.message)}`);
      await sleep(2000 * attempt);
      continue;
    }
    if (res.ok) {
      const audio = Buffer.from(await res.arrayBuffer());
      if (audio.length < 2000 || !isMp3(audio)) throw new Error(`the answer was ${audio.length} bytes and does not look like an mp3`);
      return audio;
    }
    const detail = redact((await res.text()).slice(0, 300));
    // Rate limits and server trouble may pass; anything else (a wrong key, a wrong voice, no credits) will not, so stop.
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(3000 * attempt);
      continue;
    }
    throw new Error(`HTTP ${res.status} ${detail}`);
  }
}

mkdirSync(OUT, { recursive: true });
const created = [];
let failed = null;
for (const clip of todo) {
  const target = fileFor(clip.id);
  const partial = `${target}.part`;
  try {
    const audio = await synthesise(clip);
    if (existsSync(target)) {
      console.log(`  kept    ${clip.id}.mp3 (appeared while running; not overwritten)`);
      continue;
    }
    writeFileSync(partial, audio);
    renameSync(partial, target);
    created.push({ id: clip.id, bytes: statSync(target).size });
    console.log(`  created ${clip.id}.mp3  ${statSync(target).size} bytes`);
  } catch (error) {
    rmSync(partial, { force: true });
    failed = { id: clip.id, message: redact(error.message) };
    console.error(`  FAILED  ${clip.id}: ${failed.message}`);
    break;
  }
  await sleep(400);
}

const missing = clips.filter((c) => !existsSync(fileFor(c.id))).map((c) => c.id);
console.log(`\nCreated ${created.length}: ${created.map((c) => c.id).join(', ') || 'none'}`);
console.log(`Left as they were: ${have.length}`);
if (missing.length) {
  console.error(`Still no mp3 for ${missing.length}: ${missing.join(', ')}. Run the script again to make only those.`);
  process.exit(1);
}
console.log(`All ${clips.length} clips have an mp3 in public/audio/hi/. Run npm run hindi-clips (or any build) so the app's manifest lists them.`);
