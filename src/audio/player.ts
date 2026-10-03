import { SAMPLE_RATE, type Samples } from './level';

// Plays parts of the recording from memory; the audio is never written anywhere.
export class SpanPlayer {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;

  constructor(private readonly samples: Samples) {}

  get seconds(): number {
    return this.samples.length / SAMPLE_RATE;
  }

  play(t0 = 0, t1 = this.seconds): void {
    this.stop();
    const context = (this.context ??= new AudioContext());
    void context.resume();
    if (!this.buffer) {
      this.buffer = context.createBuffer(1, this.samples.length, SAMPLE_RATE);
      this.buffer.copyToChannel(this.samples, 0);
    }
    const start = Math.max(0, t0);
    const end = Math.min(this.seconds, Math.max(t1, start + 0.1));
    const source = context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(context.destination);
    source.onended = () => {
      if (this.source === source) this.source = null;
    };
    source.start(0, start, end - start);
    this.source = source;
  }

  stop(): void {
    try {
      this.source?.stop();
    } catch {
      // already ended
    }
    this.source = null;
  }

  dispose(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
    this.buffer = null;
  }
}
