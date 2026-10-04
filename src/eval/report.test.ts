import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accentGap, renderEvaluation, renderReadmeSummary, withReadmeSummary, type AccentGroupResult, type AccentResult, type EvalResults, type PrimockResult } from './report';

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

describe('the outside benchmark (PriMock57)', () => {
  const primock: PrimockResult = {
    dataset: 'PriMock57',
    source: 'https://example.org/primock',
    commit: 'abcdef0123456789',
    licence: 'CC BY 4.0',
    citation: 'A. Author. A Dataset. 2022.',
    note: 'Clinician channel only.',
    consultations: 5,
    rule: { perConsultation: 2, minSeconds: 8, maxSeconds: 25, total: 10 },
    rows: [
      { id: 'consultation01 at 10.0 s', consultation: 'day1_consultation01', start: 10, end: 20, reference: 'Any | blood in the stool?', heard: 'Any blood in the stool.', audioSeconds: 10, transcribeMs: 400, wordErrors: 1, refWords: 6, wer: 1 / 6 },
      { id: 'consultation02 at 30.0 s', consultation: 'day1_consultation02', start: 30, end: 42, reference: 'Four days of fever.', heard: 'Four days of fever.', audioSeconds: 12, transcribeMs: 500, wordErrors: 0, refWords: 4, wer: 0 },
    ],
    summary: { utterances: 2, words: 10, wordErrors: 1, wer: 0.1, meanUtteranceWer: 1 / 12, audioSeconds: 22, transcribeSeconds: 0.9, realTimeFactor: 0.04 },
  };
  const base: EvalResults = {
    generatedAt: '2026-10-04T00:00:00.000Z',
    visitDate: '2026-10-04',
    machine: { cpu: 'Test CPU', cores: 4, memoryGB: 8, platform: 'test', node: 'v0' },
    model: { repo: 'x/y', dtype: 'q8', runtime: 'r' },
    ttsVoice: null,
    reference: { label: 'r', rows: [], summary: null },
    tts: null,
    recordings: null,
  };

  it('adds a section with the counts, the rule, the licence and the credit, all taken from the results', () => {
    const doc = renderEvaluation({ ...base, primock57: primock }, {});
    expect(doc).toContain('## Outside data: real clinicians (PriMock57)');
    expect(doc).toContain('**1 of 10 words were wrong: a word error rate of 10.0%**');
    expect(doc).toContain('speech recognition only');
    expect(doc).toContain('at most 2 per consultation, at most 10 in all');
    expect(doc).toContain('last 8 to 25 seconds');
    expect(doc).toContain('CC BY 4.0');
    expect(doc).toContain('Credit: Babylon Health');
    expect(doc).toContain('Any \\| blood in the stool?');
    expect(doc).toContain('| consultation01 at 10.0 s | 10.0 s | 1/6 | 16.7% |');
  });

  it('shows it in the at-a-glance table and the README block, never as a field-accuracy figure', () => {
    const doc = renderEvaluation({ ...base, primock57: primock }, {});
    expect(doc).toContain('PriMock57, UK English), speech recognition only | 2 utterances | n/a | n/a | n/a | n/a | n/a | 10.0% | 0.04 |');
    const block = renderReadmeSummary({ ...base, primock57: primock });
    expect(block).toContain('(PriMock57; speech recognition only) | 2 utterances | n/a | n/a | n/a | 10.0% |');
  });

  it('leaves everything out when the dataset was not fetched', () => {
    for (const results of [base, { ...base, primock57: null }]) {
      expect(renderEvaluation(results, {})).not.toContain('PriMock57');
      expect(renderReadmeSummary(results)).not.toContain('PriMock57');
    }
  });
});

