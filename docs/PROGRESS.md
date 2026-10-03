# Awaaz Record — progress
**Building:** an offline phone web app (PWA) for a clinic health worker: she speaks a 20–60 s English visit note, Whisper tiny.en transcribes it on the phone, a fixed-schema record fills in with every value linked to the words it came from, she resolves the flags and confirms, it is saved encrypted, and the patient gets a slip (QR + timing icons) plus Hindi clips. Health track, ps.pdf Annex A.
**Riskiest:** (1) Whisper tiny.en fully offline in the browser: ONNX wasm + model served from our own origin, cached by a service worker, word timestamps from the q8 export. (2) Extraction quality on tiny.en transcripts (drug names, spoken numbers) without ever generating text. (3) Everything I cannot verify alone tonight: real voices, a real phone, Hindi audio and its review, GitHub sign-in and Pages. Tonight's audio is TTS-synthetic, so no accuracy claims.
**Plan vs ps.pdf** (pp.7, 10–11, 13–15): no hard conflict found. Four things to handle:
- p.8 scores "what your data does not cover", so it gets its own README section; p.11 puts "Clarity, design and inclusivity" and "Value proposition for AI" in one 15% row, so cover both.
- p.13 warns about patient data crossing networks: Phase 3 "Send" is a local mock that makes no network request.
- p.7 asks for model files small enough for a weak connection: say plainly that the one-time download is tens of MB; Hindi is playback only (no Hindi AI).
- ps.pdf gives dates only (3–4 Oct), not the 16:39 IST deadline written in CLAUDE.md: confirm it on the portal.

## WHEN YOU WAKE UP
_(filled in as the night goes on; each item has exact steps)_

1. **Where to run Claude Code.** The project is the folder `~/Desktop/awaaz_records/awaaz-record-kit/` (that is the git repo). Tonight's session was started one level up, so CLAUDE.md and `.claude/settings.json` were not auto-loaded. To resume: `cd ~/Desktop/awaaz_records/awaaz-record-kit && claude`, then paste Prompt 2.
2. **Turn on GitHub Pages (needed for the live URL).** Open https://github.com/Shivanshyyy/awaaz-record → *Settings* → *Pages* → under "Build and deployment" set *Source* to **GitHub Actions**. The repo is already public (checked). Then *Actions* tab → "Deploy to GitHub Pages" → *Run workflow* (or push any commit). The site should appear at https://shivanshyyy.github.io/awaaz-record/ (not verified yet).
3. **Optional security tidy-up.** While checking whether git could push, I ran the macOS keychain credential helper and its output printed the stored GitHub OAuth token once into tonight's session log. It is not in any file or commit. If you want to be safe: revoke it at https://github.com/settings/applications (Authorized OAuth Apps) and sign in again when you next push.
4. **Try it on your phone (needs step 2 so the site is live).** On an Android phone in Chrome, open https://shivanshyyy.github.io/awaaz-record/ · tap **Set up offline** (top right) → **Download now** (66 MB, use Wi-Fi) → wait for **Ready offline** · switch on airplane mode · close the app and open it again · **New visit** → **Start recording** → allow the microphone → read one script from `docs/RECORDINGS.md` → **Stop**. Note how long the transcript took and what it says, and tell me. Tests tonight could not use a real microphone or a phone.
5. **If a macOS dialog about microphone access for Chromium or Playwright is on screen**, click *Don't Allow*. The tests don't need the real microphone.

## Status
| Phase | State |
|---|---|
| 0 Setup | **done** 03:42 IST |
| 1 Offline speech | **done** 04:02 IST |
| 2 Extraction + review | in progress (started 04:05 IST) |
| 3 Record, privacy, patient | not started |
| 4 Evaluation | not started |
| 5 Polish, deploy, docs | not started |

## Log

### Phase 0 — Setup · plan (03:33 IST)
1. Docs + git: DECISIONS.md, `git init -b main`, remote, .gitignore (ps.pdf stays out of git), repo-local commit identity.
2. Hand-scaffold Vite 7 + React 19 + TypeScript strict + Tailwind 4 + vite-plugin-pwa (base `/awaaz-record/`), generated icons, 4-tab shell with placeholder screens.
3. `scripts/fetch-models.mjs` (Whisper tiny.en q8 + config files, sha256-checked, prints total size) and the GitHub Pages deploy workflow.
4. Checks: `npm run build`, `npm test` (smoke), Playwright 360 px screenshot saved to `docs/screens/`, model folder git-ignored and < 100 MB.
5. Commit `phase 0: …`, push once; if it fails, add it to WHEN YOU WAKE UP and keep committing locally.

