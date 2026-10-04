// Builds docs/EVALUATION.md from eval/results/latest.json. Every number in the document is computed here from the
// results; nothing is typed by hand, and a test fails if the committed document differs from this output.
import type { SelectionRule } from './primock';

export interface EvalCheck {
  area: string;
  ok: boolean;
  detail: string;
  silent?: boolean;
}

export interface EvalFlag {
  code: string;
  target: string;
  message: string;
}

export interface EvalRow {
  id: string;
  script: string;
  score: { checks: EvalCheck[]; flagChecks: EvalCheck[]; extraFlags: EvalFlag[] };
  failed: EvalCheck[];
  missedFlags: EvalCheck[];
  transcript?: string;
  warnings?: string[];
  audioSeconds?: number;
  transcribeMs?: number;
  wer?: number;
  wordErrors?: number;
  refWords?: number;
  noisy?: boolean;
}

export interface EvalSummary {
  clips: number;
  fieldChecksPassed: number;
  fieldChecksTotal: number;
  fieldAccuracy: number;
  wrongValues: number;
  silentWrongValues: number;
  expectedFlagsRaised: number;
  expectedFlagsTotal: number;
  extraFlags: number;
  wer?: number;
  meanClipWer?: number;
  audioSeconds?: number;
  transcribeSeconds?: number;
  realTimeFactor?: number;
}

export interface EvalSource {
  label: string;
  rows: EvalRow[];
  summary: EvalSummary | null;
}

export interface PrimockRow {
  id: string;
  consultation: string;
  start: number;
  end: number;
  reference: string;
  heard: string;
  audioSeconds: number;
  transcribeMs: number;
  wordErrors: number;
  refWords: number;
  wer: number;
}

export interface PrimockSummary {
  utterances: number;
  words: number;
  wordErrors: number;
  wer: number;
  meanUtteranceWer: number;
  audioSeconds: number;
  transcribeSeconds: number;
  realTimeFactor: number;
}

export interface PrimockResult {
  dataset: string;
  source: string;
  commit: string;
  licence: string;
  citation: string;
  note: string;
  consultations: number;
  rule: SelectionRule;
  rows: PrimockRow[];
  summary: PrimockSummary;
}

export interface EvalResults {
  generatedAt: string;
  /** the local date the run happened, YYYY-MM-DD */
  generatedOn?: string;
  visitDate: string;
  machine: { cpu: string; cores: number; memoryGB: number; platform: string; node: string };
  model: { repo: string; dtype: string; revision?: string; totalBytes?: number; chunkSeconds?: number; strideSeconds?: number; runtime: string };
  ttsVoice: { voice: string; platform: string; noiseSnrDb: number; note: string } | null;
  scripts?: { id: string; text: string }[];
  reference: EvalSource;
  tts: EvalSource | null;
  recordings: EvalSource | null;
  /** outside benchmark, speech recognition only; absent or null when the dataset was not fetched */
  primock57?: PrimockResult | null;
}

const OS_NAMES: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const secs = (x: number) => `${x.toFixed(1)} s`;
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function family(area: string): string {
  if (area.startsWith('medications')) return 'medicines';
  if (area.startsWith('complaint')) return 'complaint words and duration';
  if (area.startsWith('vitals')) return `vitals (${area.split('.')[1] ?? ''})`;
  if (area === 'patient.name') return 'patient name';
  if (area === 'patient.ageYears') return 'patient age';
  if (area === 'advice.tags') return 'advice';
  return area;
}

