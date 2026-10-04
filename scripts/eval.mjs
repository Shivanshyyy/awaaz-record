#!/usr/bin/env node
// Evaluation: speech recognition (word error rate) and extraction (field accuracy, flags) on the 10 scripts.
//   reference  the script text itself, so only the extractor is tested
//   tts        eval/tts/*.wav, operating-system voice: a pipeline check only (TTS-synthetic)
//   recordings recordings/*  the builder's own voice, when present
//   primock57  eval/primock57/*  real clinicians in mock consultations (CC BY 4.0), speech recognition only, when fetched
//   accent     eval/accent/*     40 speakers reading one paragraph (Speech Accent Archive, CC BY-NC-SA 4.0), when fetched
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
const MODEL = { repo: 'Xenova/whisper-tiny.en', dtype: 'q8', chunkSeconds: 30, strideSeconds: 5 };

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
const { parseTextGrid, selectUtterances, dropFillers, SELECTION } = await load('/src/eval/primock.ts');
const { ELICITATION, GROUP_LABELS } = await load('/src/eval/accent.ts');
const { renderEvaluation, withReadmeSummary } = await load('/src/eval/report.ts');

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
    wrongValues: acc.wrong,
    silentWrongValues: acc.silentWrong,
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
  const out = await transcriber(samples, { return_timestamps: 'word', chunk_length_s: MODEL.chunkSeconds, stride_length_s: MODEL.strideSeconds });
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
        warnings: transcript.warnings ?? [],
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

// ---- 3. outside benchmark: PriMock57 (speech recognition only) -----------------------------------------------
// Real clinicians, mock consultations, UK English. Utterances are picked by a fixed rule (src/eval/primock.ts)
// before any model output is seen, and fillers ("um") are dropped from both sides before counting errors.
async function primock57() {
  const dir = path.join(ROOT, 'eval', 'primock57');
  const manifestFile = path.join(dir, 'manifest.json');
  if (skipAudio || only.length > 0 || !existsSync(manifestFile)) return null;
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const grids = manifest.files.map((f) => ({ consultation: f.id, intervals: parseTextGrid(readFileSync(path.join(dir, `${f.id}_doctor.TextGrid`), 'utf8')) }));
  const picked = selectUtterances(grids);
  const rows = [];
  let decoded = { id: '', samples: new Float32Array(0) };
  for (const u of picked) {
    if (decoded.id !== u.consultation) decoded = { id: u.consultation, samples: decode(path.join(dir, `${u.consultation}_doctor.wav`)) };
    const samples = decoded.samples.slice(Math.round(u.start * 16000), Math.round(u.end * 16000));
    const audioSeconds = samples.length / 16000;
    const { out, ms } = await transcribe(samples);
    const heard = buildTranscript(out.chunks ?? [], audioSeconds).text;
    const reference = dropFillers(normalizeForWer(u.text));
    const errors = wordErrors(reference, dropFillers(normalizeForWer(heard)));
    rows.push({
      id: `${u.consultation.replace('day1_', '')} at ${u.start.toFixed(1)} s`,
      consultation: u.consultation,
      start: u.start,
      end: u.end,
      reference: u.text,
      heard,
      audioSeconds,
      transcribeMs: ms,
      wordErrors: errors.errors,
      refWords: errors.words,
      wer: errors.words ? errors.errors / errors.words : 0,
    });
    process.stdout.write(`  primock57 ${rows.at(-1).id.padEnd(28)} WER ${(rows.at(-1).wer * 100).toFixed(0).padStart(3)}%  ${audioSeconds.toFixed(1)} s in ${(ms / 1000).toFixed(2)} s\n`);
  }
  const words = rows.reduce((n, r) => n + r.refWords, 0);
  const wrong = rows.reduce((n, r) => n + r.wordErrors, 0);
  const seconds = rows.reduce((n, r) => n + r.audioSeconds, 0);
  const ms = rows.reduce((n, r) => n + r.transcribeMs, 0);
  return {
    dataset: manifest.dataset,
    source: manifest.source,
    commit: manifest.commit,
    licence: manifest.licence,
    citation: manifest.citation,
    note: manifest.note,
    consultations: manifest.files.length,
    rule: SELECTION,
    rows,
    summary: {
      utterances: rows.length,
      words,
      wordErrors: wrong,
      wer: words ? wrong / words : 0,
      meanUtteranceWer: rows.length ? rows.reduce((s, r) => s + r.wer, 0) / rows.length : 0,
      audioSeconds: seconds,
      transcribeSeconds: ms / 1000,
      realTimeFactor: seconds ? ms / 1000 / seconds : 0,
    },
  };
}
const primockResult = await primock57();

