import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderEvaluation, withReadmeSummary, type EvalResults } from './report';

const has = existsSync('eval/results/latest.json') && existsSync('docs/EVALUATION.md');
const scripts = JSON.parse(readFileSync('eval/scripts.json', 'utf8')).scripts as { id: string; text: string }[];
const texts = Object.fromEntries(scripts.map((s) => [s.id, s.text]));

describe.skipIf(!has)('docs/EVALUATION.md', () => {
  const results = JSON.parse(readFileSync('eval/results/latest.json', 'utf8')) as EvalResults;
  const doc = readFileSync('docs/EVALUATION.md', 'utf8');

  it('is exactly what the results produce, so it cannot drift or be edited by hand', () => {
    expect(doc).toBe(renderEvaluation(results, texts));
  });

  it('shows the headline numbers from the results, and marks human recordings pending until they exist', () => {
    const ref = results.reference.summary!;
    expect(doc).toContain(`${ref.fieldChecksPassed}/${ref.fieldChecksTotal}`);
    if (results.tts?.summary) expect(doc).toContain(`${results.tts.summary.fieldChecksPassed}/${results.tts.summary.fieldChecksTotal}`);
    if (!results.recordings || results.recordings.rows.length === 0) expect(doc).toContain('pending recordings');
    expect(doc).toContain('TTS-synthetic');
  });

  it('labels all audio so far as synthetic and makes no claim about real speech', () => {
    expect(doc).toMatch(/pipeline check, not an accuracy claim|a pipeline check only/);
    expect(doc).toContain('No accuracy claim about real speech is made');
  });
});

describe('renderEvaluation', () => {
  const summary = { clips: 1, fieldChecksPassed: 2, fieldChecksTotal: 4, fieldAccuracy: 0.5, wrongValues: 2, silentWrongValues: 1, expectedFlagsRaised: 0, expectedFlagsTotal: 1, extraFlags: 3, wer: 0.25, meanClipWer: 0.25, audioSeconds: 10, transcribeSeconds: 1, realTimeFactor: 0.1 };
  const row = {
    id: 'S01',
    script: 'S01',
    score: { checks: [{ area: 'patient.name', ok: false, detail: '', silent: true }, { area: 'patient.ageYears', ok: false, detail: '', silent: false }, { area: 'a', ok: true, detail: '' }, { area: 'b', ok: true, detail: '' }], flagChecks: [{ area: 'flag MISSING @ followUp', ok: false, detail: '' }], extraFlags: [{ code: 'UNCLEAR', target: 't', message: 'm' }] },
    failed: [{ area: 'patient.name', ok: false, detail: '', silent: true }, { area: 'patient.ageYears', ok: false, detail: '', silent: false }],
    missedFlags: [],
    transcript: 'heard | text',
    wer: 0.25,
    audioSeconds: 10,
    transcribeMs: 1000,
  };
  const results = (recordings: EvalResults['recordings']): EvalResults => ({
    generatedAt: '2026-10-04T00:00:00.000Z',
    visitDate: '2026-10-04',
    machine: { cpu: 'Test CPU', cores: 4, memoryGB: 8, platform: 'test', node: 'v0' },
    model: { repo: 'x/y', dtype: 'q8', runtime: 'r' },
    ttsVoice: null,
    reference: { label: 'r', rows: [], summary: null },
    tts: { label: 't', rows: [row], summary },
    recordings,
  });

  it('computes percentages and counts from the results and escapes table characters', () => {
    const doc = renderEvaluation(results(null), { S01: 'Patient Noor.' });
    expect(doc).toContain('2/4 = 50.0%');
    expect(doc).toContain('| patient name | 1 | 1 | S01 |');
    expect(doc).toContain('heard \\| text');
    expect(doc).toContain('pending recordings');
  });

  it('fills the human section by itself once recordings exist', () => {
    const doc = renderEvaluation(results({ label: 'mine', rows: [{ ...row, id: 'S01' }], summary }), { S01: 'x' });
    expect(doc).not.toContain('**My own voice: pending recordings.**');
    expect(doc).toContain('## My own voice');
  });
});

describe.skipIf(!(existsSync('eval/results/latest.json') && existsSync('README.md')))('README.md results block', () => {
  it('is exactly what the results produce, so the README cannot drift from the evaluation', () => {
    const results = JSON.parse(readFileSync('eval/results/latest.json', 'utf8')) as EvalResults;
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('<!-- eval:start -->');
    expect(withReadmeSummary(readme, results)).toBe(readme);
  });
});

describe.skipIf(!existsSync('eval/results/latest.json'))('src/eval/summary.generated.json', () => {
  it('is the summary of the latest results, so the About screen shows the same numbers as the evaluation', () => {
    const results = JSON.parse(readFileSync('eval/results/latest.json', 'utf8')) as EvalResults;
    const summary = JSON.parse(readFileSync('src/eval/summary.generated.json', 'utf8'));
    expect(summary.reference).toEqual(results.reference.summary);
    expect(summary.tts).toEqual(results.tts?.summary ?? null);
    expect(summary.recordings).toEqual(results.recordings?.summary ?? null);
    expect(summary.cpu).toBe(results.machine.cpu);
  });
});