function glance(r: EvalResults): string {
  const lines = [
    '| Audio source | Clips | Field checks right | Wrong values | …of which not flagged | Expected flags raised | Other questions to the worker | Word error rate | Real-time factor |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  const line = (name: string, s: EvalSummary | null, pending: string) => {
    if (!s) return lines.push(`| ${name} | ${pending} | | | | | | | |`);
    lines.push(
      `| ${name} | ${s.clips} | ${s.fieldChecksPassed}/${s.fieldChecksTotal} = ${pct(s.fieldAccuracy)} | ${s.wrongValues} | ${s.silentWrongValues} | ${s.expectedFlagsRaised}/${s.expectedFlagsTotal} | ${s.extraFlags} | ${s.wer === undefined ? 'n/a (no audio)' : pct(s.wer)} | ${s.realTimeFactor === undefined ? 'n/a' : s.realTimeFactor.toFixed(2)} |`,
    );
  };
  line('Reference text: the script itself, so only the extractor is tested', r.reference.summary, 'pending');
  line('TTS-synthetic speech (operating-system voice): a pipeline check only', r.tts?.summary ?? null, 'none');
  line("My own voice (`recordings/`)", r.recordings?.summary ?? null, '**pending recordings**');
  const p = r.primock57?.summary;
  if (p) lines.push(`| Outside data: real clinicians in mock consultations (PriMock57, UK English), speech recognition only | ${p.utterances} utterances | n/a | n/a | n/a | n/a | n/a | ${pct(p.wer)} | ${p.realTimeFactor.toFixed(2)} |`);
  return lines.join('\n');
}

function perClip(source: EvalSource): string {
  const lines = [
    '| Clip | Word error rate | Field checks right | Wrong | Not flagged | Expected flags raised | Other questions | Audio | Transcribing |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const row of source.rows) {
    const total = row.score.checks.length;
    const right = row.score.checks.filter((c) => c.ok).length;
    const wrong = row.failed.length;
    const silent = row.failed.filter((c) => c.silent).length;
    const raised = row.score.flagChecks.filter((c) => c.ok).length;
    lines.push(
      `| ${row.id}${row.warnings?.length ? ' ⚠ repetition guard' : ''} | ${row.wer === undefined ? 'n/a' : pct(row.wer)} | ${right}/${total} | ${wrong} | ${silent} | ${raised}/${row.score.flagChecks.length} | ${row.score.extraFlags.length} | ${row.audioSeconds === undefined ? 'n/a' : secs(row.audioSeconds)} | ${row.transcribeMs === undefined ? 'n/a' : secs(row.transcribeMs / 1000)} |`,
    );
  }
  return lines.join('\n');
}

function breaks(source: EvalSource): string {
  const groups = new Map<string, { wrong: number; silent: number; clips: Set<string> }>();
  for (const row of source.rows) {
    for (const c of row.failed) {
      const g = groups.get(family(c.area)) ?? { wrong: 0, silent: 0, clips: new Set<string>() };
      g.wrong++;
      if (c.silent) g.silent++;
      g.clips.add(row.id);
      groups.set(family(c.area), g);
    }
  }
  if (!groups.size) return 'Nothing was wrong.';
  const lines = ['| What went wrong | Wrong values | …not flagged | Clips |', '|---|---|---|---|'];
  for (const [name, g] of [...groups.entries()].sort((a, b) => b[1].wrong - a[1].wrong)) {
    lines.push(`| ${name} | ${g.wrong} | ${g.silent} | ${[...g.clips].join(', ')} |`);
  }
  return lines.join('\n');
}

function flagTable(source: EvalSource): string {
  const lines = ['| Clip | Expected flag | Raised? |', '|---|---|---|'];
  for (const row of source.rows) for (const c of row.score.flagChecks) lines.push(`| ${row.id} | ${cell(c.area.replace('flag ', ''))} | ${c.ok ? 'yes' : 'no'} |`);
  return lines.length > 2 ? lines.join('\n') : 'No flags were expected in these clips.';
}

