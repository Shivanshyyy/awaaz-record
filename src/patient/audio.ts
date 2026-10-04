import { clip } from './clips';

export type ClipOutcome = 'mp3' | 'speech' | 'text';

const BASE = import.meta.env.BASE_URL;
let manifest: Promise<Record<string, { bytes: number }>> | null = null;
let current: HTMLAudioElement | null = null;

export function loadAudioManifest(): Promise<Record<string, { bytes: number }>> {
  manifest ??= fetch(`${BASE}audio/hi/manifest.json`)
    .then((r) => (r.ok ? r.json() : { clips: {} }))
    .then((j: { clips?: Record<string, { bytes: number }> }) => j.clips ?? {})
    .catch(() => ({}));
  return manifest;
}

export function resetAudioManifest() {
  manifest = null;
}

// Chrome on Android lists its voices a moment after the page loads, so wait briefly for them.
export function hindiVoice(): Promise<SpeechSynthesisVoice | null> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve(null);
  const find = () => speechSynthesis.getVoices().find((v) => /^hi([-_]|$)/i.test(v.lang)) ?? null;
  const now = find();
  if (now || speechSynthesis.getVoices().length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(find());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 600);
  });
}

function playMp3(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(`${BASE}audio/hi/${id}.mp3`);
    current = audio;
    audio.onended = () => resolve(true);
    audio.onerror = () => resolve(false);
    audio.play().catch(() => resolve(false));
  });
}

function speak(text: string, voice: SpeechSynthesisVoice): Promise<boolean> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.9;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    speechSynthesis.speak(utterance);
  });
}

/**
 * One clip, with a fallback for each thing that can be missing: the mp3 file, then a Hindi voice on this
 * device, then just the Hindi text (the screen shows it with "audio not available"). Never an English voice.
 */
export async function playClip(id: string): Promise<ClipOutcome> {
  const files = await loadAudioManifest();
  if (id in files && (await playMp3(id))) return 'mp3';
  const voice = await hindiVoice();
  if (voice && (await speak(clip(id).hindi, voice))) return 'speech';
  return 'text';
}

export function stopClips() {
  current?.pause();
  current = null;
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