// ---- 4. accent check: one paragraph read by Indian-born speakers (Indian mother tongue) and by native English speakers born in the USA ------
// Same text for everyone, so the reference is fixed. The speakers are chosen by a rule in src/eval/accent.ts.
const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

async function accentCheck() {
  const dir = path.join(ROOT, 'eval', 'accent');
  const manifestFile = path.join(dir, 'manifest.json');
  if (skipAudio || only.length > 0 || !existsSync(manifestFile)) return null;
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const reference = dropFillers(normalizeForWer(ELICITATION));
  const rows = [];
  for (const f of manifest.files) {
    const samples = decode(path.join(dir, f.file));
    const audioSeconds = samples.length / 16000;
    const { out, ms } = await transcribe(samples);
    const heard = buildTranscript(out.chunks ?? [], audioSeconds).text;
    const errors = wordErrors(reference, dropFillers(normalizeForWer(heard)));
    rows.push({
      id: f.file.replace(/\.mp3$/, ''),
      group: f.group,
      speakerId: f.speakerId,
      nativeLanguage: f.nativeLanguage,
      residence: f.residence ?? '',
      gender: f.gender,
      age: f.age,
      heard,
      audioSeconds,
      transcribeMs: ms,
      wordErrors: errors.errors,
      refWords: errors.words,
      wer: errors.errors / errors.words,
    });
    process.stdout.write(`  accent ${f.group.padEnd(5)} ${f.file.padEnd(16)} WER ${(rows.at(-1).wer * 100).toFixed(0).padStart(3)}%\n`);
  }
  const pooled = (list) => {
    const words = list.reduce((n, r) => n + r.refWords, 0);
    const wrong = list.reduce((n, r) => n + r.wordErrors, 0);
    return { speakers: list.length, words, wordErrors: wrong, wer: words ? wrong / words : 0 };
  };
  const groups = ['india', 'usa'].map((group) => {
    const list = rows.filter((r) => r.group === group);
    const ages = list.map((r) => Number(r.age)).filter(Number.isFinite);
    const languages = {};
    const residences = {};
    for (const r of list) {
      languages[r.nativeLanguage] = (languages[r.nativeLanguage] ?? 0) + 1;
      residences[r.residence || 'not given'] = (residences[r.residence || 'not given'] ?? 0) + 1;
    }
    return {
      group,
      label: GROUP_LABELS[group],
      ...pooled(list),
      medianWer: median(list.map((r) => r.wer)),
      minWer: Math.min(...list.map((r) => r.wer)),
      maxWer: Math.max(...list.map((r) => r.wer)),
      women: pooled(list.filter((r) => r.gender === 'female')),
      men: pooled(list.filter((r) => r.gender === 'male')),
      minAge: ages.length ? Math.min(...ages) : null,
      maxAge: ages.length ? Math.max(...ages) : null,
      languages,
      residences,
    };
  });
  return {
    dataset: manifest.dataset,
    source: manifest.source,
    filesFrom: manifest.files_from,
    licence: manifest.licence,
    credit: manifest.credit,
    retrievedOn: manifest.retrievedOn,
    rule: manifest.rule,
    skipped: manifest.skipped ?? [],
    reference: ELICITATION,
    groups,
    rows,
  };
}
const accentResult = await accentCheck();

