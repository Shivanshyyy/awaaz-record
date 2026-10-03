import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { asr } from '../asr/client';
import type { Transcript } from '../asr/transcript';
import { extractRecord } from '../extract';
import { textToTranscript } from '../extract/transcript-from-text';
import { addMedication, applyEdits, confirmFields, confirmRecord, markNotApplicable, removeMedication, type Edit } from '../record/edit';
import type { VisitRecord } from '../record/schema';
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
  record: VisitRecord | null;
  /** the recording is still in memory, so the worker can play parts of it */
  hasAudio: boolean;
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
  /** developer helper: skip the audio and review a typed or pasted transcript */
  reviewText(text: string): void;
  edit(edits: Edit[]): void;
  lookRight(paths: string[]): void;
  notApplicable(paths: string[]): void;
  addMedicine(): string;
  removeMedicine(id: string): void;
  confirm(): void;
  playSpan(t0: number, t1: number): void;
  playAll(): void;
  stopPlayback(): void;
}

const IDLE: VisitState = { stage: 'idle', recordSeconds: 0, level: 0, transcript: null, record: null, hasAudio: false, stats: null, error: null, micProblem: null };

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function newRecord(transcript: Transcript): VisitRecord {
  return extractRecord(transcript, { visitDate: today(), id: crypto.randomUUID() });
}

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
  const recordRef = useRef<VisitRecord | null>(null);
  recordRef.current = state.record;

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
        patch({
          stage: 'done',
          transcript: result.transcript,
          record: newRecord(result.transcript),
          hasAudio: true,
          stats: { audioSeconds: result.audioSeconds, ms: result.ms, loadMs: result.loadMs },
        });
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

  const reviewText = useCallback(
    (text: string) => {
      reset();
      const transcript = textToTranscript(text.trim());
      setState({ ...IDLE, stage: 'done', transcript, record: newRecord(transcript) });
    },
    [reset],
  );

  // Every change to the record goes through the edit functions, which re-check everything.
  const change = useCallback((fn: (record: VisitRecord) => VisitRecord) => setState((s) => (s.record ? { ...s, record: fn(s.record) } : s)), []);
  const edit = useCallback((edits: Edit[]) => change((r) => applyEdits(r, edits)), [change]);
  const lookRight = useCallback((paths: string[]) => change((r) => confirmFields(r, paths)), [change]);
  const notApplicable = useCallback((paths: string[]) => change((r) => markNotApplicable(r, paths)), [change]);
  const removeMedicine = useCallback((id: string) => change((r) => removeMedication(r, id)), [change]);
  const addMedicine = useCallback((): string => {
    const current = recordRef.current;
    if (!current) return '';
    const added = addMedication(current);
    setState((s) => ({ ...s, record: added.record }));
    return added.id;
  }, []);
  const confirm = useCallback(() => change((r) => confirmRecord(r)), [change]);

  const playSpan = useCallback((t0: number, t1: number) => player.current?.play(t0, t1), []);
  const playAll = useCallback(() => player.current?.play(), []);
  const stopPlayback = useCallback(() => player.current?.stop(), []);

  // Leaving the app must release the microphone and drop the audio.
  useEffect(() => reset, [reset]);

  const api = useMemo<VisitApi>(
    () => ({ ...state, start, stop, cancel: reset, reset, transcribeFile, reviewText, edit, lookRight, notApplicable, addMedicine, removeMedicine, confirm, playSpan, playAll, stopPlayback }),
    [state, start, stop, reset, transcribeFile, reviewText, edit, lookRight, notApplicable, addMedicine, removeMedicine, confirm, playSpan, playAll, stopPlayback],
  );
  return <VisitContext.Provider value={api}>{children}</VisitContext.Provider>;
}

export function useVisit(): VisitApi {
  const ctx = useContext(VisitContext);
  if (!ctx) throw new Error('useVisit must be used inside VisitProvider');
  return ctx;
}
