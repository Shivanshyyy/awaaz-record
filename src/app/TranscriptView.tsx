import { useState } from 'react';
import type { Transcript, TranscriptWord } from '../asr/transcript';

export function TranscriptView({ transcript, onPlayWord }: { transcript: Transcript; onPlayWord(word: TranscriptWord): void }) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <p data-testid="transcript-text" className="text-lg leading-[3rem]">
      {transcript.words.map((word, i) => (
        <span key={`${word.start}-${i}`}>
          <button
            type="button"
            aria-pressed={active === i}
            onClick={() => {
              setActive(i);
              onPlayWord(word);
            }}
            className={`inline-block min-h-12 rounded-md px-1 align-middle ${active === i ? 'bg-brand-100 font-bold text-brand-800' : ''}`}
          >
            {word.w}
          </button>{' '}
        </span>
      ))}
    </p>
  );
}
