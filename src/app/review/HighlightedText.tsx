import type { Evidence } from '../../record/schema';

/** The transcript with the words a value came from marked. */
export function HighlightedText({ text, spans }: { text: string; spans: Pick<Evidence, 'start' | 'end'>[] }) {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const parts: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (const s of sorted) {
    if (s.end <= at) continue;
    const start = Math.max(s.start, at);
    if (start > at) parts.push({ text: text.slice(at, start), mark: false });
    parts.push({ text: text.slice(start, s.end), mark: true });
    at = s.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), mark: false });
  return (
    <p className="text-lg leading-8">
      {parts.map((p, i) =>
        p.mark ? (
          <mark key={i} className="rounded bg-brand-100 px-0.5 font-bold text-ink">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}
