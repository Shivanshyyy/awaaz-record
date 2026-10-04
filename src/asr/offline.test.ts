import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadOne } from './offline';

const URL = '/models/big.onnx';
const body = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);
const file = { url: URL, bytes: body.length };
const noWait = async () => {};

interface Call {
  range: string | null;
}

// A response whose body delivers `part` and then fails the way a dropped connection does.
function dropping(part: Uint8Array<ArrayBuffer>, status = 200, headers: Record<string, string> = {}): Response {
  let sent = false;
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (sent) controller.error(new TypeError('network error'));
      else controller.enqueue(part);
      sent = true;
    },
  });
  return new Response(stream, { status, headers });
}

function whole(bytes: Uint8Array<ArrayBuffer>, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(bytes, { status, headers });
}

function serve(responses: ((call: Call) => Response)[]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const call = { range: new Headers(init?.headers).get('range') };
      calls.push(call);
      const next = responses[calls.length - 1];
      if (!next) throw new TypeError('no more responses planned');
      return next(call);
    }),
  );
  return calls;
}

function fakeCache() {
  const stored: { url: string; response: Response }[] = [];
  return { stored, cache: { put: async (url: string, response: Response) => void stored.push({ url, response }) } };
}

async function storedBytes(stored: { response: Response }[]): Promise<Uint8Array> {
  return new Uint8Array(await stored[0]!.response.arrayBuffer());
}

afterEach(() => vi.unstubAllGlobals());

describe('downloadOne', () => {
  it('stores a whole download in one go', async () => {
    const calls = serve([() => whole(body)]);
    const { cache, stored } = fakeCache();
    let counted = 0;
    await downloadOne(cache, file, (n) => (counted += n), noWait);
    expect(calls).toEqual([{ range: null }]);
    expect(counted).toBe(body.length);
    expect(await storedBytes(stored)).toEqual(body);
    expect(stored[0]!.response.headers.get('content-length')).toBe(String(body.length));
  });

  it('continues from the bytes it already has when the connection drops, and does not fetch them again', async () => {
    const calls = serve([() => dropping(body.slice(0, 400)), () => whole(body.slice(400), 206, { 'content-range': `bytes 400-999/1000` })]);
    const { cache, stored } = fakeCache();
    let counted = 0;
    await downloadOne(cache, file, (n) => (counted += n), noWait);
    expect(calls).toEqual([{ range: null }, { range: 'bytes=400-' }]);
    expect(counted).toBe(1000);
    expect(await storedBytes(stored)).toEqual(body);
  });

  it('keeps going through several drops as long as each brings new bytes', async () => {
    const calls = serve([
      () => dropping(body.slice(0, 100)),
      () => dropping(body.slice(100, 350), 206, { 'content-range': 'bytes 100-999/1000' }),
      () => dropping(body.slice(350, 360), 206, { 'content-range': 'bytes 350-999/1000' }),
      () => whole(body.slice(360), 206, { 'content-range': 'bytes 360-999/1000' }),
    ]);
    const { cache, stored } = fakeCache();
    await downloadOne(cache, file, () => {}, noWait);
    expect(calls.map((c) => c.range)).toEqual([null, 'bytes=100-', 'bytes=350-', 'bytes=360-']);
    expect(await storedBytes(stored)).toEqual(body);
  });

  it('starts that file again when the server ignores the range and sends everything', async () => {
    serve([() => dropping(body.slice(0, 300)), () => whole(body)]);
    const { cache, stored } = fakeCache();
    let counted = 0;
    await downloadOne(cache, file, (n) => (counted += n), noWait);
    expect(counted).toBe(body.length);
    expect(await storedBytes(stored)).toEqual(body);
  });

  it('starts again from zero when the server answers with the wrong part', async () => {
    const calls = serve([
      () => dropping(body.slice(0, 300)),
      () => whole(body.slice(100), 206, { 'content-range': 'bytes 100-999/1000' }),
      () => whole(body),
    ]);
    const { cache, stored } = fakeCache();
    let counted = 0;
    await downloadOne(cache, file, (n) => (counted += n), noWait);
    expect(calls.map((c) => c.range)).toEqual([null, 'bytes=300-', null]);
    expect(counted).toBe(body.length);
    expect(await storedBytes(stored)).toEqual(body);
  });

  it('never stores a short file: three attempts in a row with no new bytes end in an error', async () => {
    const calls = serve([() => whole(body.slice(0, 500)), () => new Response('x', { status: 503 }), () => new Response('x', { status: 503 }), () => new Response('x', { status: 503 })]);
    const { cache, stored } = fakeCache();
    await expect(downloadOne(cache, file, () => {}, noWait)).rejects.toThrow(/HTTP 503/);
    expect(calls).toHaveLength(4);
    expect(stored).toEqual([]);
  });

  it('waits a little longer after each attempt that gets nothing', async () => {
    serve([() => new Response('x', { status: 500 }), () => new Response('x', { status: 500 }), () => whole(body)]);
    const waits: number[] = [];
    await downloadOne(fakeCache().cache, file, () => {}, async (ms) => void waits.push(ms));
    expect(waits).toEqual([1000, 2000]);
  });
});
