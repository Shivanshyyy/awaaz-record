#!/usr/bin/env node
// Checks a deployed copy of the app (default: the GitHub Pages address) without downloading the 66 MB:
// the page, the web manifest, the service worker, and every model and runtime file the offline mode saves,
// each asked for one byte to confirm it exists, has the size its manifest promises, and can be fetched in parts.
//   npm run check-live
//   npm run check-live -- http://localhost:4173/
const base = (process.argv[2] ?? 'https://shivanshyyy.github.io/awaaz-record/').replace(/\/?$/, '/');
const results = [];
const record = (ok, what, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
};

async function get(path, init) {
  try {
    return await fetch(new URL(path, base), { redirect: 'follow', ...init });
  } catch (error) {
    return { ok: false, status: 0, headers: new Headers(), error };
  }
}

console.log(`Checking ${base}\n`);

const page = await get('');
const html = page.ok ? await page.text() : '';
record(page.status === 200 && /Awaaz Record/.test(html), 'the page loads', `HTTP ${page.status}`);

const manifestUrl = /<link rel="manifest" href="([^"]+)"/.exec(html)?.[1] ?? 'manifest.webmanifest';
const web = await get(manifestUrl);
const webManifest = web.ok ? await web.json().catch(() => null) : null;
record(webManifest?.name === 'Awaaz Record' && webManifest?.display === 'standalone', 'the web manifest says it is an installable app', `HTTP ${web.status}`);
record(webManifest?.start_url === new URL(base).pathname, 'its start page is this address', webManifest?.start_url ?? 'missing');

const worker = await get('sw.js');
record(worker.status === 200 && /javascript/.test(worker.headers.get('content-type') ?? ''), 'the offline worker (sw.js) is served as JavaScript', `HTTP ${worker.status}`);

let compressed = 0;
let checkedFiles = 0;
let partsWork = true;
for (const manifestPath of ['models/manifest.json', 'ort/manifest.json']) {
  const res = await get(manifestPath);
  const manifest = res.ok ? await res.json().catch(() => null) : null;
  record(Boolean(manifest?.files?.length), `${manifestPath} lists its files`, `HTTP ${res.status}`);
  const dir = manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1);
  for (const file of manifest?.files ?? []) {
    // One byte is enough to learn the total size from Content-Range, and shows the host can serve parts.
    const one = await get(`${dir}${file.path}`, { headers: { Range: 'bytes=0-0' } });
    checkedFiles++;
    const total = Number(/\/(\d+)$/.exec(one.headers.get('content-range') ?? '')?.[1] ?? one.headers.get('content-length'));
    const encoding = one.headers.get('content-encoding');
    if (encoding && encoding !== 'identity') compressed++;
    if (one.status !== 206) partsWork = false;
    // A compressed response reports the compressed size, so only existence can be checked from the headers.
    const sizeKnown = !encoding || encoding === 'identity';
    record((one.status === 206 || one.status === 200) && (!sizeKnown || total === file.bytes), `${dir}${file.path}`, `${file.bytes} bytes${one.status === 206 ? ', ranges work' : ', no ranges'}${encoding ? `, content-encoding ${encoding}` : ''}`);
  }
}

console.log('');
if (checkedFiles) console.log(partsWork ? 'The host serves parts of files, so a dropped download can continue.' : 'The host did not serve parts of some files: a dropped download will start that file again.');
if (compressed) console.log(`${compressed} file(s) are sent compressed; the app checks sizes after unpacking, so this is fine.`);

const failed = results.filter((ok) => !ok).length;
console.log(`\n${failed === 0 ? 'All checks passed.' : `${failed} check(s) failed.`}`);
process.exit(failed === 0 ? 0 : 1);
