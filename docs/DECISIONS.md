# Decisions

One line each: what was decided, and why. Newest at the bottom of each section.

## Setup and environment
- Repo root is `awaaz-record-kit/` (it holds CLAUDE.md, docs/, eval/, .claude/); `ps.pdf` sits one level up in `awaaz_records/` — the kit folder was unzipped inside it.
- A copy of `ps.pdf` is kept in the repo folder but git-ignored: every page footer says "Official Use Only", so it must not be redistributed in a public repo.
- Added a 4-line pointer `CLAUDE.md` in `awaaz_records/` (outside the repo, new file, nothing overwritten) so a session started from the parent folder finds the project.
- Your own `caffeinate -dims` was already running; I added a second one with a 12 h timeout as a backup so the Mac cannot sleep mid-run.
- No global git identity exists on this machine, so commits use a repo-local identity (Shivansh, from the account email); nothing global was changed.

## Stack versions
- Pinned the majors CLAUDE.md names and I can verify, not the newest ones on npm: Vite 7, @vitejs/plugin-react 5, vite-plugin-pwa 1, Vitest 3, TypeScript 5.9, @huggingface/transformers 3.8 (CLAUDE.md says v3; v4 exists). One tested stack beats the newest one.
- Tailwind 4 through `@tailwindcss/vite` (one plugin, no PostCSS config).

## Dependencies (one line each, as CLAUDE.md requires)
- react, react-dom — UI. @huggingface/transformers — Whisper on the device. idb — IndexedDB wrapper. qrcode — slip QR code.
- vite, @vitejs/plugin-react, typescript, tailwindcss, @tailwindcss/vite, vite-plugin-pwa, workbox-window — build, styling, PWA (stack list).
- vitest — unit tests. @playwright/test — browser tests. ffmpeg-static — audio conversion in scripts. wavefile — read/write WAV in scripts and tests. jsqr — decode the slip QR in a test.
- fake-indexeddb (dev) — Node has no IndexedDB, so the storage unit tests need it. Not in the original stack list.
- @types/node, @types/react, @types/react-dom, @types/qrcode — typings.

## Speech model
- Whisper tiny.en from `Xenova/whisper-tiny.en`, q8 files only (encoder 10.1 MB + merged decoder 30.7 MB + tokenizer/config); total 44,497,724 bytes (44.5 MB). Checked in Node before fixing the choice: `return_timestamps: 'word'` works with this export and gives a start/end for every word, so no fallback to chunk timestamps is needed.
- Revision pinned to `79fb389f…` in `scripts/fetch-models.mjs` (and sha256 checked for the two ONNX files) so builds and eval runs always use the same weights. Model card license: apache-2.0 (from the Hugging Face API, 4 Oct 2026).
- Model files are fetched at build time (CI runs `npm run fetch-models`) and are git-ignored; they are served from our own origin under `/awaaz-record/models/`.

## Tooling
- PWA icons are drawn from one SVG and rendered to PNG by `scripts/make-icons.mjs` with the Chromium Playwright already installs (no image library needed). The PNGs are committed.
- Playwright writes screenshots only with `npm run e2e:shots`, so normal runs don't change tracked PNGs.
- The service worker precaches the app shell only (~270 KiB). Model and runtime files are excluded from precache and handled by the "Prepare offline mode" step in Phase 1, so a failed 44 MB download can't break service-worker install.
