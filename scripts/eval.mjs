#!/usr/bin/env node
// Evaluation: speech recognition (word error rate) and extraction (field accuracy, flags) on the 10 scripts.
//   reference  the script text itself, so only the extractor is tested
//   tts        eval/tts/*.wav, operating-system voice: a pipeline check only (TTS-synthetic)
//   recordings recordings/*  the builder's own voice, when present
// Every number printed here is computed from this run and written to eval/results/latest.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, pipeline } from '@huggingface/transformers';
import ffmpegPath from 'ffmpeg-static';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO_EXTENSIONS = new Set(['.m4a', '.mp3', '.wav', '.ogg', '.webm', '.aac']);
const MODEL = { repo: 'Xenova/whisper-tiny.en', dtype: 'q8' };

const only = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean);
const skipAudio = process.argv.includes('--reference-only');

const scriptsFile = JSON.parse(readFileSync(path.join(ROOT, 'eval', 'scripts.json'), 'utf8'));
const scripts = scriptsFile.scripts.filter((s) => only.length === 0 || only.includes(s.id));

const vite = await createServer({
  configFile: false,
  root: ROOT,
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true, watch: null, hmr: false },
});
const load = (file) => vite.ssrLoadModule(file);
const { extractRecord } = await load('/src/extract/index.ts');
const { textToTranscript } = await load('/src/extract/transcript-from-text.ts');
const { buildTranscript } = await load('/src/asr/transcript.ts');
const { scoreScript, accuracy } = await load('/src/extract/score.ts');
const { wer, wordErrors, normalizeForWer } = await load('/src/extract/wer.ts');

function summarize(label, rows) {
  const scores = rows.map((r) => r.score);
  const acc = accuracy(scores);
  const flagChecks = scores.flatMap((s) => s.flagChecks);
  const raised = flagChecks.filter((c) => c.ok).length;
  const withAudio = rows.filter((r) => r.audioSeconds !== undefined);
  const summary = {
    label,
    clips: rows.length,
    fieldChecksPassed: acc.passed,
    fieldChecksTotal: acc.total,
    fieldAccuracy: acc.ratio,
    expectedFlagsRaised: raised,
    expectedFlagsTotal: flagChecks.length,
    extraFlags: scores.reduce((n, s) => n + s.extraFlags.length, 0),
  };
  if (withAudio.length) {
    const pooled = withAudio.reduce((sum, r) => ({ errors: sum.errors + r.wordErrors, words: sum.words + r.refWords }), { errors: 0, words: 0 });
    const seconds = withAudio.reduce((s, r) => s + r.audioSeconds, 0);
    const ms = withAudio.reduce((s, r) => s + r.transcribeMs, 0);
    Object.assign(summary, {
      wer: pooled.words ? pooled.errors / pooled.words : 0,
      meanClipWer: withAudio.reduce((s, r) => s + r.wer, 0) / withAudio.length,
      audioSeconds: seconds,
      transcribeSeconds: ms / 1000,
      realTimeFactor: seconds ? ms / 1000 / seconds : 0,
    });
  }
  return summary;
}

function plainRow(script, record, extra = {}) {
  const score = scoreScript(script, record);
  return {
    id: extra.clip ?? script.id,
    script: script.id,
    score,
    failed: score.checks.filter((c) => !c.ok),
    missedFlags: score.flagChecks.filter((c) => !c.ok),
    extraFlags: score.extraFlags.map((f) => `${f.code}@${f.target}`),
    ...extra,
  };
}

// ---- 1. reference text -------------------------------------------------------------------------------------
const referenceRows = scripts.map((s) => plainRow(s, extractRecord(textToTranscript(s.text), { visitDate: scriptsFile.visitDate })));

// ---- 2. audio -----------------------------------------------------------------------------------------------
function audioFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .map((f) => ({ file: path.join(dir, f), clip: path.basename(f, path.extname(f)) }))
    .filter((a) => scripts.some((s) => a.clip === s.id || a.clip.startsWith(`${s.id}_`)))
    .sort((a, b) => a.clip.localeCompare(b.clip));
}

