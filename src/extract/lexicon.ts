export interface LexMatch<T> {
  entry: T;
  start: number;
  end: number;
  text: string;
}

function aliasPattern(alias: string): string {
  const parts = alias
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Letters spelled out ("o r s") may come with dots or spaces; words may be joined by space or hyphen.
  const single = parts.every((p) => p.length === 1);
  // "headaches", "knees": a plural s/es on the last word of a longer alias still matches
  const last = parts.length - 1;
  if (parts[last]!.length >= 4 && /[a-z]$/.test(parts[last]!) && !/s$/.test(parts[last]!)) parts[last] += '(?:e?s)?';
  return `\\b${parts.join(single ? '[\\s.]*' : '[\\s\\-]+')}\\b`;
}

/** Finds lexicon entries in text by alias, case-insensitive, longest match first, never overlapping. */
export function buildMatcher<T>(entries: T[], aliasesOf: (entry: T) => string[]): (text: string) => LexMatch<T>[] {
  const compiled = entries.flatMap((entry) =>
    aliasesOf(entry).map((alias) => ({ entry, regex: new RegExp(aliasPattern(alias), 'gi') })),
  );
  return (text) => {
    const all: LexMatch<T>[] = [];
    for (const { entry, regex } of compiled) {
      regex.lastIndex = 0;
      for (let m = regex.exec(text); m; m = regex.exec(text)) {
        all.push({ entry, start: m.index, end: m.index + m[0].length, text: m[0] });
        if (m[0].length === 0) regex.lastIndex++;
      }
    }
    all.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const kept: LexMatch<T>[] = [];
    let until = -1;
    for (const m of all) {
      if (m.start >= until) {
        kept.push(m);
        until = m.end;
      }
    }
    return kept;
  };
}