describe('the accent check (Speech Accent Archive)', () => {
  const pool = (speakers: number, words: number, wordErrors: number) => ({ speakers, words, wordErrors, wer: wordErrors / words });
  const group = (g: 'india' | 'usa', label: string, wordErrors: number): AccentGroupResult => ({
    group: g,
    label,
    ...pool(2, 20, wordErrors),
    medianWer: wordErrors / 20,
    minWer: 0,
    maxWer: 0.3,
    women: pool(1, 10, 1),
    men: pool(1, 10, wordErrors - 1),
    minAge: 20,
    maxAge: 40,
    languages: { hindi: 1, tamil: 1 },
    residences: { usa: 2 },
  });
  const row = (id: string, g: 'india' | 'usa', wordErrors: number) => ({ id, group: g, speakerId: 1, nativeLanguage: 'hindi', residence: 'usa', gender: 'female', age: '30', heard: 'x', audioSeconds: 20, transcribeMs: 500, wordErrors, refWords: 10, wer: wordErrors / 10 });
  const accent = (indiaErrors: number, usaErrors: number): AccentResult => ({
    dataset: 'Speech Accent Archive',
    source: 'https://accent.example',
    filesFrom: 'https://osf.example/abc',
    licence: 'CC BY-NC-SA 4.0',
    credit: 'A. Author and B. Author, The Archive',
    retrievedOn: '2026-10-04',
    rule: { perGender: 10 },
    skipped: [{ group: 'india', speakerId: 425, file: 'pahari1.mp3', reason: 'not in the OSF repository' }],
    reference: 'Please call Stella.',
    groups: [group('india', 'Born in India, mother tongue not English', indiaErrors), group('usa', 'Native English speakers born in the USA', usaErrors)],
    rows: [row('hindi1', 'india', 3), row('english1', 'usa', 1)],
  });
  const base: EvalResults = {
    generatedAt: '2026-10-04T00:00:00.000Z',
    visitDate: '2026-10-04',
    machine: { cpu: 'Test CPU', cores: 4, memoryGB: 8, platform: 'test', node: 'v0' },
    model: { repo: 'x/y', dtype: 'q8', runtime: 'r' },
    ttsVoice: null,
    reference: { label: 'r', rows: [], summary: null },
    tts: null,
    recordings: null,
  };

  it('works the gap out from the two pooled rates', () => {
    const gap = accentGap(accent(4, 2));
    expect(gap.india).toBeCloseTo(0.2);
    expect(gap.usa).toBeCloseTo(0.1);
    expect(gap.points).toBeCloseTo(10);
    expect(gap.times).toBeCloseTo(2);
  });

  it('says plainly that the model made more errors on the Indian-language speakers, with the gap, the caveats, the credit and the licence', () => {
    const doc = renderEvaluation({ ...base, accent: accent(4, 2) }, {});
    expect(doc).toContain('## Accent check (Speech Accent Archive)');
    expect(doc).toContain('**The model made more errors on the Indian-language speakers: 20.0% of words wrong against 10.0% for native English speakers born in the USA, a gap of 10.0 percentage points (2.0 times as many errors).**');
    expect(doc).toContain('small, indicative');
    expect(doc).toContain('not a fairness audit');
    expect(doc).toContain('The recordings differ in more than accent');
    expect(doc).toContain('pahari1.mp3 (speaker 425) was not in the repository, so the next speaker was taken');
    expect(doc).toContain('CC BY-NC-SA 4.0');
    expect(doc).toContain('A. Author and B. Author, The Archive');
    expect(doc).toContain('| Born in India, mother tongue not English | 2 | 20 | 4 | **20.0%** |');
    expect(doc).toContain('Mother tongues in the Indian-born group: hindi 1, tamil 1.');
    expect(doc).toContain('Where they lived when recorded');
    expect(doc).toContain('usa 2');
    expect(doc).toContain('is where a speaker was **born**');
  });

  it('does not claim a gap that was not found', () => {
    const doc = renderEvaluation({ ...base, accent: accent(2, 4) }, {});
    expect(doc).not.toContain('The model made more errors on the Indian-language speakers');
    expect(doc).toContain('The model made no more errors on the Indian-language speakers (10.0% of words wrong) than on native English speakers born in the USA (20.0%)');
  });

  it('puts both groups in the at-a-glance table and the README block, and leaves everything out without the recordings', () => {
    const doc = renderEvaluation({ ...base, accent: accent(4, 2) }, {});
    expect(doc).toContain('Speech Accent Archive): Born in India, mother tongue not English | 2 speakers | n/a | n/a | n/a | n/a | n/a | 20.0% | n/a |');
    const block = renderReadmeSummary({ ...base, accent: accent(4, 2) });
    expect(block).toContain('Born in India, mother tongue not English (Speech Accent Archive) | 2 speakers | n/a | n/a | n/a | 20.0% |');
    expect(block).toContain('2.0 times as many word errors on the Indian-language speakers (a gap of 10.0 percentage points)');
    for (const results of [base, { ...base, accent: null }]) {
      expect(renderEvaluation(results, {})).not.toContain('Accent check');
      expect(renderReadmeSummary(results)).not.toContain('Accent');
    }
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

describe.skipIf(!(existsSync('eval/results/latest.json') && existsSync('README.md')))('what the README says about the accent check', () => {
  it('says the model made more errors on the Indian-language speakers only if the results show it', () => {
    const results = JSON.parse(readFileSync('eval/results/latest.json', 'utf8')) as EvalResults;
    const readme = readFileSync('README.md', 'utf8');
    const claims = readme.includes('The model made more errors on the Indian-language speakers');
    if (claims) {
      expect(results.accent, 'the README quotes an accent check that has no results').toBeTruthy();
      expect(accentGap(results.accent!).points).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!existsSync('eval/results/latest.json'))('src/eval/summary.generated.json', () => {
  it('is the summary of the latest results, so the About screen shows the same numbers as the evaluation', () => {
    const results = JSON.parse(readFileSync('eval/results/latest.json', 'utf8')) as EvalResults;
    const summary = JSON.parse(readFileSync('src/eval/summary.generated.json', 'utf8'));
    expect(summary.reference).toEqual(results.reference.summary);
    expect(summary.tts).toEqual(results.tts?.summary ?? null);
    expect(summary.recordings).toEqual(results.recordings?.summary ?? null);
    expect(summary.primock57).toEqual(results.primock57?.summary ?? null);
    expect(summary.accent).toEqual(
      results.accent
        ? results.accent.groups.map(({ group, label, speakers, words, wordErrors, wer, medianWer, women, men }) => ({ group, label, speakers, words, wordErrors, wer, medianWer, womenWer: women.wer, menWer: men.wer }))
        : null,
    );
    expect(summary.cpu).toBe(results.machine.cpu);
  });
});
