import { SAMPLE_RATE, type Samples } from './level';

type AudioContextCtor = typeof AudioContext;

/** A problem with the recording itself, already worded for the health worker. */
export class RecordingError extends Error {}

// Mono 16 kHz Float32 is what Whisper expects; decodeAudioData gives the device rate, so we resample offline.
export async function decodeTo16kMono(blob: Blob): Promise<Samples> {
  const Ctx: AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0).slice();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'EncodingError') {
      throw new RecordingError('The recording was empty or could not be read. Please record again.');
    }
    throw error;
  } finally {
    await ctx.close();
  }
}
