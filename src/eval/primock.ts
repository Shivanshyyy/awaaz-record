// Helpers for the PriMock57 benchmark (CC BY 4.0, Babylon Health): real clinicians in mock consultations.
// Pure functions, so the selection rule and the word-error-rate rules are tested.

export interface Interval {
  start: number;
  end: number;
  text: string;
}

export interface Utterance extends Interval {
  consultation: string;
}

/** Praat TextGrid (long format): every `intervals [n]:` block with its xmin, xmax and text. */
export function parseTextGrid(grid: string): Interval[] {
  const blocks = grid.split(/intervals \[\d+\]:/).slice(1);
  return blocks.flatMap((block) => {
    const xmin = /xmin = ([\d.eE+-]+)/.exec(block)?.[1];
    const xmax = /xmax = ([\d.eE+-]+)/.exec(block)?.[1];
    const text = /text = "((?:[^"]|"")*)"/.exec(block)?.[1];
    if (xmin === undefined || xmax === undefined || text === undefined) return [];
    return [{ start: Number(xmin), end: Number(xmax), text: text.replace(/""/g, '"').trim() }];
  });
}

export interface SelectionRule {
  perConsultation: number;
  minSeconds: number;
  maxSeconds: number;
  total: number;
}

export const SELECTION: SelectionRule = { perConsultation: 2, minSeconds: 8, maxSeconds: 25, total: 10 };

/**
 * The first utterances, in order, that are long enough to be a sentence or two, short enough for one pass, and
 * carry no transcriber tag (`<UNSURE>`, `<UNIN/>`): so nothing is picked for how well the model happens to do on it.
 */
export function selectUtterances(grids: { consultation: string; intervals: Interval[] }[], rule: SelectionRule = SELECTION): Utterance[] {
  const picked: Utterance[] = [];
  for (const { consultation, intervals } of grids) {
    const fits = intervals.filter((i) => i.text !== '' && !i.text.includes('<') && i.end - i.start >= rule.minSeconds && i.end - i.start <= rule.maxSeconds);
    for (const i of fits.slice(0, rule.perConsultation)) {
      if (picked.length < rule.total) picked.push({ consultation, ...i });
    }
  }
  return picked;
}

// People say "um" and the model leaves it out. Counting every filler as an error would measure the transcript style,
// not the recognition, so fillers are dropped from both sides.
export const FILLERS = new Set(['um', 'uh', 'uhm', 'umm', 'er', 'erm', 'mm', 'mmm', 'hmm', 'hm', 'mhm', 'ah', 'eh']);

export function dropFillers(words: string[]): string[] {
  return words.filter((w) => !FILLERS.has(w));
}
