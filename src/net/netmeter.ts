// Counts what this app hands to the network: request bodies and query strings of fetch, XMLHttpRequest and sendBeacon,
// in the page and in the speech worker. Protocol headers, the first page load and the service worker's own fetches are
// not counted. Streams are not counted either (the app never uploads one).
export interface NetCounts {
  bytesSent: number;
  requests: number;
  otherServers: number;
}

let counts: NetCounts = { bytesSent: 0, requests: 0, otherServers: 0 };
const listeners = new Set<() => void>();

export const getNetCounts = (): NetCounts => counts;

export function subscribeNet(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addNetCounts(delta: NetCounts) {
  counts = {
    bytesSent: counts.bytesSent + delta.bytesSent,
    requests: counts.requests + delta.requests,
    otherServers: counts.otherServers + delta.otherServers,
  };
  listeners.forEach((listener) => listener());
}

const utf8 = (text: string) => new TextEncoder().encode(text).length;

export function bodyBytes(body: unknown): number {
  if (body == null) return 0;
  if (typeof body === 'string') return utf8(body);
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (body instanceof URLSearchParams) return utf8(body.toString());
  if (body instanceof FormData) {
    let total = 0;
    for (const [key, value] of body.entries()) total += utf8(key) + (typeof value === 'string' ? utf8(value) : value.size);
    return total;
  }
  return 0;
}

export function measureRequest(url: string | URL, body: unknown): NetCounts {
  let query = 0;
  let otherServers = 0;
  try {
    const parsed = new URL(String(url), self.location.href);
    query = parsed.search.length;
    otherServers = parsed.origin === self.location.origin ? 0 : 1;
  } catch {
    // an address the browser cannot parse is counted by its body only
  }
  return { bytesSent: bodyBytes(body) + query, requests: 1, otherServers };
}

type Report = (delta: NetCounts) => void;
type Patchable = {
  fetch?: typeof fetch;
  XMLHttpRequest?: typeof XMLHttpRequest;
  navigator?: Navigator;
  __netMeter?: boolean;
};

export function installNetMeter(report: Report, scope: Patchable = globalThis as Patchable) {
  if (scope.__netMeter) return;
  scope.__netMeter = true;

  const realFetch = scope.fetch?.bind(scope);
  if (realFetch) {
    scope.fetch = async (input, init) => {
      let body: unknown = init?.body;
      const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
      if (body === undefined && request && request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.clone().arrayBuffer().catch(() => null);
      }
      report(measureRequest(request ? request.url : (input as string | URL), body));
      return realFetch(input, init);
    };
  }

  const proto = scope.XMLHttpRequest?.prototype as (XMLHttpRequest & { __url?: string }) | undefined;
  if (proto) {
    const open = proto.open;
    const send = proto.send;
    proto.open = function (this: XMLHttpRequest & { __url?: string }, method: string, url: string | URL, ...rest: unknown[]) {
      this.__url = String(url);
      return (open as (...args: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof proto.open;
    proto.send = function (this: XMLHttpRequest & { __url?: string }, body?: Document | XMLHttpRequestBodyInit | null) {
      report(measureRequest(this.__url ?? '', body));
      return send.call(this, body);
    };
  }

  const nav = scope.navigator;
  if (nav && typeof nav.sendBeacon === 'function') {
    const realBeacon = nav.sendBeacon.bind(nav);
    nav.sendBeacon = (url, data) => {
      report(measureRequest(url, data));
      return realBeacon(url, data);
    };
  }
}
