#!/usr/bin/env node
// Downloads Whisper tiny.en (q8 ONNX) from Hugging Face into public/models/<repo>/, the layout Transformers.js expects.
// Large files are checked against the sha256 Hugging Face publishes; a manifest of what was fetched is written next to them.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'models');
const HF = process.env.HF_ENDPOINT || 'https://huggingface.co';
const LIMIT_BYTES = 100 * 1024 * 1024;

// Revision pinned so every build and every eval run uses the same weights.
const MODELS = [
  {
    repo: 'Xenova/whisper-tiny.en',
    revision: '79fb389fc764e7c395bd330e9531d9d32ada7049',
    files: [
      'config.json',
      'generation_config.json',
      'preprocessor_config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'vocab.json',
      'merges.txt',
      'normalizer.json',
      'added_tokens.json',
      'special_tokens_map.json',
      'onnx/encoder_model_quantized.onnx',
      'onnx/decoder_model_merged_quantized.onnx',
    ],
  },
];

const force = process.argv.includes('--force');

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function withRetries(label, fn) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`  ${label}: attempt ${attempt} failed (${error.message})`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw lastError;
}

async function listRepo({ repo, revision }) {
  const res = await fetch(`${HF}/api/models/${repo}/tree/${revision}?recursive=1`);
  if (!res.ok) throw new Error(`listing ${repo} failed: HTTP ${res.status}`);
  const entries = await res.json();
  return new Map(entries.filter((e) => e.type === 'file').map((e) => [e.path, e]));
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
  renameSync(part, dest);
}

const fetched = [];

for (const model of MODELS) {
  console.log(`\n${model.repo} @ ${model.revision.slice(0, 8)}`);
  const listing = await withRetries('listing', () => listRepo(model));
  for (const file of model.files) {
    const entry = listing.get(file);
    if (!entry) throw new Error(`${model.repo} has no file ${file} at this revision`);
    const dest = path.join(OUT, model.repo, file);
    const expectedSha = entry.lfs?.oid;

    let ok = existsSync(dest) && statSync(dest).size === entry.size && !force;
    if (ok && expectedSha) ok = (await sha256(dest)) === expectedSha;

    if (ok) {
      console.log(`  ok       ${String(entry.size).padStart(10)}  ${file}`);
    } else {
      await withRetries(file, () => download(`${HF}/${model.repo}/resolve/${model.revision}/${file}`, dest));
      if (statSync(dest).size !== entry.size) {
        rmSync(dest);
        throw new Error(`${file}: size mismatch after download`);
      }
      if (expectedSha && (await sha256(dest)) !== expectedSha) {
        rmSync(dest);
        throw new Error(`${file}: sha256 mismatch after download`);
      }
      console.log(`  fetched  ${String(entry.size).padStart(10)}  ${file}${expectedSha ? '  (sha256 verified)' : ''}`);
    }
    fetched.push({ path: `${model.repo}/${file}`, bytes: entry.size, sha256: expectedSha ?? null });
  }
}

const totalBytes = fetched.reduce((sum, f) => sum + f.bytes, 0);
writeFileSync(
  path.join(OUT, 'manifest.json'),
  JSON.stringify({ models: MODELS.map((m) => ({ repo: m.repo, revision: m.revision })), totalBytes, files: fetched }, null, 2),
);

const mb = (totalBytes / 1e6).toFixed(1);
const mib = (totalBytes / 1024 / 1024).toFixed(1);
console.log(`\nTotal model files: ${totalBytes} bytes = ${mb} MB (${mib} MiB) in ${path.relative(ROOT, OUT)}/`);
if (totalBytes > LIMIT_BYTES) {
  console.error(`Over the ${LIMIT_BYTES / 1024 / 1024} MiB budget in CLAUDE.md.`);
  process.exit(1);
}
