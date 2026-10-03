export interface TranscriptWord {
  w: string;
  t0: number;
  t1: number;
  /** character offsets of this word inside Transcript.text */
  start: number;
  end: number;
}

export interface Transcript {
  text: string;
  words: TranscriptWord[];
}

export interface RawChunk {
  text: string;
  timestamp: [number, number | null];
}

const ATTACHES_LEFT = /^[.,;:!?%)\]]/;
const MIN_WORD_SECONDS = 0.3;

// Whisper returns one chunk per word with a leading space; punctuation is already merged into the word.
export function buildTranscript(chunks: RawChunk[], audioSeconds: number): Transcript {
  let text = '';
  const words: TranscriptWord[] = [];

  for (const chunk of chunks) {
    const piece = chunk.text.trim();
    if (!piece) continue;

    if (text && !ATTACHES_LEFT.test(piece)) text += ' ';
    const start = text.length;
    text += piece;

    const t0 = clamp(chunk.timestamp[0] ?? 0, 0, audioSeconds);
    const t1 = clamp(chunk.timestamp[1] ?? t0 + MIN_WORD_SECONDS, t0, audioSeconds);
    words.push({ w: piece, t0, t1, start, end: text.length });
  }
  return { text, words };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
