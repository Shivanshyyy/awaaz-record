import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Chromium's own fake microphone hangs on this Mac (probably the microphone privacy prompt), so tests swap
// getUserMedia for a Web Audio stream that plays a WAV file once in real time and then goes quiet.
// MediaRecorder, decoding, the worker and the UI all run for real.
export async function installFakeMic(page: Page, wavPath: string): Promise<void> {
  const base64 = readFileSync(wavPath).toString('base64');
  await page.addInitScript((data: string) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0)).buffer;
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const decoded = await context.decodeAudioData(bytes.slice(0));
      const destination = context.createMediaStreamDestination();
      const source = context.createBufferSource();
      source.buffer = decoded;
      source.connect(destination);
      source.start();
      return destination.stream;
    };
  }, base64);
}

export async function installDeniedMic(page: Page): Promise<void> {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
}
