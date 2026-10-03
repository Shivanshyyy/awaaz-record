import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractRecord } from './index';
import { textToTranscript } from './transcript-from-text';
import { accuracy, scoreScript, type ScriptCase, type ScriptScore } from './score';

const file = JSON.parse(readFileSync('eval/scripts.json', 'utf8')) as { visitDate: string; scripts: ScriptCase[] };
const scores: ScriptScore[] = [];

describe('the 10 synthetic scripts, reference text', () => {
  for (const script of file.scripts) {
    describe(`${script.id}: ${script.tests}`, () => {
      const record = extractRecord(textToTranscript(script.text), { visitDate: file.visitDate });
      const score = scoreScript(script, record);
      scores.push(score);

      for (const check of score.checks) {
        it(check.area, () => expect(check.ok, check.detail).toBe(true));
      }
      for (const check of score.flagChecks) {
        it(check.area, () => expect(check.ok, check.detail).toBe(true));
      }
      it('raises no flags beyond the expected ones', () => {
        expect(score.extraFlags.map((f) => `${f.code}@${f.target}: ${f.message}`)).toEqual([]);
      });
      it('gives every extracted value at least one evidence span', () => {
        const fields = [
          record.patient.name, record.patient.ageYears, record.complaint.terms, record.complaint.durationDays,
          record.vitals.temp, record.vitals.bp, record.vitals.pulse, record.vitals.weightKg, record.vitals.spo2,
          record.advice.tags, record.referral, record.followUp,
          ...record.medications.flatMap((m) => [m.name, m.dose, m.unit, m.perDay, m.timing, m.prn, m.durationDays, m.ongoing, m.withFood]),
        ];
        const bare = fields.filter((f) => f.value !== null && f.value !== undefined && !(Array.isArray(f.value) && f.value.length === 0) && f.evidence.length === 0);
        expect(bare.length).toBe(0);
      });
    });
  }

  it('field accuracy over all scripts is at least 90%', () => {
    const { passed, total, ratio } = accuracy(scores);
    console.log(`field accuracy on reference text: ${passed}/${total} = ${(ratio * 100).toFixed(1)}%`);
    expect(ratio).toBeGreaterThanOrEqual(0.9);
  });
});