function decode(file) {
  const raw = execFileSync(ffmpegPath, ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

const sources = [
  { key: 'tts', label: 'TTS-synthetic speech (operating-system voice), pipeline check only', files: skipAudio ? [] : audioFiles(path.join(ROOT, 'eval', 'tts')) },
  { key: 'recordings', label: "The builder's own voice", files: skipAudio ? [] : audioFiles(path.join(ROOT, 'recordings')) },
];

let transcriber = null;
async function transcribe(samples) {
  if (!transcriber) {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = `${path.join(ROOT, 'public', 'models')}/`;
    transcriber = await pipeline('automatic-speech-recognition', MODEL.repo, { dtype: MODEL.dtype });
    await transcriber(new Float32Array(16000), { return_timestamps: 'word' }); // warm-up, not timed
  }
  const started = performance.now();
  const out = await transcriber(samples, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
  return { out, ms: performance.now() - started };
}

const audioResults = {};
for (const source of sources) {
  const rows = [];
  for (const { file, clip } of source.files) {
    const script = scripts.find((s) => clip === s.id || clip.startsWith(`${s.id}_`));
    const samples = decode(file);
    const audioSeconds = samples.length / 16000;
    const { out, ms } = await transcribe(samples);
    const transcript = buildTranscript(out.chunks ?? [], audioSeconds);
    const errors = wordErrors(normalizeForWer(script.text), normalizeForWer(transcript.text));
    const record = extractRecord(transcript, { visitDate: scriptsFile.visitDate });
    rows.push(
      plainRow(script, record, {
        clip,
        noisy: clip.includes('_noisy'),
        transcript: transcript.text,
        audioSeconds,
        transcribeMs: ms,
        wer: wer(script.text, transcript.text),
        wordErrors: errors.errors,
        refWords: errors.words,
      }),
    );
    process.stdout.write(`  ${source.key} ${clip.padEnd(11)} WER ${(wer(script.text, transcript.text) * 100).toFixed(0).padStart(3)}%  ${audioSeconds.toFixed(1)} s in ${(ms / 1000).toFixed(2)} s\n`);
  }
  audioResults[source.key] = { label: source.label, rows, summary: rows.length ? summarize(source.label, rows) : null };
}

const cpus = os.cpus();
const results = {
  generatedAt: new Date().toISOString(),
  visitDate: scriptsFile.visitDate,
  machine: { cpu: cpus[0]?.model ?? 'unknown', cores: cpus.length, memoryGB: Math.round(os.totalmem() / 2 ** 30), platform: `${os.platform()} ${os.release()}`, node: process.version },
  model: { ...MODEL, runtime: 'onnxruntime-node (Transformers.js), single run per clip, Node on a laptop, not a phone' },
  ttsVoice: existsSync(path.join(ROOT, 'eval', 'tts', 'manifest.json')) ? JSON.parse(readFileSync(path.join(ROOT, 'eval', 'tts', 'manifest.json'), 'utf8')) : null,
  reference: { label: 'Reference text (the script itself): tests the extractor only', rows: referenceRows, summary: summarize('reference', referenceRows) },
  tts: audioResults.tts,
  recordings: audioResults.recordings,
};
mkdirSync(path.join(ROOT, 'eval', 'results'), { recursive: true });
writeFileSync(path.join(ROOT, 'eval', 'results', 'latest.json'), `${JSON.stringify(results, null, 2)}\n`);

const pct = (x) => `${(x * 100).toFixed(1)}%`;
console.log(`\nmachine: ${results.machine.cpu}, ${results.machine.cores} cores, Node ${process.version}`);
for (const key of ['reference', 'tts', 'recordings']) {
  const s = results[key]?.summary;
  if (!s) {
    console.log(`${key.padEnd(10)} no clips${key === 'recordings' ? ' (pending recordings)' : ''}`);
    continue;
  }
  const speech = s.wer === undefined ? '' : `  WER ${pct(s.wer)}  RTF ${s.realTimeFactor.toFixed(2)}`;
  console.log(
    `${key.padEnd(10)} ${String(s.clips).padStart(2)} clips  fields ${s.fieldChecksPassed}/${s.fieldChecksTotal} = ${pct(s.fieldAccuracy)}  flags raised ${s.expectedFlagsRaised}/${s.expectedFlagsTotal}  extra flags ${s.extraFlags}${speech}`,
  );
}
for (const key of ['reference', 'tts', 'recordings']) {
  for (const row of results[key]?.rows ?? []) {
    for (const c of row.failed) console.log(`  [${key}] ${row.id}: ${c.area} — ${c.detail}`);
    for (const c of row.missedFlags) console.log(`  [${key}] ${row.id}: ${c.area} — ${c.detail}`);
  }
}
await vite.close();
