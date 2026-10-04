import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { asr } from '../asr/client';
import type { Transcript } from '../asr/transcript';
import { decodeTo16kMono, RecordingError } from '../audio/decode';
import { hasSpeech, type Samples } from '../audio/level';
import { SpanPlayer } from '../audio/player';
import { MicError, Recorder, type MicProblem } from '../audio/recorder';
import { extractRecord } from '../extract';
import { textToTranscript } from '../extract/transcript-from-text';
import { blankRecord } from '../record/blank';
import { addMedication, applyEdits, confirmFields, confirmRecord, markNotApplicable, removeMedication, type Edit } from '../record/edit';
import type { VisitRecord } from '../record/schema';
import { saveRecord, saveTask } from '../store/db';
import { tasksFor } from '../store/tasks';
import { recordTimings, timed } from './timings';

export type Stage = 'consent' | 'idle' | 'recording' | 'decoding' | 'transcribing' | 'done' | 'error';
export type Consent = NonNullable<VisitRecord['consent']>;

interface VisitState {
  stage: Stage;
  consent: Consent | null;
  recordSeconds: number;
  level: number;
  record: VisitRecord | null;
  /** the recording is still in memory, so the worker can play parts of it */
  hasAudio: boolean;
  stats: { audioSeconds: number; ms: number; loadMs: number } | null;
  error: string | null;
  micProblem: MicProblem | null;
}

interface VisitApi extends VisitState {
  agree(mode: Consent['mode']): void;
  decline(): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  cancel(): void;
  /** forget this recording and note but keep the patient's consent, ready to record again */
  rerecord(): void;
  /** forget everything, including the consent: a new patient */
  reset(): void;
  transcribeFile(file: File): Promise<void>;
  /** developer helper: skip the audio and review a typed or pasted transcript */
  reviewText(text: string): void;
  edit(edits: Edit[]): void;
  lookRight(paths: string[]): void;
  notApplicable(paths: string[]): void;
  addMedicine(): string;
  removeMedicine(id: string): void;
  /** confirm, save it sealed with the PIN's key, create the tasks, and delete the recording */
  confirmAndSave(key: CryptoKey): Promise<void>;
  playSpan(t0: number, t1: number): void;
  playAll(): void;
  stopPlayback(): void;
}

const FRESH: VisitState = { stage: 'consent', consent: null, recordSeconds: 0, level: 0, record: null, hasAudio: false, stats: null, error: null, micProblem: null };

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function newRecord(transcript: Transcript, consent: Consent | null): VisitRecord {
  return { ...extractRecord(transcript, { visitDate: today(), id: crypto.randomUUID() }), consent };
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
  const [state, setState] = useState<VisitState>(FRESH);
  const recorder = useRef<Recorder | null>(null);
  const player = useRef<SpanPlayer | null>(null);
  const stopRef = useRef<() => Promise<void>>(async () => {});
  const recordRef = useRef<VisitRecord | null>(null);
  const consentRef = useRef<Consent | null>(null);
  recordRef.current = state.record;
  consentRef.current = state.consent;

  const patch = useCallback((next: Partial<VisitState>) => setState((s) => ({ ...s, ...next })), []);

  const dropAudio = useCallback(() => {
    player.current?.dispose();
    player.current = null;
  }, []);

  const clear = useCallback(
    (keepConsent: boolean) => {
      recorder.current?.cancel();
      recorder.current = null;
      dropAudio();
      const consent = keepConsent ? consentRef.current : null;
      setState({ ...FRESH, consent, stage: consent?.given ? 'idle' : 'consent' });
    },
    [dropAudio],
  );

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
        const filled = timed(() => newRecord(result.transcript, consentRef.current));
        recordTimings({ transcribeMs: result.ms, audioSeconds: result.audioSeconds, modelLoadMs: result.loadMs, extractMs: filled.ms, saveMs: null });
        patch({
          stage: 'done',
          record: filled.value,
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

  const agree = useCallback((mode: Consent['mode']) => {
    const consent: Consent = { given: true, at: new Date().toISOString(), mode };
    consentRef.current = consent;
    setState({ ...FRESH, consent, stage: 'idle' });
  }, []);

  // No consent means no recording: the worker fills the record in by hand.
  const decline = useCallback(() => {
    const consent: Consent = { given: false, at: new Date().toISOString(), mode: 'clip' };
    consentRef.current = consent;
    setState({ ...FRESH, consent, stage: 'done', record: blankRecord(today(), crypto.randomUUID(), consent) });
  }, []);

  const start = useCallback(async () => {
    if (!consentRef.current?.given) return;
    recorder.current?.cancel();
    dropAudio();
    const active = new Recorder();
    recorder.current = active;
    patch({ stage: 'recording', recordSeconds: 0, level: 0, error: null, micProblem: null });
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
  }, [dropAudio, patch]);

  const transcribeFile = useCallback(
    async (file: File) => {
      if (!consentRef.current?.given) agree('verbal');
      await process(() => decodeTo16kMono(file));
    },
    [agree, process],
  );

  const reviewText = useCallback(
    (text: string) => {
      const consent: Consent = consentRef.current?.given ? consentRef.current : { given: true, at: new Date().toISOString(), mode: 'verbal' };
      consentRef.current = consent;
      dropAudio();
      const filled = timed(() => newRecord(textToTranscript(text.trim()), consent));
      recordTimings({ transcribeMs: null, audioSeconds: null, modelLoadMs: null, extractMs: filled.ms, saveMs: null });
      setState({ ...FRESH, consent, stage: 'done', record: filled.value });
    },
    [dropAudio],
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

  const confirmAndSave = useCallback(
    async (key: CryptoKey) => {
      const current = recordRef.current;
      if (!current) return;
      const confirmed = confirmRecord(current);
      const saveStart = performance.now();
      await saveRecord(key, confirmed);
      for (const task of tasksFor(confirmed)) await saveTask(key, task);
      recordTimings({ saveMs: performance.now() - saveStart });
      // The recording is deleted the moment the record is confirmed and saved. It only ever existed in memory.
      dropAudio();
      setState((s) => ({ ...s, record: confirmed, hasAudio: false }));
    },
    [dropAudio],
  );

  const playSpan = useCallback((t0: number, t1: number) => player.current?.play(t0, t1), []);
  const playAll = useCallback(() => player.current?.play(), []);
  const stopPlayback = useCallback(() => player.current?.stop(), []);

  const rerecord = useCallback(() => clear(true), [clear]);
  const reset = useCallback(() => clear(false), [clear]);

  // Leaving the app must release the microphone and drop the audio.
  useEffect(() => reset, [reset]);

  const api = useMemo<VisitApi>(
    () => ({
      ...state,
      agree, decline, start, stop, cancel: rerecord, rerecord, reset, transcribeFile, reviewText,
      edit, lookRight, notApplicable, addMedicine, removeMedicine, confirmAndSave, playSpan, playAll, stopPlayback,
    }),
    [state, agree, decline, start, stop, rerecord, reset, transcribeFile, reviewText, edit, lookRight, notApplicable, addMedicine, removeMedicine, confirmAndSave, playSpan, playAll, stopPlayback],
  );
  return <VisitContext.Provider value={api}>{children}</VisitContext.Provider>;
}

export function useVisit(): VisitApi {
  const ctx = useContext(VisitContext);
  if (!ctx) throw new Error('useVisit must be used inside VisitProvider');
  return ctx;
}
