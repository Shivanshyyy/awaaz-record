import { useState, type ReactNode } from 'react';
import { DRUGS } from '../../extract/lexicons/drugs';
import { FACILITIES } from '../../extract/lexicons/facilities';
import type { Edit } from '../../record/edit';
import type { Row } from '../../record/rows';
import type { AdviceTag, DoseUnit, FollowUp, Medication, Timing, VisitRecord } from '../../record/schema';
import { Button } from '../../ui/Button';

interface Props {
  record: VisitRecord;
  row: Row;
  onSave(edits: Edit[]): void;
}

const INPUT = 'min-h-12 w-full rounded-xl border-2 border-line bg-white px-3 text-lg';

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-base font-bold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange(next: boolean): void }) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-3 text-lg">
      <input type="checkbox" className="h-6 w-6" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const num = (text: string): number | null => {
  const n = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
};
const show = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

function medOf(record: VisitRecord, row: Row): Medication | undefined {
  return record.medications.find((m) => m.id === row.group);
}

function Form({ children, onSubmit }: { children: ReactNode; onSubmit(): void }) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <Button type="submit" data-testid="sheet-save">
        Save
      </Button>
    </form>
  );
}

function TextEditor({ record, row, onSave }: Props) {
  const [text, setText] = useState(record.patient.name.value ?? '');
  return (
    <Form onSubmit={() => onSave([{ path: row.id, value: text.trim() }])}>
      <Labelled label="Name (first name only is enough)">
        <input className={INPUT} value={text} onChange={(e) => setText(e.target.value)} data-testid="edit-text" />
      </Labelled>
    </Form>
  );
}

function NumberEditor({ record, row, onSave }: Props) {
  const current = row.leaves[0]!.field.value as number | null;
  const [text, setText] = useState(show(current));
  void record;
  return (
    <Form onSubmit={() => onSave([{ path: row.id, value: num(text) }])}>
      <Labelled label={row.label}>
        <input className={INPUT} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} data-testid="edit-number" />
      </Labelled>
    </Form>
  );
}

function TermsEditor({ record, row, onSave }: Props) {
  const [text, setText] = useState((record.complaint.terms.value ?? []).join(', '));
  return (
    <Form onSubmit={() => onSave([{ path: row.id, value: text.split(',').map((t) => t.trim()).filter(Boolean) }])}>
      <Labelled label="Complaint (separate with commas)">
        <input className={INPUT} value={text} onChange={(e) => setText(e.target.value)} data-testid="edit-terms" />
      </Labelled>
    </Form>
  );
}

function TempEditor({ record, row, onSave }: Props) {
  const t = record.vitals.temp.value;
  const [text, setText] = useState(show(t?.value));
  const [unit, setUnit] = useState<'C' | 'F'>(t?.unit ?? 'C');
  const [normal, setNormal] = useState(t?.qualitative === 'normal' && t.value === null);
  return (
    <Form onSubmit={() => onSave([{ path: row.id, value: normal ? { value: null, unit: null, qualitative: 'normal' } : num(text) === null ? null : { value: num(text), unit } }])}>
      <Check label="Said to be normal (no number)" checked={normal} onChange={setNormal} />
      {!normal && (
        <>
          <Labelled label="Temperature">
            <input className={INPUT} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} data-testid="edit-number" />
          </Labelled>
          <div className="flex gap-2" role="radiogroup" aria-label="Unit">
            {(['C', 'F'] as const).map((u) => (
              <label key={u} className={`flex min-h-12 flex-1 items-center justify-center rounded-xl border-2 text-lg font-bold ${unit === u ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-line'}`}>
                <input type="radio" name="unit" className="sr-only" checked={unit === u} onChange={() => setUnit(u)} />
                {`°${u}`}
              </label>
            ))}
          </div>
        </>
      )}
    </Form>
  );
}

function BpEditor({ record, row, onSave }: Props) {
  const bp = record.vitals.bp.value;
  const [sys, setSys] = useState(show(bp?.sys));
  const [dia, setDia] = useState(show(bp?.dia));
  return (
    <Form onSubmit={() => onSave([{ path: row.id, value: num(sys) !== null && num(dia) !== null ? { sys: num(sys), dia: num(dia) } : null }])}>
      <div className="flex gap-3">
        <Labelled label="Top number">
          <input className={INPUT} inputMode="numeric" value={sys} onChange={(e) => setSys(e.target.value)} data-testid="edit-sys" />
        </Labelled>
        <Labelled label="Bottom number">
          <input className={INPUT} inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} data-testid="edit-dia" />
        </Labelled>
      </div>
    </Form>
  );
}

