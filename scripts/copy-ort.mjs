#!/usr/bin/env node
// Copies the ONNX Runtime web files Transformers.js needs into public/ort/, so nothing is loaded from a CDN at runtime.
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'node_modules', '@huggingface', 'transformers', 'dist');
const OUT = path.join(ROOT, 'public', 'ort');
const FILES = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];

mkdirSync(OUT, { recursive: true });
const files = FILES.map((name) => {
  copyFileSync(path.join(SRC, name), path.join(OUT, name));
  return { path: name, bytes: statSync(path.join(OUT, name)).size };
});

const ort = JSON.parse(readFileSync(path.join(ROOT, 'node_modules', 'onnxruntime-web', 'package.json'), 'utf8'));
const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ onnxruntimeWeb: ort.version, totalBytes, files }, null, 2));
console.log(`copied ONNX Runtime ${ort.version} files to public/ort/ (${(totalBytes / 1e6).toFixed(1)} MB)`);