function questions(source: EvalSource): string {
  const counts = new Map<string, number>();
  for (const row of source.rows) for (const f of row.score.extraFlags) counts.set(f.code, (counts.get(f.code) ?? 0) + 1);
  if (!counts.size) return 'No questions beyond the expected ones.';
  const lines = ['| Question type | How many |', '|---|---|'];
  for (const [code, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) lines.push(`| ${code} | ${n} |`);
  return lines.join('\n');
}

function transcripts(source: EvalSource, scripts: Map<string, string>): string {
  return source.rows
    .map((row) => {
      const script = scripts.get(row.script) ?? '';
      return [`**${row.id}**${row.wer === undefined ? '' : ` (word error rate ${pct(row.wer)})`}`, `- Script: ${cell(script)}`, `- Heard: ${cell(row.transcript ?? '')}`].join('\n');
    })
    .join('\n\n');
}

function primockSection(p: PrimockResult): string[] {
  const s = p.summary;
  const lines = [
    '| Utterance | Audio | Word errors / words | Word error rate |',
    '|---|---|---|---|',
    ...p.rows.map((row) => `| ${row.id} | ${secs(row.audioSeconds)} | ${row.wordErrors}/${row.refWords} | ${pct(row.wer)} |`),
  ];
  const heard = p.rows.map((row) => [`**${row.id}** (word error rate ${pct(row.wer)})`, `- Said: ${cell(row.reference)}`, `- Heard: ${cell(row.heard)}`].join('\n'));
  return [
    '',
    '## Outside data: real clinicians (PriMock57)',
    '',
    `${s.utterances} utterances of real clinicians speaking in mock primary-care consultations, ${s.words} words and ${secs(s.audioSeconds)} of audio, transcribed in ${secs(s.transcribeSeconds)} by the same speech model. **${s.wordErrors} of ${s.words} words were wrong: a word error rate of ${pct(s.wer)}** (mean per utterance ${pct(s.meanUtteranceWer)}). This measures **speech recognition only**. The extractor is not run on these, because they are conversations, not notes in our format.`,
    '',
    lines.join('\n'),
    '',
    '### What this does and does not show',
    '',
    `- **It is real human speech, which the other audio is not.** The model made about ${Math.round(s.wer * 100)} word errors for every 100 words spoken. That is the strongest reason the worker must check every value: the model will mishear some words, and a name or a dose is one word.`,
    '- **It is not our setting.** The speakers are UK clinicians, the patients are employees acting a case, and the talk is a two-way conversation, not an Indian health worker dictating a note. The result says nothing about Indian English, a noisy clinic or a phone microphone.',
    `- **${s.utterances} utterances is a small sample.** The figure is a sanity check with wide uncertainty, not a benchmark score.`,
    '- **The reference is the transcriber\'s verbatim text,** including repeated words ("let let let") that the model tends to leave out. Each of those counts as an error, so the figure is stricter than a comparison with a tidied transcript. Fillers ("um", "uh", "er", "mm", "hmm", "ah", "eh") are dropped from both sides. No spelling conversion is applied: a British spelling in the reference counts as an error if the model writes the American form, and the other way round.',
    `- **The utterances were chosen by a fixed rule before any model output was seen:** in each of the first ${p.consultations} consultations, the earliest utterances (at most ${p.rule.perConsultation} per consultation, at most ${p.rule.total} in all) that last ${p.rule.minSeconds} to ${p.rule.maxSeconds} seconds and carry no transcriber tag (\`<UNSURE>\`, \`<UNIN/>\`, \`<INAUDIBLE_SPEECH/>\`). Where fewer qualify, fewer are used. They are cut exactly at the annotated times, with no padding. Because they are the earliest ones, they lean towards the opening questions of each consultation.`,
    '',
    '### What the speech model heard',
    '',
    'Quoted from the dataset to show the recognition errors. These are the dataset\'s clinicians speaking, not statements by this app.',
    '',
    heard.join('\n\n'),
    '',
    '### Data and licence',
    '',
    `- **${p.dataset}:** ${p.citation} ${p.source}, commit \`${p.commit.slice(0, 8)}\`.`,
    `- **Licence:** ${p.licence}. Credit: Babylon Health and the authors above. Licence text: https://creativecommons.org/licenses/by/4.0/.`,
    `- **What we changed:** we used the clinician channel of the first ${p.consultations} consultations, cut utterances at the annotated times, and normalised the text for scoring with the rules in the Method section. The audio is not in this repository: \`npm run fetch-primock\` downloads it from the pinned commit and checks every file against its checksum.`,
    `- ${p.note}`,
  ];
}

export function renderEvaluation(r: EvalResults, scriptTexts: Record<string, string>): string {
  const scripts = new Map(Object.entries(scriptTexts));
  const tts = r.tts && r.tts.rows.length ? r.tts : null;
  const mine = r.recordings && r.recordings.rows.length ? r.recordings : null;
  const audioClips = (tts?.rows.length ?? 0) + (mine?.rows.length ?? 0);
  const out: string[] = [];

  out.push(
    '# Evaluation',
    '',
    `_Generated by \`npm run eval\` on ${r.generatedOn ?? r.generatedAt.slice(0, 10)} from \`eval/results/latest.json\`. Do not edit by hand: a test fails if this file differs from what the results produce._`,
    '',
    '## What this shows, in plain words',
    '',
    'The app has two parts that can be wrong: **speech recognition** (the audio becomes text) and **extraction** (the text becomes the fixed record). They are measured separately, so a mistake can be placed in the right part.',
    '',
    `- **Reference text** feeds the extractor the exact words of each script. It shows whether the extraction rules are right when the transcript is perfect.`,
    `- **Audio** is run through the same speech model the app uses, and the transcript goes through the same extractor. It shows what survives real recognition mistakes.`,
    '- A **wrong value** is a field that does not match the script. It is **not flagged** when the app showed it as fine, with no question for the worker: those are the dangerous ones, and the review screen is the only thing that catches them.',
    '- **Other questions** are amber or red items the app raised beyond the ones the scripts expect. On audio they are mostly the app saying "not sure, please check", which is what it should do.',
    '',
    '## Results at a glance',
    '',
    glance(r),
    '',
    `> **Read this carefully.** The only audio of our own scripts so far is **TTS-synthetic**: a computer voice reading the scripts` +
      (r.ttsVoice ? ` (voice "${r.ttsVoice.voice}" on ${OS_NAMES[r.ttsVoice.platform] ?? r.ttsVoice.platform}; the \`_noisy\` clips add synthetic noise at ${r.ttsVoice.noiseSnrDb} dB signal-to-noise)` : '') +
      '. It is good for checking that the pipeline works. It says little about how real clinic speech will do: a real voice, a real room and a real accent will differ, in either direction. No accuracy claim about real speech is made until the "my own voice" row is filled.' +
      (r.primock57 ? ' The outside PriMock57 row is real clinicians\' speech, but UK English in acted consultations, and it measures speech recognition only.' : ''),
  );

  if (!mine) {
    out.push('', '**My own voice: pending recordings.** Record the scripts in `docs/RECORDINGS.md` into `recordings/` and run `npm run eval` again; this section then fills in by itself.');
  }

  out.push('', '## Reference text (the extractor alone)', '', perClip(r.reference));
  if (r.reference.summary && r.reference.summary.wrongValues === 0) {
    out.push('', `Every field and every expected flag was right on all ${r.reference.summary.clips} scripts, with no extra questions.`);
  } else if (r.reference.summary) {
    out.push('', '### What went wrong', '', breaks(r.reference));
  }

  for (const [title, source] of [['TTS-synthetic audio', tts], ['My own voice', mine]] as const) {
    if (!source) continue;
    out.push('', `## ${title}`, '', source.summary ? `${source.summary.clips} clips, ${secs(source.summary.audioSeconds ?? 0)} of audio, transcribed in ${secs(source.summary.transcribeSeconds ?? 0)}. Pooled word error rate ${pct(source.summary.wer ?? 0)} (mean per clip ${pct(source.summary.meanClipWer ?? 0)}).` : '', '', perClip(source), '', '### Where speech recognition breaks extraction', '', breaks(source), '', '### Expected flags', '', flagTable(source), '', '### Questions the app raised beyond the expected ones', '', questions(source));
  }

  if (r.primock57) out.push(...primockSection(r.primock57));

  const heard = [tts, mine].filter((s): s is EvalSource => s !== null);
  if (heard.length) {
    out.push('', '## What the speech model heard', '');
    for (const s of heard) out.push(`### ${s === tts ? 'TTS-synthetic audio' : 'My own voice'}`, '', transcripts(s, scripts), '');
  }

  out.push(
    '## Method',
    '',
    `- **Speech model:** \`${r.model.repo}\`${r.model.revision ? ` at revision \`${r.model.revision.slice(0, 8)}\`` : ''}, ${r.model.dtype} weights${r.model.totalBytes ? ` (${(r.model.totalBytes / 1e6).toFixed(1)} MB with its tokenizer files)` : ''}, run with Transformers.js. Word-level timestamps on.${r.model.chunkSeconds ? ` Long audio is cut into ${r.model.chunkSeconds} s windows with ${r.model.strideSeconds} s overlap.` : ''}`,
    `- **Where it ran:** ${r.machine.cpu}, ${r.machine.cores} cores, ${r.machine.memoryGB} GB memory, ${r.machine.platform}, Node ${r.machine.node}; ${r.model.runtime}. A laptop, not a phone.`,
    '- **Extractor:** the same code the app runs, loaded from `src/extract/`. The gold answers and the matching rules are in `eval/scripts.json` and implemented once in `src/extract/score.ts`.',
    '- **Word error rate** = (substituted + inserted + deleted words) / words in the script, on text made comparable first:',
    '  1. lower case; 2. punctuation dropped (a decimal point inside a number stays); 3. hyphens split; 4. spoken numbers become digits ("thirty-eight" = "38", "one hundred and one" = "101"); 5. spelled letters are joined ("O R S" = "ors"); 6. "milligram(s)" = "mg". The same rules apply to the script and to the transcript. The rules are in `src/extract/wer.ts`.',
    '- **A field check** is one comparison with the script: name, age, each listed vital, each listed property of each medicine, advice tags, referral, follow-up, complaint words and duration. A medicine the script does not list counts as a wrong value. Names match within two letters (Levenshtein), as the scripts specify.',
    '- **Expected flags** are the questions each script is built to provoke (a missing follow-up, a dose with no unit, a spoken correction). Other questions are counted and listed, not penalised.',
    '- **Real-time factor** = time to transcribe / length of audio; below 1 is faster than real time. The first clip of a run is preceded by an untimed warm-up.',
    ...(r.primock57 ? ['- **Outside data (PriMock57):** the same model and settings, the same word-error rule, fillers dropped from both sides, utterances chosen by the rule written in that section. Speech recognition only.'] : []),
    '',
    '## Limitations',
    '',
    `- **${audioClips} audio clips** from ${mine ? 'one real speaker and ' : ''}${r.ttsVoice ? '1 synthetic voice' : 'a synthetic voice'}, reading **scripted, made-up** notes. No real patients, no real clinic noise, no variety of accents or speaking styles.`,
    `- **TTS audio is cleaner and more regular than real speech** in some ways and different in others. These numbers are a pipeline check, not an accuracy claim.`,
    '- **A laptop, not a phone.** Speed on a basic Android phone will be slower; the app shows progress while it works.',
    '- **Node, not the browser.** The app runs the same model in the browser with WebAssembly, after the audio has passed through the browser\'s recorder and its compression. The two can transcribe the same audio slightly differently.',
    '- **Only the fixed record is scored.** Whether a note is clinically sensible is not measured and is not the app\'s job.',
    '- **The ten scripts were used to build and tune the extractor.** Reference-text scores on them are therefore optimistic; the other phrasings in `src/extract/phrasing.test.ts` were written to check it does not only work on these ten.',
    '',
    '## How to reproduce',
    '',
    '```',
    'npm ci',
    'npm run fetch-models   # the speech model, once',
    'npm run tts-audio      # TTS-synthetic clips into eval/tts/ (macOS: say; Windows: System.Speech; Linux: espeak-ng)',
    '# put your own recordings in recordings/ (S01 … S10, S01_noisy, S02_noisy, S06_noisy) to fill the last section',
    'npm run fetch-primock  # optional: the outside real-clinician check (88 MB, CC BY 4.0, checksum-verified)',
    'npm run eval           # writes eval/results/latest.json and this file',
    '```',
    '',
  );
  return out.join('\n');
}