function MedNameEditor({ record, row, onSave }: Props) {
  const med = medOf(record, row);
  const [text, setText] = useState(med?.name.value ?? '');
  return (
    <Form onSubmit={() => onSave([{ path: row.id, value: text.trim().toLowerCase() }])}>
      <Labelled label="Medicine (pick from the list or type the generic name)">
        <input className={INPUT} list="drug-names" value={text} onChange={(e) => setText(e.target.value)} data-testid="edit-medicine" />
      </Labelled>
      <datalist id="drug-names">
        {DRUGS.map((d) => (
          <option key={d.name} value={d.name} />
        ))}
      </datalist>
    </Form>
  );
}

const UNITS: DoseUnit[] = ['mg', 'g', 'mcg', 'ml', 'iu', 'units'];

function DoseEditor({ record, row, onSave }: Props) {
  const med = medOf(record, row)!;
  const [dose, setDose] = useState(show(med.dose.value));
  const [unit, setUnit] = useState<string>(med.unit.value ?? '');
  const [count, setCount] = useState(show(med.count.value));
  const id = row.group!;
  return (
    <Form onSubmit={() => onSave([{ path: `${id}.dose`, value: num(dose) }, { path: `${id}.unit`, value: unit || null }, { path: `${id}.count`, value: num(count) }])}>
      <Labelled label="Dose">
        <input className={INPUT} inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} data-testid="edit-dose" />
      </Labelled>
      <Labelled label="Unit">
        <select className={INPUT} value={unit} onChange={(e) => setUnit(e.target.value)} data-testid="edit-unit">
          <option value="">Choose a unit</option>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </Labelled>
      <Labelled label="How many tablets or spoons at a time (optional)">
        <input className={INPUT} inputMode="decimal" value={count} onChange={(e) => setCount(e.target.value)} />
      </Labelled>
    </Form>
  );
}

const SLOTS: Timing[] = ['morning', 'afternoon', 'night'];

function FrequencyEditor({ record, row, onSave }: Props) {
  const med = medOf(record, row)!;
  const [choice, setChoice] = useState<string>(med.prn.value ? 'prn' : show(med.perDay.value));
  const [slots, setSlots] = useState<Timing[]>(med.timing.value ?? []);
  const id = row.group!;
  return (
    <Form
      onSubmit={() =>
        onSave([
          { path: `${id}.perDay`, value: choice && choice !== 'prn' ? Number(choice) : null },
          { path: `${id}.prn`, value: choice === 'prn' ? true : null },
          { path: `${id}.timing`, value: slots },
        ])
      }
    >
      <Labelled label="How often">
        <select className={INPUT} value={choice} onChange={(e) => setChoice(e.target.value)} data-testid="edit-frequency">
          <option value="">Choose</option>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'time' : 'times'} a day
            </option>
          ))}
          <option value="prn">Only when needed</option>
        </select>
      </Labelled>
      <fieldset className="space-y-2">
        <legend className="text-base font-bold text-ink-soft">Time of day (optional)</legend>
        {SLOTS.map((s) => (
          <Check key={s} label={s[0]!.toUpperCase() + s.slice(1)} checked={slots.includes(s)} onChange={(on) => setSlots(on ? [...slots, s] : slots.filter((x) => x !== s))} />
        ))}
      </fieldset>
    </Form>
  );
}

function DurationEditor({ record, row, onSave }: Props) {
  const med = medOf(record, row)!;
  const [days, setDays] = useState(show(med.durationDays.value));
  const [ongoing, setOngoing] = useState(med.ongoing.value === true);
  const id = row.group!;
  return (
    <Form onSubmit={() => onSave([{ path: `${id}.durationDays`, value: ongoing ? null : num(days) }, { path: `${id}.ongoing`, value: ongoing ? true : null }])}>
      <Check label="A medicine the patient continues to take" checked={ongoing} onChange={setOngoing} />
      {!ongoing && (
        <Labelled label="For how many days">
          <input className={INPUT} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} data-testid="edit-days" />
        </Labelled>
      )}
    </Form>
  );
}

function WithFoodEditor({ record, row, onSave }: Props) {
  const med = medOf(record, row)!;
  const [value, setValue] = useState<string>(med.withFood.value ?? '');
  return (
    <Form onSubmit={() => onSave([{ path: row.id, value: value || null }])}>
      <Labelled label="With food">
        <select className={INPUT} value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Not said</option>
          <option value="after">After food</option>
          <option value="before">Before food</option>
        </select>
      </Labelled>
    </Form>
  );
}

const TAGS: { tag: AdviceTag; label: string }[] = [
  { tag: 'fluids', label: 'Drink plenty of fluids' },
  { tag: 'rest', label: 'Rest' },
  { tag: 'breastfeeding', label: 'Keep breastfeeding' },
];

