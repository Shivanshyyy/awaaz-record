import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leaves } from '../record/completeness';
import { extractRecord } from './index';
import { DRUGS } from './lexicons/drugs';
import { FACILITIES } from './lexicons/facilities';
import { SYMPTOMS } from './lexicons/symptoms';
import { textToTranscript } from './transcript-from-text';

// The record may hold only: a lexicon entry, words copied from the transcript, a number, or one of the fixed
// answers below. This test walks every value the extractor fills and rejects anything else.
const FIXED = new Set(['mg', 'g', 'mcg', 'ml', 'iu', 'units', 'after', 'before', 'morning', 'afternoon', 'night', 'fluids', 'rest', 'breastfeeding', 'C', 'F', 'normal']);
const LEXICON = new Set([...DRUGS.map((d) => d.name), ...SYMPTOMS.map((s) => s.term), ...FACILITIES.map((f) => f.label)]);

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => (k === 'kind' || k === 'date' ? [] : strings(v)));
  return [];
}

function transcripts(): { id: string; text: string }[] {
  const scripts = JSON.parse(readFileSync('eval/scripts.json', 'utf8')).scripts as { id: string; text: string }[];
  const list = scripts.map((s) => ({ id: `${s.id} reference`, text: s.text }));
  if (existsSync('eval/results/latest.json')) {
    const results = JSON.parse(readFileSync('eval/results/latest.json', 'utf8'));
    for (const row of results.tts?.rows ?? []) list.push({ id: `${row.id} whisper (TTS-synthetic)`, text: row.transcript });
  }
  return list;
}

describe('no generated text', () => {
  for (const { id, text } of transcripts()) {
    it(`${id}: every string in the record is a lexicon entry, a fixed answer, or copied from the transcript`, () => {
      const record = extractRecord(textToTranscript(text), { visitDate: '2026-10-04' });
      const spoken = text.toLowerCase();
      for (const leaf of leaves(record)) {
        if (leaf.field.source !== 'voice' || leaf.field.value === null) continue;
        for (const s of strings(leaf.field.value)) {
          const ok = FIXED.has(s) || LEXICON.has(s) || spoken.includes(s.toLowerCase());
          expect(ok, `${leaf.path} holds "${s}", which is not in the transcript or a lexicon`).toBe(true);
        }
      }
    });

    it(`${id}: every evidence span is the exact text it points at`, () => {
      const record = extractRecord(textToTranscript(text), { visitDate: '2026-10-04' });
      for (const leaf of leaves(record)) {
        for (const e of leaf.field.evidence) expect(text.slice(e.start, e.end), leaf.path).toBe(e.text);
      }
    });
  }
});
