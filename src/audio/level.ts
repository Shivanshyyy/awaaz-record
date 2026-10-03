export const SAMPLE_RATE = 16000;

/** 16 kHz mono audio held in memory only */
export type Samples = Float32Array<ArrayBuffer>;
const FRAME = SAMPLE_RATE / 10;
const SPEECH_RMS = 0.008;
const MIN_SPEECH_FRAMES = 3;

export function rms(samples: Float32Array, start = 0, end = samples.length): number {
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / (end - start));
}

// Whisper makes up words when it is given silence, so a recording with no speech-level audio never reaches it.
export function hasSpeech(samples: Float32Array): boolean {
  let loudFrames = 0;
  for (let start = 0; start + FRAME <= samples.length; start += FRAME) {
    if (rms(samples, start, start + FRAME) > SPEECH_RMS) loudFrames++;
    if (loudFrames >= MIN_SPEECH_FRAMES) return true;
  }
  return false;
}