function TagsEditor({ record, row, onSave }: Props) {
  const [tags, setTags] = useState<AdviceTag[]>(record.advice.tags.value ?? []);
  return (
    <Form onSubmit={() => onSave([{ path: row.id, value: tags }])}>
      <fieldset className="space-y-2">
        <legend className="text-base font-bold text-ink-soft">Advice given</legend>
        {TAGS.map((t) => (
          <Check key={t.tag} label={t.label} checked={tags.includes(t.tag)} onChange={(on) => setTags(on ? [...tags, t.tag] : tags.filter((x) => x !== t.tag))} />
        ))}
      </fieldset>
    </Form>
  );
}

function OtherEditor({ record, row, onSave }: Props) {
  const [text, setText] = useState((record.advice.other.value ?? []).join('\n'));
  return (
    <Form onSubmit={() => onSave([{ path: row.id, value: text.split('\n').map((t) => t.trim()).filter(Boolean) }])}>
      <Labelled label="Other advice, in your own words (one line each)">
        <textarea className={`${INPUT} py-2`} rows={3} value={text} onChange={(e) => setText(e.target.value)} data-testid="edit-other" />
      </Labelled>
    </Form>
  );
}

function ReferralEditor({ record, row, onSave }: Props) {
  const current = record.referral.value;
  const [to, setTo] = useState(current?.to ?? '');
  const [urgent, setUrgent] = useState(current?.urgent ?? false);
  const [none, setNone] = useState(false);
  return (
    <Form onSubmit={() => onSave([{ path: row.id, value: none || (!to && !urgent) ? null : { to: to || null, urgent } }])}>
      <Check label="No referral" checked={none} onChange={setNone} />
      {!none && (
        <>
          <Labelled label="Referred to">
            <select className={INPUT} value={to} onChange={(e) => setTo(e.target.value)} data-testid="edit-referral">
              <option value="">Choose a place</option>
              {FACILITIES.map((f) => (
                <option key={f.label} value={f.label}>
                  {f.label}
                </option>
              ))}
            </select>
          </Labelled>
          <Check label="Urgent: go today" checked={urgent} onChange={setUrgent} />
        </>
      )}
    </Form>
  );
}

type FollowKind = FollowUp['kind'];

function FollowUpEditor({ record, row, onSave }: Props) {
  const current = record.followUp.value;
  const [kind, setKind] = useState<FollowKind | ''>(current?.kind ?? '');
  const [days, setDays] = useState(current?.kind === 'days' ? String(current.days) : '');
  const [date, setDate] = useState(current?.kind === 'date' ? current.date : '');
  const value = (): FollowUp | null => {
    if (kind === 'days') return num(days) === null ? null : { kind: 'days', days: num(days)! };
    if (kind === 'date') return date ? { kind: 'date', date } : null;
    if (kind === 'if_worse' || kind === 'none') return { kind };
    return null;
  };
  const OPTIONS: { kind: FollowKind; label: string }[] = [
    { kind: 'days', label: 'Come back in a number of days' },
    { kind: 'date', label: 'Come back on a date' },
    { kind: 'if_worse', label: 'Only if not better' },
    { kind: 'none', label: 'No follow-up needed' },
  ];
  return (
    <Form onSubmit={() => onSave([{ path: row.id, value: value() }])}>
      <div className="space-y-2" role="radiogroup" aria-label="Follow-up">
        {OPTIONS.map((o) => (
          <label key={o.kind} className={`flex min-h-12 items-center gap-3 rounded-xl border-2 px-3 text-lg ${kind === o.kind ? 'border-brand-700 bg-brand-50' : 'border-line'}`}>
            <input type="radio" name="followup" className="h-5 w-5" checked={kind === o.kind} onChange={() => setKind(o.kind)} data-testid={`followup-${o.kind}`} />
            {o.label}
          </label>
        ))}
      </div>
      {kind === 'days' && (
        <Labelled label="Days">
          <input className={INPUT} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} data-testid="edit-followup-days" />
        </Labelled>
      )}
      {kind === 'date' && (
        <Labelled label="Date">
          <input className={INPUT} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Labelled>
      )}
    </Form>
  );
}

export function RowEditor(props: Props) {
  switch (props.row.editor) {
    case 'text':
      return <TextEditor {...props} />;
    case 'number':
      return <NumberEditor {...props} />;
    case 'terms':
      return <TermsEditor {...props} />;
    case 'temp':
      return <TempEditor {...props} />;
    case 'bp':
      return <BpEditor {...props} />;
    case 'medName':
      return <MedNameEditor {...props} />;
    case 'dose':
      return <DoseEditor {...props} />;
    case 'frequency':
      return <FrequencyEditor {...props} />;
    case 'duration':
      return <DurationEditor {...props} />;
    case 'withFood':
      return <WithFoodEditor {...props} />;
    case 'tags':
      return <TagsEditor {...props} />;
    case 'other':
      return <OtherEditor {...props} />;
    case 'referral':
      return <ReferralEditor {...props} />;
    case 'followUp':
      return <FollowUpEditor {...props} />;
  }
}
