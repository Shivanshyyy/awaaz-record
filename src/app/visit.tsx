import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { asr } from '../asr/client';
import type { Transcript } from '../asr/transcript';
import { decodeTo16kMono, RecordingError } from '../audio/decode';
import { hasSpeech, type Samples } from '../audio/level';
import { SpanPlayer } from '../audio/player';
import { MicError, Recorder, type MicProblem } from '../audio/recorder';

export type Stage = 'idle' | 'recording' | 'decoding' | 'transcribing' | 'done' | 'error';

interface VisitState {
  stage: Stage;
  recordSeconds: number;
  level: number;
  transcript: Transcript | null;
  stats: { audioSeconds: number; ms: number; loadMs: number } | null;
  error: string | null;
  micProblem: MicProblem | null;
}

interface VisitApi extends VisitState {
  start(): Promise<void>;
  stop(): Promise<void>;
  cancel(): void;
  reset(): void;
  transcribeFile(file: File): Promise<void>;
  playSpan(t0: number, t1: number): void;
  playAll(): void;
  stopPlayback(): void;
}

const IDLE: VisitState = { stage: 'idle', recordSeconds: 0, level: 0, transcript: null, stats: null, error: null, micProblem: null };

const NO_SPEECH = 'No speech was heard. Move closer to the phone, speak clearly, and record again.';
const MODEL_MISSING =
  'The speech model is not on this phone yet. Connect to the internet once and tap "Set up offline" at the top of the screen.';

function explain(error: unknown): string {
  if (error instanceof RecordingError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch|network|locate|not found|404|load failed/i.test(message)) return MODEL_MISSING;
  return `Transcription stopped: ${message}`;
}

const VisitContext = createContext<VisitApi | null>(null);

export function VisitProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VisitState>(IDLE);
  const recorder = useRef<Recorder | null>(null);
  const player = useRef<SpanPlayer | null>(null);
  const stopRef = useRef<() => Promise<void>>(async () => {});

  const patch = useCallback((next: Partial<VisitState>) => setState((s) => ({ ...s, ...next })), []);

  const dropAudio = useCallback(() => {
    player.current?.dispose();
    player.current = null;
  }, []);

  const process = useCallback(
    async (getSamples: () => Promise<Samples>) => {
      try {
        patch({ stage: 'decoding' });
        const samples = await getSamples();
        if (!hasSpeech(samples)) {
          patch({ stage: 'error', error: NO_SPEECH });
          return;
        }
        dropAudio();
        player.current = new SpanPlayer(samples);
        patch({ stage: 'transcribing' });
        const result = await asr.transcribe(samples);
        patch({ stage: 'done', transcript: result.transcript, stats: { audioSeconds: result.audioSeconds, ms: result.ms, loadMs: result.loadMs } });
      } catch (error) {
        patch({ stage: 'error', error: explain(error) });
      }
    },
    [dropAudio, patch],
  );

  const stop = useCallback(async () => {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;
    const { blob } = await active.stop();
    await process(() => decodeTo16kMono(blob));
  }, [process]);
  stopRef.current = stop;

  const reset = useCallback(() => {
    recorder.current?.cancel();
    recorder.current = null;
    dropAudio();
    setState(IDLE);
  }, [dropAudio]);

  const start = useCallback(async () => {
    reset();
    const active = new Recorder();
    recorder.current = active;
    patch({ stage: 'recording' });
    // Load the model while the worker is still talking, so the wait after Stop is shorter.
    void asr.warmUp().catch(() => {});
    try {
      await active.start({
        onTick: (recordSeconds) => patch({ recordSeconds }),
        onLevel: (level) => patch({ level }),
        onLimit: () => void stopRef.current(),
      });
    } catch (error) {
      recorder.current = null;
      if (error instanceof MicError) patch({ stage: 'error', micProblem: error.problem, error: error.message });
      else patch({ stage: 'error', micProblem: 'error', error: 'The microphone could not be started.' });
    }
  }, [patch, reset]);

  const transcribeFile = useCallback(
    async (file: File) => {
      reset();
      await process(() => decodeTo16kMono(file));
    },
    [process, reset],
  );

  const playSpan = useCallback((t0: number, t1: number) => player.current?.play(t0, t1), []);
  const playAll = useCallback(() => player.current?.play(), []);
  const stopPlayback = useCallback(() => player.current?.stop(), []);

  // Leaving the app must release the microphone and drop the audio.
  useEffect(() => reset, [reset]);

  const api = useMemo<VisitApi>(
    () => ({ ...state, start, stop, cancel: reset, reset, transcribeFile, playSpan, playAll, stopPlayback }),
    [state, start, stop, reset, transcribeFile, playSpan, playAll, stopPlayback],
  );
  return <VisitContext.Provider value={api}>{children}</VisitContext.Provider>;
}

export function useVisit(): VisitApi {
  const ctx = useContext(VisitContext);
  if (!ctx) throw new Error('useVisit must be used inside VisitProvider');
  return ctx;
}
