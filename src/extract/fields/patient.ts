import { makeField, type Field } from '../../record/schema';
import { evidenceFor, evidenceOfTokens, flag, titleCase, type ExtractContext } from '../context';
import { mergeShorthand } from '../numbers';
import { SENTENCE_END } from '../tokens';

const TITLES = new Set(['baby', 'master', 'mr', 'mrs', 'ms', 'miss', 'shri', 'smt', 'shrimati', 'mister', 'child', 'boy', 'girl', 'lady', 'name', 'is', 'named', 'called', 'was', 'the', 'here', 'this']);
const NOT_NAMES = new Set([
  'a', 'an', 'and', 'of', 'for', 'with', 'who', 'came', 'has', 'had', 'have', 'brought', 'aged', 'age', 'are', 'were', 'he', 'she', 'it', 'they',
  'his', 'her', 'from', 'at', 'in', 'on', 'to', 'by', 'complains', 'complaining', 'presented', 'presents', 'having', 'patient', 'year', 'years',
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred',
]);
const YEAR_WORDS = new Set(['year', 'years', 'yr', 'yrs', 'y', 'yo', 'year-old', 'years-old', 'yearold', 'old']);
const MONTH_WORDS = new Set(['month', 'months', 'mo', 'mos', 'month-old', 'months-old']);

export function extractPatient(ctx: ExtractContext): { name: Field<string>; ageYears: Field<number>; nameToken: number } {
  const { tokens } = ctx;
  const patientAt = tokens.findIndex((t) => t.lower === 'patient' || t.lower === 'pt');
  let nameToken = -1;

  if (patientAt !== -1) {
    let i = patientAt + 1;
    while (i < tokens.length && (tokens[i]!.kind === 'punct' && [',', ':', '-', '–'].includes(tokens[i]!.text) || TITLES.has(tokens[i]!.lower))) i++;
    const candidate = tokens[i];
    if (candidate && candidate.kind === 'word' && /^[a-z][a-z'’-]+$/i.test(candidate.text) && !NOT_NAMES.has(candidate.lower)) nameToken = i;
  }

  let name: Field<string>;
  if (nameToken !== -1) {
    const t = tokens[nameToken]!;
    name = makeField(titleCase(t.text.replace(/['\u2019]s$/i, '')), [evidenceOfTokens(ctx, nameToken, nameToken)]);
  } else {
    name = makeField<string>(null, patientAt === -1 ? [] : [evidenceOfTokens(ctx, patientAt, patientAt)]);
  }

  const age = extractAge(ctx, nameToken === -1 ? patientAt : nameToken);
  return { name, ageYears: age.value === null ? ageAnywhere(ctx) : age, nameToken };
}

// The name may be garbled, but "60 years" or "age 52" still says the age.
function ageAnywhere(ctx: ExtractContext): Field<number> {
  const { tokens } = ctx;
  const numbers = mergeShorthand(ctx.numbers);
  for (const n of numbers) {
    const lead = tokens[n.first - 1]?.lower ?? '';
    const unit = tokens[n.last + 1]?.lower ?? '';
    const spokenAge = lead === 'age' || lead === 'aged';
    const yearsOld = /^years?$|^yrs?$|^year-old$|^years-old$/.test(unit) && !['for', 'since', 'over', 'past', 'last', 'x', 'in', 'after', 'within'].includes(lead);
    if ((spokenAge || yearsOld) && Number.isInteger(n.value) && n.value <= 120) {
      const end = yearsOld ? tokens[n.last + 1]!.end : n.end;
      return makeField(n.value, [evidenceFor(ctx, n.start, end)]);
    }
    if (n.value > 0 && tokens.slice(0, n.first).some((t) => ['mg', 'milligrams', 'milligram'].includes(t.lower))) break;
  }
  return makeField<number>(null);
}

function extractAge(ctx: ExtractContext, after: number): Field<number> {
  const { tokens } = ctx;
  if (after === -1) return makeField<number>(null);
  const numbers = mergeShorthand(ctx.numbers).filter((n) => n.first > after);
  const n = numbers[0];
  if (!n) return makeField<number>(null);

  // Between the name and the number there may be a comma or a few filler words, but not a new sentence.
  const between = tokens.slice(after + 1, n.first);
  if (between.some((t) => SENTENCE_END.has(t.text)) || between.length > 3) return makeField<number>(null);

  let k = n.last + 1;
  if (tokens[k]?.text === '-') k++;
  const unit = tokens[k]?.lower ?? '';
  if (YEAR_WORDS.has(unit) || /^year/.test(unit)) {
    let last = k;
    if (unit === 'year' && tokens[k + 1]?.text === '-' && tokens[k + 2]?.lower === 'old') last = k + 2;
    return makeField(n.value, [evidenceFor(ctx, n.start, tokens[last]!.end)]);
  }
  if (MONTH_WORDS.has(unit)) {
    const years = Math.round((n.value / 12) * 100) / 100;
    return makeField(years, [evidenceFor(ctx, n.start, tokens[k]!.end)], [
      flag('UNCLEAR', 'patient.ageYears', `Age was given in months (${n.value}). It is stored as ${years} years — is that right?`),
    ]);
  }
  // A bare number right after the name: "Patient Ramesh, fifty-two."
  const bare = between.every((t) => t.kind === 'punct') && (!tokens[n.last + 1] || tokens[n.last + 1]!.kind === 'punct');
  if (bare && Number.isInteger(n.value)) return makeField(n.value, [evidenceFor(ctx, n.start, n.end)]);
  return makeField<number>(null);
}
