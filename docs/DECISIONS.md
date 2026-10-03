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

## Phase 1 (offline speech)
- Tests replace `getUserMedia` with a Web Audio stream that plays the TTS WAV in real time (`e2e/fake-mic.ts`). Chromium's own fake microphone (`--use-fake-device-for-media-stream`, with or without a file) hangs on this Mac even with no file at all, probably the macOS microphone privacy prompt. The recorder, decoding, worker and UI still run for real; only the stream source is faked. The real microphone is on the WHEN YOU WAKE UP list.
- The service worker only reads the offline cache (`cacheableResponse: { statuses: [-1] }`); "Prepare offline mode" is the only writer. With two writers, Workbox's copy sometimes replaced ours with different headers and the "ready" check failed intermittently.
- "Ready offline" is shown only after every model and runtime file is found in Cache Storage with the right size and the service worker controls the page. Nothing is assumed.
- Service worker updates are `prompt`, not automatic: a deploy must not reload the page and lose a recording that only exists in memory. The worker sees an "Update now" banner.
- ONNX Runtime: the `jsep` wasm (21.6 MB) that Transformers.js 3.8.1 ships, copied to `public/ort/` by `scripts/copy-ort.mjs` and loaded from our origin, single-threaded (GitHub Pages cannot send the headers that threads need). Vite also emitted a second copy of that wasm into `assets/`; a tiny plugin removes it (deployment 87 MB → 66 MB).
- Offline download total is 66.1 MB (44.5 MB model + 21.6 MB runtime). The app shell adds about 1.1 MB.
- Audio is kept only as decoded 16 kHz samples in memory (never IndexedDB or Cache Storage) and is dropped on reset or when the app closes. Phase 3 deletes it at confirm.
- A recording with no speech-level audio is refused before it reaches Whisper (it invents words from silence).
- No lexicon "prompting" of Whisper: it would turn garbled drug names into plausible wrong ones instead of leaving them visibly wrong. The extractor flags uncertain names instead.
- The upload-a-file helper shows only in dev builds or with `?dev=1`.
- TTS test audio uses the macOS Indian-English voice "Tara" (`say`), 16 kHz mono, plus synthetic low-pass noise at 10 dB for the three scripts the kit marks as noisy. All of it is labelled TTS-synthetic.

## Phase 2 (extraction and review)
- All missing-detail, missing-required and out-of-range flags are derived in one place (`evaluate` in `src/record/completeness.ts`) from the current values, so they clear when the worker edits. The extractor only raises flags about what it heard (unclear, snapped, corrected, unit inferred, conflict). A missing dose is amber (MISSING_DETAIL, as in CLAUDE.md); red is only for a required item that is wholly absent (name, complaint, follow-up, any treatment, a medicine's name).
- An amber item with no value cannot be cleared with "Looks right" (there is nothing to look at). It needs a value or "Not applicable" (dose, how often, how long).
- A garbled medicine name next to a dose is snapped to the closest drug by consonant skeleton (distance 1 to 2) and flagged NAME_SNAPPED; two candidates → value left empty, both listed. A name that matches nothing, or a dose with no name, stays an empty "which medicine was it?" row. Names under 4 consonants (zinc, ORS) are never snapped: too short to match safely.
- Names and ages stay "OK" when extracted (no confidence signal exists to say otherwise) and the eval reports how many wrong values were not flagged. Forcing an identity tap on every record was considered and rejected for now: rubber-stamping would remove the safety it adds. The mitigation is a one-tap "Hear it" on those two rows.
- No lexicon prompt for Whisper, and no `no_repeat_ngram_size`: a legitimate repeated phrase ("twice a day after food for five days", said twice) must survive. Loops are cut afterwards by `findLoop` instead.
- Weekday follow-up is always the next such day after the visit; the same weekday as today means a week later. "Tomorrow" = 1 day, "next week" = 7, "next month" = 30. "Since morning" and "since today" = 0 days, "since yesterday" and "since last night" = 1.
- "Evening" is not mapped to morning, afternoon or night (it is none of them): it raises an UNCLEAR question.
- Age given in months is stored as fractional years and flagged UNCLEAR; the schema has only `ageYears`.
- A spoken correction between two medicines keeps both and flags both; the worker removes the wrong one. For a vital sign the later value wins and is flagged. Silent replacement never happens.
- Advice `other` holds the worker's own words after "advised …", verbatim, only when no known advice tag sits in that clause.
- Clause boundaries (comma as well as full stop) bound referral, follow-up and advice, because Whisper often writes a whole note with commas and no full stops. Medicine segments end at the next medicine, a section word (advised, referred, review, BP …) or a sentence end.
- Dev helper `?dev=1` also has a paste-a-transcript box; it builds a record from text with no audio, so the review can be tested deterministically.
- Confirm lives in a sticky bar above the tab bar so it is always reachable on a long record. The record stays in memory in Phase 2; Phase 3 saves it.
- `scripts/eval.mjs` loads the TypeScript extractor through Vite's SSR loader, so the eval and the app use the same code. It runs Whisper in Node (onnxruntime-node), not the browser's WASM; the two give slightly different transcripts for the same audio, and the browser path adds Opus compression, so real in-app accuracy may differ.