export const README_START = '<!-- eval:start -->';
export const README_END = '<!-- eval:end -->';

/** The short results block in README.md, filled by `npm run eval` from the same JSON as docs/EVALUATION.md. */
export function renderReadmeSummary(r: EvalResults): string {
  const ref = r.reference.summary;
  const tts = r.tts?.summary ?? null;
  const mine = r.recordings?.summary ?? null;
  const lines: string[] = [README_START, ''];
  lines.push('| Test | Clips | Fields right | Wrong values (not flagged) | Expected flags raised | Word error rate |', '|---|---|---|---|---|---|');
  if (ref) lines.push(`| Reference text (extractor alone) | ${ref.clips} | ${ref.fieldChecksPassed}/${ref.fieldChecksTotal} = ${pct(ref.fieldAccuracy)} | ${ref.wrongValues} (${ref.silentWrongValues}) | ${ref.expectedFlagsRaised}/${ref.expectedFlagsTotal} | n/a |`);
  if (tts) lines.push(`| TTS-synthetic speech (a pipeline check) | ${tts.clips} | ${tts.fieldChecksPassed}/${tts.fieldChecksTotal} = ${pct(tts.fieldAccuracy)} | ${tts.wrongValues} (${tts.silentWrongValues}) | ${tts.expectedFlagsRaised}/${tts.expectedFlagsTotal} | ${pct(tts.wer ?? 0)} |`);
  lines.push(
    mine
      ? `| My own voice | ${mine.clips} | ${mine.fieldChecksPassed}/${mine.fieldChecksTotal} = ${pct(mine.fieldAccuracy)} | ${mine.wrongValues} (${mine.silentWrongValues}) | ${mine.expectedFlagsRaised}/${mine.expectedFlagsTotal} | ${pct(mine.wer ?? 0)} |`
      : '| My own voice | **pending recordings** | | | | |',
  );
  const p = r.primock57?.summary;
  if (p) lines.push(`| Outside data: real clinicians, UK English (PriMock57; speech recognition only) | ${p.utterances} utterances | n/a | n/a | n/a | ${pct(p.wer)} |`);
  if (tts?.realTimeFactor !== undefined) {
    lines.push('', `Speech took ${tts.realTimeFactor.toFixed(2)} times the length of the audio on ${r.machine.cpu} (Node, a laptop, not a phone). Generated by \`npm run eval\` on ${r.generatedOn ?? r.generatedAt.slice(0, 10)}; the full tables, method and limits are in [docs/EVALUATION.md](docs/EVALUATION.md).`);
  }
  if (p) lines.push('', `${mine ? 'The last row is real speech from outside our setting' : 'The last row is the only real human speech tested so far'}: ${p.utterances} utterances from UK clinicians in acted consultations, ${p.wordErrors} word errors in ${p.words} words. It tests speech recognition only, and says nothing about Indian English, a noisy clinic or a phone microphone.`);
  lines.push('', README_END);
  return lines.join('\n');
}

/** Replaces the block between the markers in a README, or returns it unchanged if the markers are missing. */
export function withReadmeSummary(readme: string, r: EvalResults): string {
  const start = readme.indexOf(README_START);
  const end = readme.indexOf(README_END);
  if (start === -1 || end === -1 || end < start) return readme;
  return readme.slice(0, start) + renderReadmeSummary(r) + readme.slice(end + README_END.length);
}
