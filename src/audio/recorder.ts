export const MAX_RECORD_SECONDS = 90;

export type MicProblem = 'denied' | 'unsupported' | 'no-mic' | 'error';

export class MicError extends Error {
  constructor(
    readonly problem: MicProblem,
    message: string,
  ) {
    super(message);
  }
}

export interface RecordingResult {
  blob: Blob;
  seconds: number;
}

export interface RecorderHandlers {
  onTick(seconds: number): void;
  /** 0 to 1, for the level meter */
  onLevel(level: number): void;
  /** the 90 s cap was reached; the caller should stop the recording */
  onLimit(): void;
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export const MIC_HELP: Record<MicProblem, string> = {
  denied: 'The microphone is blocked. Open this site’s settings in the browser, allow the microphone, then tap Try again.',
  unsupported: 'This browser cannot record audio. Please use Chrome on an Android phone.',
  'no-mic': 'No microphone was found on this device.',
  error: 'The microphone could not be started. Close other apps that use it, then tap Try again.',
};

export function canRecord(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
}

export class Recorder {
  private stream: MediaStream | null = null;
  private media: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private chunks: Blob[] = [];
  private timer: number | null = null;
  private startedAt = 0;
  private limitReported = false;

  async start(handlers: RecorderHandlers): Promise<void> {
    if (!canRecord()) throw new MicError('unsupported', MIC_HELP.unsupported);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicError('denied', MIC_HELP.denied);
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new MicError('no-mic', MIC_HELP['no-mic']);
      throw new MicError('error', MIC_HELP.error);
    }

    const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
    this.media = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.limitReported = false;
    this.media.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };

    this.audioContext = new AudioContext();
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 1024;
    this.audioContext.createMediaStreamSource(this.stream).connect(analyser);
    const frame = new Float32Array(analyser.fftSize);

    this.startedAt = performance.now();
    this.media.start(1000);
    this.timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(frame);
      let sum = 0;
      for (const v of frame) sum += v * v;
      handlers.onLevel(Math.min(1, Math.sqrt(sum / frame.length) * 6));
      const seconds = (performance.now() - this.startedAt) / 1000;
      handlers.onTick(seconds);
      if (seconds >= MAX_RECORD_SECONDS && !this.limitReported) {
        this.limitReported = true;
        handlers.onLimit();
      }
    }, 100);
  }

  stop(): Promise<RecordingResult> {
    const media = this.media;
    if (!media) return Promise.reject(new Error('Not recording.'));
    return new Promise((resolve) => {
      media.onstop = () => {
        const seconds = Math.min((performance.now() - this.startedAt) / 1000, MAX_RECORD_SECONDS);
        const blob = new Blob(this.chunks, { type: media.mimeType });
        this.release();
        resolve({ blob, seconds });
      };
      if (media.state === 'inactive') media.onstop(new Event('stop'));
      else media.stop();
    });
  }

  cancel(): void {
    if (this.media && this.media.state !== 'inactive') {
      this.media.onstop = null;
      this.media.stop();
    }
    this.release();
  }

  private release(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.audioContext?.close();
    this.stream = null;
    this.media = null;
    this.audioContext = null;
    this.chunks = [];
  }
}
