import data from './clips.generated.json';

// The Hindi text is generated from docs/HINDI_CLIPS.md by scripts/build-hindi-clips.mjs; it is never typed here.
export interface Clip {
  id: string;
  group: string;
  hindi: string;
  romanized: string;
  english: string;
}

export const CLIPS: Clip[] = data.clips;
export const hindiReviewed: boolean = data.reviewedByHindiSpeaker;

export function clip(id: string): Clip {
  const found = CLIPS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown Hindi clip "${id}"`);
  return found;
}
