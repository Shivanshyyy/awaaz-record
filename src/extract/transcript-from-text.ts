import type { Transcript } from '../asr/transcript';

// Reference text has no audio, so words get offsets but no times.
export function textToTranscript(text: string): Transcript {
  const words = [...text.matchAll(/\S+/g)].map((m) => ({
    w: m[0],
    start: m.index!,
    end: m.index! + m[0].length,
    t0: 0,
    t1: 0,
  }));
  return { text, words };
}
