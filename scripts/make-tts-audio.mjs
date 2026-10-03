#!/usr/bin/env node
// Turns each script in eval/scripts.json into speech with the operating system's own voice.
// The result is TTS-synthetic: good for checking the pipeline, never an accuracy claim about real speech.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import wavefile from 'wavefile';

const { WaveFile } = wavefile;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'eval', 'tts');
const NOISE_SNR_DB = 10;
const PREFERRED_MAC_VOICES = ['Tara', 'Rishi', 'Aman'];

const voiceArg = process.argv.indexOf('--voice');
const requestedVoice = voiceArg > -1 ? process.argv[voiceArg + 1] : process.env.TTS_VOICE;

const scripts = JSON.parse(readFileSync(path.join(ROOT, 'eval', 'scripts.json'), 'utf8')).scripts;
mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(path.join(tmpdir(), 'awaaz-tts-'));

function macVoice() {
  if (requestedVoice) return requestedVoice;
  const installed = execFileSync('say', ['-v', '?'], { encoding: 'utf8' });
  return PREFERRED_MAC_VOICES.find((name) => new RegExp(`^${name}\\s`, 'm').test(installed)) ?? null;
}

function synthesize(text, rawOut, voice) {
  const textFile = path.join(work, 'script.txt');
  writeFileSync(textFile, text);
  if (process.platform === 'darwin') {
    execFileSync('say', [...(voice ? ['-v', voice] : []), '-o', rawOut, '-f', textFile]);
  } else if (process.platform === 'win32') {
    const command =
      'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
      '$s.SetOutputToWaveFile($env:TTS_OUT); $s.Speak([IO.File]::ReadAllText($env:TTS_IN)); $s.Dispose()';
    execFileSync('powershell', ['-NoProfile', '-Command', command], { env: { ...process.env, TTS_IN: textFile, TTS_OUT: rawOut } });
  } else {
    execFileSync('espeak-ng', ['-w', rawOut, '-f', textFile]);
  }
}

function toWav16kMono(input, output) {
  execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', output]);
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Low-passed noise with a little hiss, a rough stand-in for a fan or a TV in the next room.
function addNoise(cleanPath, noisyPath, seed) {
  const wav = new WaveFile(readFileSync(cleanPath));
  wav.toBitDepth('32f');
  const samples = Float64Array.from(wav.getSamples());
  const speechRms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
  const random = mulberry32(seed);
  const noise = new Float64Array(samples.length);
  let low = 0;
  for (let i = 0; i < noise.length; i++) {
    const white = random() * 2 - 1;
    low += 0.08 * (white - low);
    noise[i] = low * 3 + white * 0.25;
  }
  const noiseRms = Math.sqrt(noise.reduce((sum, v) => sum + v * v, 0) / noise.length);
  const gain = speechRms / Math.pow(10, NOISE_SNR_DB / 20) / noiseRms;
  const mixed = samples.map((v, i) => Math.max(-1, Math.min(1, v + noise[i] * gain)));
  const out = new WaveFile();
  out.fromScratch(1, 16000, '32f', mixed);
  out.toBitDepth('16');
  writeFileSync(noisyPath, out.toBuffer());
}

function seconds(file) {
  const wav = new WaveFile(readFileSync(file));
  return wav.getSamples().length / wav.fmt.sampleRate;
}

let voice = null;
try {
  if (process.platform === 'darwin') voice = macVoice();
  const files = [];
  for (const script of scripts) {
    const raw = path.join(work, `${script.id}.raw`);
    const wavPath = path.join(OUT, `${script.id}.wav`);
    synthesize(script.text, raw, voice);
    toWav16kMono(raw, wavPath);
    files.push({ id: script.id, seconds: Number(seconds(wavPath).toFixed(1)), noise: false });
    console.log(`${script.id}.wav  ${seconds(wavPath).toFixed(1)} s`);

    if (script.noisyVariant) {
      const noisyPath = path.join(OUT, `${script.id}_noisy.wav`);
      addNoise(wavPath, noisyPath, 1000 + Number(script.id.slice(1)));
      files.push({ id: `${script.id}_noisy`, seconds: Number(seconds(noisyPath).toFixed(1)), noise: true });
      console.log(`${script.id}_noisy.wav  (synthetic noise, ${NOISE_SNR_DB} dB signal-to-noise)`);
    }
  }
  writeFileSync(
    path.join(OUT, 'manifest.json'),
    JSON.stringify(
      {
        kind: 'TTS-synthetic',
        note: 'Speech from the operating system voice, plus synthetic noise for the _noisy files. A pipeline check only, not real speech.',
        platform: process.platform,
        voice: voice ?? 'system default',
        noiseSnrDb: NOISE_SNR_DB,
        generatedAt: new Date().toISOString(),
        files,
      },
      null,
      2,
    ),
  );
  console.log(`\n${files.length} files in eval/tts/ (voice: ${voice ?? 'system default'}, TTS-synthetic)`);
} catch (error) {
  console.error(
    `Could not synthesize speech: ${error.message}\n` +
      'macOS needs the built-in `say`, Windows needs System.Speech, Linux needs espeak-ng. ' +
      'Without a voice, put one public-domain English speech sample in eval/tts/ for smoke tests and note it in docs/DECISIONS.md.',
  );
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
