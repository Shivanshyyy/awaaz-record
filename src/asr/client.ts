import { buildTranscript, type Transcript } from './transcript';
import type { Samples } from '../audio/level';
import type { RequestBody, WorkerResponse } from './worker';

export interface TranscribeResult {
  transcript: Transcript;
  audioSeconds: number;
  /** time spent transcribing, not counting model loading */
  ms: number;
  /** time this request waited for the model to load (0 when it was already loaded) */
  loadMs: number;
}

const SAMPLE_RATE = 16000;

type Pending = { resolve(value: WorkerResponse): void; reject(error: Error): void };

class AsrClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const waiting = this.pending.get(event.data.id);
      if (!waiting) return;
      this.pending.delete(event.data.id);
      if (event.data.type === 'error') waiting.reject(new Error(event.data.message));
      else waiting.resolve(event.data);
    };
    worker.onerror = (event) => this.failAll(new Error(event.message || 'The speech worker stopped unexpectedly.'));
    this.worker = worker;
    return worker;
  }

  private failAll(error: Error) {
    for (const waiting of this.pending.values()) waiting.reject(error);
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  private send(request: RequestBody, transfer: Transferable[] = []): Promise<WorkerResponse> {
    const id = this.nextId++;
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...request, id }, transfer);
    });
  }

  /** Loads the model into memory ahead of the first recording. */
  async warmUp(): Promise<number> {
    const reply = await this.send({ type: 'load' });
    return reply.type === 'loaded' ? reply.ms : 0;
  }

  async transcribe(audio: Samples): Promise<TranscribeResult> {
    const audioSeconds = audio.length / SAMPLE_RATE;
    // The worker gets a copy so the main thread keeps the samples for playback.
    const copy = audio.slice();
    const reply = await this.send({ type: 'transcribe', audio: copy }, [copy.buffer]);
    if (reply.type !== 'result') throw new Error('Unexpected reply from the speech worker.');
    return {
      transcript: buildTranscript(reply.chunks, audioSeconds),
      audioSeconds,
      ms: reply.ms,
      loadMs: reply.loadMs,
    };
  }
}

export const asr = new AsrClient();
