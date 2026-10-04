import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLIPS } from './clips';

const DIR = path.resolve('public/audio/hi');
const manifest = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8')) as { clips: Record<string, { bytes: number }> };

describe('public/audio/hi/manifest.json', () => {
  it('lists a file for every one of the 23 clips and for nothing else', () => {
    expect(CLIPS).toHaveLength(23);
    expect(Object.keys(manifest.clips).sort()).toEqual(CLIPS.map((c) => c.id).sort());
  });

  it('gives each file’s real size, and each file is an mp3', () => {
    for (const id of Object.keys(manifest.clips)) {
      const file = path.join(DIR, `${id}.mp3`);
      expect(existsSync(file), `${id}.mp3 is missing`).toBe(true);
      expect(statSync(file).size, `${id}.mp3 size`).toBe(manifest.clips[id]!.bytes);
      const head = readFileSync(file).subarray(0, 3);
      const isMp3 = (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) || (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0);
      expect(isMp3, `${id}.mp3 does not start like an mp3`).toBe(true);
    }
  });
});
