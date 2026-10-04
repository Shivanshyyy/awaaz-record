import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addNetCounts, bodyBytes, getNetCounts, installNetMeter, measureRequest, subscribeNet, type NetCounts } from './netmeter';

beforeEach(() => {
  vi.stubGlobal('self', { location: { href: 'https://clinic.example/app/', origin: 'https://clinic.example' } });
});

describe('bodyBytes', () => {
  it('counts the bytes of each kind of body', () => {
    expect(bodyBytes(null)).toBe(0);
    expect(bodyBytes(undefined)).toBe(0);
    expect(bodyBytes('abc')).toBe(3);
    expect(bodyBytes('नूर')).toBe(9);
    expect(bodyBytes(new Blob(['12345']))).toBe(5);
    expect(bodyBytes(new ArrayBuffer(16))).toBe(16);
    expect(bodyBytes(new Float32Array(4))).toBe(16);
    expect(bodyBytes(new URLSearchParams({ a: 'b' }))).toBe(3);
    const form = new FormData();
    form.set('k', 'vv');
    expect(bodyBytes(form)).toBe(3);
  });
});

describe('measureRequest', () => {
  it('counts the body plus the query string and tells apart our own server from another one', () => {
    expect(measureRequest('/models/a.onnx', null)).toEqual({ bytesSent: 0, requests: 1, otherServers: 0 });
    expect(measureRequest('https://clinic.example/x?name=Noor', 'abcd')).toEqual({ bytesSent: 4 + '?name=Noor'.length, requests: 1, otherServers: 0 });
    expect(measureRequest('https://elsewhere.example/upload', 'abcd')).toEqual({ bytesSent: 4, requests: 1, otherServers: 1 });
  });
});

describe('installNetMeter', () => {
  it('reports every fetch to the counter, passes it on unchanged, and installs only once', async () => {
    const seen: NetCounts[] = [];
    const real = vi.fn(async () => new Response('ok'));
    const scope = { fetch: real as unknown as typeof fetch };
    installNetMeter((delta) => seen.push(delta), scope);
    installNetMeter((delta) => seen.push(delta), scope);

    await scope.fetch('/manifest.json');
    await scope.fetch('https://elsewhere.example/api', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    await scope.fetch(new Request('https://clinic.example/save', { method: 'POST', body: 'hello' }));

    expect(real).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([
      { bytesSent: 0, requests: 1, otherServers: 0 },
      { bytesSent: 7, requests: 1, otherServers: 1 },
      { bytesSent: 5, requests: 1, otherServers: 0 },
    ]);
  });

  it('reports a beacon', () => {
    const seen: NetCounts[] = [];
    const sendBeacon = vi.fn(() => true);
    const scope = { navigator: { sendBeacon } as unknown as Navigator };
    installNetMeter((delta) => seen.push(delta), scope);
    scope.navigator.sendBeacon('https://elsewhere.example/b', 'xyz');
    expect(sendBeacon).toHaveBeenCalledWith('https://elsewhere.example/b', 'xyz');
    expect(seen).toEqual([{ bytesSent: 3, requests: 1, otherServers: 1 }]);
  });
});

describe('the counter', () => {
  it('adds up and tells subscribers', () => {
    const before = getNetCounts();
    const listener = vi.fn();
    const stop = subscribeNet(listener);
    addNetCounts({ bytesSent: 10, requests: 1, otherServers: 0 });
    stop();
    addNetCounts({ bytesSent: 5, requests: 1, otherServers: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getNetCounts()).toEqual({ bytesSent: before.bytesSent + 15, requests: before.requests + 2, otherServers: before.otherServers + 1 });
  });
});