function modelManifest() {
  const file = path.join(ROOT, 'public', 'models', 'manifest.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

const cpus = os.cpus();
const FRIENDLY_OS = { darwin: 'macOS (Darwin)', win32: 'Windows', linux: 'Linux' };
const results = {
  generatedAt: new Date().toISOString(),
  generatedOn: new Date().toLocaleDateString('en-CA'),
  visitDate: scriptsFile.visitDate,
  machine: { cpu: cpus[0]?.model ?? 'unknown', cores: cpus.length, memoryGB: Math.round(os.totalmem() / 2 ** 30), platform: `${FRIENDLY_OS[os.platform()] ?? os.platform()} ${os.release()}`, node: process.version },
  model: { ...MODEL, revision: modelManifest().models?.[0]?.revision, totalBytes: modelManifest().totalBytes, runtime: 'onnxruntime-node (Transformers.js), one run per clip' },
  ttsVoice: existsSync(path.join(ROOT, 'eval', 'tts', 'manifest.json')) ? JSON.parse(readFileSync(path.join(ROOT, 'eval', 'tts', 'manifest.json'), 'utf8')) : null,
  reference: { label: 'Reference text (the script itself): tests the extractor only', rows: referenceRows, summary: summarize('reference', referenceRows) },
  tts: audioResults.tts,
  recordings: audioResults.recordings,
  primock57: primockResult,
  accent: accentResult,
};
mkdirSync(path.join(ROOT, 'eval', 'results'), { recursive: true });
writeFileSync(path.join(ROOT, 'eval', 'results', 'latest.json'), `${JSON.stringify(results, null, 2)}\n`);
writeFileSync(
  path.join(ROOT, 'src', 'eval', 'summary.generated.json'),
  `${JSON.stringify({ generatedOn: results.generatedOn, cpu: results.machine.cpu, reference: results.reference.summary, tts: results.tts?.summary ?? null, recordings: results.recordings?.summary ?? null, primock57: results.primock57?.summary ?? null, accent: results.accent ? results.accent.groups.map(({ group, label, speakers, words, wordErrors, wer, medianWer, women, men }) => ({ group, label, speakers, words, wordErrors, wer, medianWer, womenWer: women.wer, menWer: men.wer })) : null }, null, 2)}\n`,
);
const scriptTexts = Object.fromEntries(scriptsFile.scripts.map((sc) => [sc.id, sc.text]));
if (only.length === 0 && !skipAudio) {
  writeFileSync(path.join(ROOT, 'docs', 'EVALUATION.md'), renderEvaluation(results, scriptTexts));
  console.log('wrote docs/EVALUATION.md');
  const readmePath = path.join(ROOT, 'README.md');
  if (existsSync(readmePath)) {
    const before = readFileSync(readmePath, 'utf8');
    const after = withReadmeSummary(before, results);
    if (after !== before) writeFileSync(readmePath, after);
    console.log('updated the results block in README.md');
  }
}

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
    `${key.padEnd(10)} ${String(s.clips).padStart(2)} clips  fields ${s.fieldChecksPassed}/${s.fieldChecksTotal} = ${pct(s.fieldAccuracy)}  flags raised ${s.expectedFlagsRaised}/${s.expectedFlagsTotal}  extra flags ${s.extraFlags}  wrong ${s.wrongValues} (${s.silentWrongValues} not flagged)${speech}`,
  );
}
if (results.primock57) {
  const p = results.primock57.summary;
  console.log(`primock57  ${String(p.utterances).padStart(2)} utterances  ${p.words} words  WER ${pct(p.wer)} (mean per utterance ${pct(p.meanUtteranceWer)})  RTF ${p.realTimeFactor.toFixed(2)}`);
} else {
  console.log('primock57  not run (npm run fetch-primock to add it)');
}
if (results.accent) {
  for (const g of results.accent.groups) console.log(`accent     ${g.group.padEnd(5)} ${String(g.speakers).padStart(2)} speakers  ${g.words} words  WER ${pct(g.wer)} (median speaker ${pct(g.medianWer)}, range ${pct(g.minWer)} to ${pct(g.maxWer)}; women ${pct(g.women.wer)}, men ${pct(g.men.wer)})`);
} else {
  console.log('accent     not run (npm run fetch-accent to add it)');
}
for (const key of ['reference', 'tts', 'recordings']) {
  for (const row of results[key]?.rows ?? []) {
    for (const c of row.failed) console.log(`  [${key}] ${row.id}: ${c.area} — ${c.detail}`);
    for (const c of row.missedFlags) console.log(`  [${key}] ${row.id}: ${c.area} — ${c.detail}`);
  }
}
await vite.close();