**Phase 0 result (03:42 IST)**
- `npm run build` and `npm test` pass (1 smoke test); typecheck clean.
- Playwright (`npm run e2e`, 2 tests) passes: shell fits 360 px with four tabs ≥ 48 px, every tab opens, no sideways scroll, and the shell reloads with the network off. Screenshots: `docs/screens/00-today.png` … `03-tasks.png`.
- Model files in `public/models/`: 44,497,724 bytes = 44.5 MB (42.4 MiB), sha256-checked, git-ignored. Under the 100 MB budget.
- Whisper tiny.en q8 with word timestamps verified in Node first: a 12.3 s TTS clip transcribed in 0.41 s on this machine (Apple M5 Pro) — a Node figure, not a phone figure.
- Pushed to `origin/main` (commit `c4b7eb6`), workflow file included. The repo is already public (checked with the public GitHub API); `has_pages` is false, so only the Pages switch in WHEN YOU WAKE UP item 2 is left.

### Phase 1 — Offline speech · plan (03:42 IST)
1. ASR in a Web Worker (`src/asr/`): Transformers.js with `allowRemoteModels=false`, models from `/awaaz-record/models/`, ONNX runtime `.mjs`/`.wasm` copied to `/awaaz-record/ort/` at build; word timestamps; progress events.
2. Audio (`src/audio/`): MediaRecorder with permission states, 90 s cap, timer, level meter, stop/redo; decode to 16 kHz mono Float32; silence check so Whisper never runs on an empty recording.
3. Offline: service-worker CacheFirst route for models + ort; "Prepare offline mode" screen (progress, size, storage persist) that only says "Ready offline ✓" after checking the cache contents; transcript view where a tapped word plays its audio span; `?dev=1` upload helper.
4. Test audio: `npm run tts-audio` (macOS `say`, Indian-English voice, 16 kHz mono, S01–S10 + synthetic-noise variants → `eval/tts/`, git-ignored); Playwright `e2e/offline-speech.spec.ts` with fake mic.
5. Acceptance: online prepare → offline reload → fake-mic record of S01 → transcript; zero non-local requests; UI heartbeat never stalls during transcription; log transcript + timing here; commit `phase 1`, push.

**Phase 1 result (04:02 IST)** — all checks automated: 10 Vitest tests, 7 Playwright tests (`npm run e2e`).
- Online once, "Prepare offline mode" stores 66.1 MB (44.5 MB model + 21.6 MB ONNX runtime) in the browser's own storage. Then network off, fresh load, "Ready offline", record S01 (TTS-synthetic) through the real recorder → transcript:
  > patient neuroplenty eight years, complaints of fever for three days, temperature 101, gave Ferrisate a mile 500 mg three times a day for three days, review after three days.
- Zero requests to a non-local host over the whole session, including offline. A control fetch to an uncached URL fails while offline, so "offline" really is offline; no local request failed.
- The UI never stalled: 320 heartbeat ticks (every 50 ms) during record + transcribe, longest gap 104 ms.
- Speed on this laptop (Apple M5 Pro, headless Chromium 153, single-thread WASM, model already loaded): S01 11.4 s of audio → 1.19 s; S04 14.65 s → 1.20 s (the first run adds 0.71 s model load). Node with onnxruntime-node: about 0.37 s. These are laptop numbers, not phone numbers.
- Word timestamps work with the q8 export: tapping a word plays exactly its span (a test checks the start offset and length). Silent recordings are refused; a blocked microphone shows plain help.
- **Where speech recognition hurts** (TTS Indian-English voice, observed): drug names (paracetamol → "Ferrisate a mile", cetirizine → "a "resin", zinc → "and in"), names (Noor → "neuroplenty"), "BP" → "VP", "pulse" → "Paul's". Numbers and ordinary words were good. In the browser path the audio also goes through Opus compression, which made "thirty-eight" come out as "eight". So Phase 2 must snap near-miss drug names and ask a person instead of guessing, and the review screen must make name, age and doses easy to check against the audio.
- Not yet tested: a real microphone and a real phone (WHEN YOU WAKE UP item 4).

### Phase 2 — Extraction + review · plan (04:05 IST)
1. Test-first: `src/extract/score.ts` implements the matching rules from `eval/scripts.json`; one Vitest file turns the 10 scripts into failing cases (field accuracy ≥ 90%, every expected flag raised, no extra flags on clean scripts).
2. Engine in `src/extract/`: tokenizer + `numbers.ts` (digits, spoken numbers, decimals, "one forty" shorthand, "140 over 90"), lexicons (drugs, symptoms, facilities, cues) with their source at the top, then the field extractors, `flags.ts` + `src/record/completeness.ts`. Every value carries an evidence span; nothing is generated.
3. P1 items after the core is green: NAME_SNAPPED (consonant-skeleton + edit distance, two close candidates → pick neither) and CONFLICT. Needed because tiny.en garbles drug names. Weekday follow-up stays in unless time runs out.
4. Review screen: summary bar, sections with colour + icon + word, evidence drawer (highlighted transcript + play that span), inline edit, "Not applicable", "Looks right", Confirm disabled until nothing is amber or red, Transcript tab. Playwright proves the Confirm gate.
5. Run the extractor on the Whisper transcripts of `eval/tts/*.wav` and note in PROGRESS.md where speech recognition breaks extraction. Commit `phase 2`, push.
