import { env, pipeline } from '@huggingface/transformers';
import type { RawChunk } from './transcript';
import { installNetMeter, type NetCounts } from '../net/netmeter';

export const MODEL_ID = 'Xenova/whisper-tiny.en';

export type RequestBody = { type: 'load' } | { type: 'transcribe'; audio: Float32Array };
export type WorkerRequest = RequestBody & { id: number };

export type WorkerResponse =
  | { id: number; type: 'loaded'; ms: number }
  | { id: number; type: 'result'; text: string; chunks: RawChunk[]; ms: number; loadMs: number }
  | { id: number; type: 'error'; message: string }
  | { id: 0; type: 'net'; delta: NetCounts };

// Whatever this worker sends is counted too, and reported to the page for the status chip.
installNetMeter((delta) => self.postMessage({ id: 0, type: 'net', delta } satisfies WorkerResponse));

const base = import.meta.env.BASE_URL;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = `${base}models/`;
env.useBrowserCache = false;
// The ONNX runtime must come from our own origin, never the CDN Transformers.js points to by default.
const onnx = env.backends.onnx;
if (onnx.wasm) {
  onnx.wasm.wasmPaths = `${self.location.origin}${base}ort/`;
  // Pages can't send the headers that threads need, so the runtime would be single-threaded anyway.
  onnx.wasm.numThreads = 1;
}

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string; chunks?: RawChunk[] }>;
let transcriber: Promise<Transcriber> | null = null;

function loadModel(): Promise<Transcriber> {
  transcriber ??= pipeline('automatic-speech-recognition', MODEL_ID, { dtype: 'q8', device: 'wasm' }).then(
    (p) => p as unknown as Transcriber,
  );
  transcriber.catch(() => {
    transcriber = null;
  });
  return transcriber;
}

function reply(message: WorkerResponse) {
  self.postMessage(message);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const started = performance.now();
    const asr = await loadModel();
    const loaded = performance.now();
    if (request.type === 'load') {
      reply({ id: request.id, type: 'loaded', ms: Math.round(loaded - started) });
      return;
    }
    const output = await asr(request.audio, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
    reply({
      id: request.id,
      type: 'result',
      text: output.text,
      chunks: output.chunks ?? [],
      ms: Math.round(performance.now() - loaded),
      loadMs: Math.round(loaded - started),
    });
  } catch (error) {
    reply({ id: request.id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
