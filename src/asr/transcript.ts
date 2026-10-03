export interface TranscriptWord {
  w: string;
  t0: number;
  t1: number;
  /** character offsets of this word inside Transcript.text */
  start: number;
  end: number;
}

export type TranscriptWarning = 'repeated';

export interface Transcript {
  text: string;
  words: TranscriptWord[];
  /** set when the model got stuck repeating itself and the text was cut */
  warnings?: TranscriptWarning[];
}

export interface RawChunk {
  text: string;
  timestamp: [number, number | null];
}

const ATTACHES_LEFT = /^[.,;:!?%)\]]/;
const MIN_WORD_SECONDS = 0.3;

const plain = (word: string) => word.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Small speech models sometimes get stuck and repeat one phrase until they run out of room.
 * Returns how many words to keep (one copy of the repeated phrase), or null when there is no loop.
 */
export function findLoop(words: string[]): number | null {
  const w = words.map(plain);
  for (let n = 2; n <= 12; n++) {
    const needed = n === 2 ? 4 : 3;
    for (let i = 0; i + n * needed <= w.length; i++) {
      let repeats = 1;
      while (i + n * (repeats + 1) <= w.length && w.slice(i, i + n).every((x, k) => x === w[i + n * repeats + k])) repeats++;
      if (repeats >= needed) return i + n;
    }
  }
  return null;
}

// Whisper returns one chunk per word with a leading space; punctuation is already merged into the word.
export function buildTranscript(chunks: RawChunk[], audioSeconds: number): Transcript {
  let text = '';
  const words: TranscriptWord[] = [];
  const spoken = chunks.filter((c) => c.text.trim());
  const keep = findLoop(spoken.map((c) => c.text));

  for (const chunk of keep === null ? spoken : spoken.slice(0, keep)) {
    const piece = chunk.text.trim();

    if (text && !ATTACHES_LEFT.test(piece)) text += ' ';
    const start = text.length;
    text += piece;

    const t0 = clamp(chunk.timestamp[0] ?? 0, 0, audioSeconds);
    const t1 = clamp(chunk.timestamp[1] ?? t0 + MIN_WORD_SECONDS, t0, audioSeconds);
    words.push({ w: piece, t0, t1, start, end: text.length });
  }
  return keep === null ? { text, words } : { text, words, warnings: ['repeated'] };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
