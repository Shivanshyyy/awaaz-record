import type { EvalSummary, PrimockSummary } from '../../eval/report';
import generated from '../../eval/summary.generated.json';
import { hindiReviewed } from '../../patient/clips';
import { useRouter } from '../router';
import { Button } from '../../ui/Button';

// The JSON has `null` for rows with no clips yet; say so in the type so the page handles both cases.
const summary = generated as unknown as { generatedOn: string; cpu: string; reference: EvalSummary; tts: EvalSummary | null; recordings: EvalSummary | null; primock57: PrimockSummary | null };

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const version = typeof __APP_VERSION__ === 'undefined' ? null : __APP_VERSION__;

const SOURCES = [
  { name: 'Irving et al., BMJ Open, 2017 (67 countries)', says: 'Four Indian studies measured primary care consultations of 1.5 to 2.3 minutes (Fair or Poor quality data).', url: 'https://doi.org/10.1136/bmjopen-2017-017902' },
  { name: 'Ministry of Health and Family Welfare, India (PIB), 9 Sep 2024', says: 'The Union Health Secretary called for cutting the burden of work on health functionaries who report data.', url: 'https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2053070' },
  { name: 'WHO Global Health Observatory, HWF_0001', says: 'India had 9.55 medical doctors per 10,000 people in 2024.', url: 'https://ghoapi.azureedge.net/api/HWF_0001' },
  { name: 'GSMA Mobile Gender Gap Report 2025', says: 'Women in South Asia are 32% less likely than men to use mobile internet.', url: 'https://www.gsma.com/newsroom/press-release/progress-closing-the-mobile-internet-gender-gap-stalls-in-lmics-gsma-mobile-gender-gap-report-2025/' },
  { name: 'Kessels, J R Soc Med, 2003', says: '40-80% of medical information given by health practitioners is forgotten immediately.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC539473/' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xl font-bold">{title}</h3>
      {children}
    </section>
  );
}

export function AboutScreen() {
  const { back } = useRouter();
  const ref = summary.reference;
  const tts = summary.tts;
  const primock = summary.primock57;
  return (
    <article aria-labelledby="about-title" className="space-y-5">
      <Button variant="secondary" onClick={back}>
        Back
      </Button>
      <h2 id="about-title" className="text-2xl font-bold">
        About, evidence and limits
      </h2>

      <Section title="What this app is">
        <p>
          A health worker speaks a short visit note. The phone writes it down on the device and fills a fixed record. She checks every item, confirms it, and the patient gets a slip and Hindi instructions. It drafts; a person decides. <strong>It never diagnoses and never suggests a treatment.</strong>
        </p>
      </Section>

      <Section title="Guardrails">
        <ul className="list-disc space-y-1 pl-6">
          <li>Every value points to the words it came from, and can be played back.</li>
          <li>The app asks instead of guessing. Confirm stays off while anything is amber or red.</li>
          <li>The record only holds list entries, numbers and words from the transcript. Nothing is generated.</li>
          <li>Hindi lines come from a fixed list, never written by the app.</li>
          <li>Records are locked with your PIN. The recording is deleted when you confirm. Nothing leaves the phone.</li>
        </ul>
      </Section>

      <Section title="How well does it work?">
        <div data-testid="about-results" className="space-y-2 rounded-xl border border-line p-3">
          <p>
            <strong>Reference text</strong> (the extractor alone): {ref.fieldChecksPassed} of {ref.fieldChecksTotal} fields right ({pct(ref.fieldAccuracy)}).
          </p>
          {tts && (
            <p>
              <strong>Computer-voice audio</strong> (a pipeline check, not real speech): {tts.fieldChecksPassed} of {tts.fieldChecksTotal} fields right ({pct(tts.fieldAccuracy)}). {tts.wrongValues} values were wrong and {tts.silentWrongValues} of those looked fine. Word error rate {pct(tts.wer ?? 0)}.
            </p>
          )}
          {primock && (
            <p data-testid="about-primock">
              <strong>Real clinicians, outside data</strong> (UK English mock consultations, speech recognition only): {primock.wordErrors} of {primock.words} words were wrong ({pct(primock.wer)}) in {primock.utterances} utterances. That is why a person checks every record.
            </p>
          )}
          <p>
            <strong>Real voices in our setting:</strong> {summary.recordings ? `${summary.recordings.fieldChecksPassed} of ${summary.recordings.fieldChecksTotal} fields right` : 'pending recordings. Nobody has tested this app with a health worker’s voice yet.'}
          </p>
          <p className="text-sm text-ink-soft">Measured on {summary.cpu} on {summary.generatedOn}. Details are in docs/EVALUATION.md.</p>
        </div>
      </Section>

      <Section title="What the data does not cover">
        <ul className="list-disc space-y-1 pl-6">
          <li>No real patients and no real clinic audio. The notes are made up, and the consultations in the outside test are acted.</li>
          <li>English speech only. No Hindi or Hinglish dictation.</li>
          <li>One synthetic Indian-English voice; no children, elderly or noisy-room speech.</li>
          <li>A word list of 90 generic medicines and 57 complaints. Others are shown as heard, with a question.</li>
          <li>Tested on a laptop, not yet on a low-end phone.</li>
          <li>{hindiReviewed ? 'The Hindi lines have been checked by a Hindi speaker.' : 'The Hindi lines have not yet been checked by a Hindi speaker.'}</li>
        </ul>
      </Section>

      <Section title="Bias and fairness">
        <p>
          Speech recognition can be less accurate for some accents, genders, ages and names. We have only tested one computer voice, so we cannot yet say how large any gap is. That is why a person checks every record, names and ages have a one-tap <em>Hear it</em>, and nothing is used to rank or decide anything about a patient.
        </p>
      </Section>

      <Section title="Why it matters (sources I opened)">
        <ul className="space-y-3">
          {SOURCES.map((s) => (
            <li key={s.url} className="rounded-xl border border-line p-3">
              <p className="font-bold">{s.name}</p>
              <p>{s.says}</p>
              <a href={s.url} target="_blank" rel="noreferrer" className="break-all font-semibold text-brand-800 underline">
                {s.url}
              </a>
            </li>
          ))}
        </ul>
      </Section>

      {version && (
        <p data-testid="about-version" className="text-sm text-ink-soft">
          Version {version.stamp}, built {version.builtAt.slice(0, 16).replace('T', ' ')} UTC.
        </p>
      )}
    </article>
  );
}
