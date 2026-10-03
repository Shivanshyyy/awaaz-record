# Awaaz Record — instructions for Claude Code

Start every session by reading `docs/PROGRESS.md` (create it if missing), then continue the next unfinished task in `docs/PLAN.md`. Read the relevant phase of `docs/PLAN.md` before starting it.

## What we're building
An offline phone web app (PWA) for a clinic health worker. She speaks a 20–60 s visit note in English → the app transcribes it on the device → fills a fixed visit record where every value links back to the words it came from → the worker checks and confirms → the record is saved encrypted → the patient leaves with a slip (QR + medicine timing icons) and hears her instructions in Hindi from pre-recorded clips.

- Hackathon: Hack-Nation × World Bank "Small AI for Development", Challenge 04, **Health** (Annex A). Rules are in `ps.pdf`: rules p.7, data p.7–10, deliverables + judging p.10–11, health annex p.13–15.
- Solo builder. Submission deadline ≈ 16:39 IST, Sun 4 Oct 2026. Code must be pushed and deployed by 14:30 IST.
- Repo: https://github.com/Shivanshyyy/awaaz-record.git (branch `main`).
- Setting: a rural primary health centre in India. Staff document in English; the patient (Noor) speaks Hindi.

## Non-negotiables
1. **No diagnosis, no clinical advice.** Never suggest a condition, drug, dose or treatment. Checks cover documentation completeness and obvious number errors only.
2. **Fixed list of answers.** The extractor fills the fixed schema below and never generates free text. Every value carries an evidence span pointing at the transcript words it came from.
3. **Human makes the final call.** A record can't be confirmed while any field is amber or red. Nothing auto-confirms.
4. **Flag, don't guess.** Low confidence → amber flag with a plain-English question.
5. **Offline core.** Consent → record → transcribe → review → save → slip → Hindi audio works with the network off after the first load. Models and ONNX runtime files are served from our own origin, never a CDN at runtime.
6. **Small.** App + model under ~100 MB. Whisper tiny, English only. No on-device LLM.
7. **Hindi only from `docs/HINDI_CLIPS.md`.** Never write new Hindi. If a new line is needed, add the English to that file marked `NEEDS TRANSLATION + REVIEW` and move on.
8. **Privacy.** Consent before recording. Records encrypted at rest with a key derived from the worker PIN. Audio never leaves the device and is deleted once the record is confirmed.
9. **Honest numbers.** Never invent statistics, accuracy figures or citations. Numbers in docs come from `npm run eval` output or a source you actually opened (name, year, country, URL). Label synthetic data "synthetic".

## Language
English everywhere: code, comments, UI, docs, commit messages. Hindi appears only in the patient clips and the Hindi lines on the slip, copied verbatim from `docs/HINDI_CLIPS.md`.

## Code style
- TypeScript strict, React function components, small files, plain code over clever abstractions.
- **Comments: one short line, only where the why isn't obvious.** No comment blocks.
- New dependency → one line in `docs/DECISIONS.md` saying why.
- Every extraction rule has a Vitest test.

## Stack
Vite + React + TypeScript + Tailwind · `vite-plugin-pwa` (raise `maximumFileSizeToCacheInBytes` for model files) · `@huggingface/transformers` v3 running Whisper tiny.en (q8 ONNX) in a Web Worker · `idb` + WebCrypto (PBKDF2 → AES-GCM) · `qrcode` · Vitest · Node eval scripts with `ffmpeg-static` · GitHub Pages via GitHub Actions (Vite `base: '/awaaz-record/'`).

## Layout
```
src/app/         screens + a simple state router
src/audio/       recorder, decode → 16 kHz mono Float32
src/asr/         worker.ts (Whisper), client.ts
src/extract/     numbers.ts, lexicons/, fields/, flags.ts, index.ts
src/record/      schema.ts, completeness.ts
src/store/       crypto.ts, db.ts, tasks.ts, sync.ts
src/patient/     slip (QR + print), playlist.ts (Hindi clips)
public/models/   Whisper files (git-ignored; `npm run fetch-models`)
public/audio/hi/ Hindi mp3 clips + manifest.json
eval/            scripts.json (gold labels, synthetic), results/, tts/ (TTS-synthetic wav, git-ignored)
recordings/      the user's synthetic test voice notes (git-ignored)
e2e/             Playwright tests (headless Chromium, fake mic)
scripts/         fetch-models.mjs, make-tts-audio.mjs, eval.mjs
docs/            PLAN, PROGRESS, DECISIONS, PROMPTS, HINDI_CLIPS, RECORDINGS, EVALUATION
```

## Visit record (fixed schema)
Every field: `{ value, status: 'ok'|'check'|'missing', evidence: {text, start, end, t0?, t1?}[], flags: Flag[], source: 'voice'|'edited'|'manual', confirmed }`.
- `patient`: name, ageYears
- `complaint`: terms[] (symptom lexicon match or verbatim span), durationDays. Negated terms ("no pain") are excluded.
- `vitals`: temp {value, unit 'C'|'F', qualitative?: 'normal'}, bp {sys, dia}, pulse, weightKg, spo2
- `medications[]`: name (canonical generic, lowercase), dose, unit, count? ("one tablet"), perDay, timing ('morning'|'afternoon'|'night')[], prn, durationDays, ongoing, withFood ('after'|'before'|null)
- `advice`: tags ('fluids'|'rest'|'breastfeeding')[], other[] (verbatim spans only)
- `referral`: {to, urgent} — null when not mentioned
- `followUp`: {kind: 'days'|'date'|'if_worse'|'none', days?, date?}
- Also: `consent` {given, at}, `transcript` {text, words[{w, t0, t1}]}, `status` 'draft'|'confirmed', `sync` 'pending'|'sent'.

Required to confirm: patient name, complaint, at least one of medications/advice/referral, and followUp (or the worker marks "none"). Each medication needs dose + unit, and perDay or prn, and a duration unless prn or ongoing.

## Flags `{code, target, message}`
- `MISSING` (red). Amber: `MISSING_DETAIL` · `UNIT_INFERRED` · `OUT_OF_RANGE` · `CONFLICT` · `CORRECTION_CUE` ("sorry", "make that", "I mean") · `NAME_SNAPPED` (heard word → lexicon drug) · `UNCLEAR`.
- `target` is a path such as `followUp`, `vitals.bp`, `medications[paracetamol].dose`.
- `message` is a short plain-English question for the worker, e.g. "Dose not heard for ORS — what was given?"
- Sanity ranges (documentation only): temp 30–45 °C or 86–113 °F (unit inferred from the range raises no flag) · BP sys 60–260, dia 30–160, sys > dia · pulse 30–220 · SpO2 50–100 · weight 0.5–250 kg · age 0–120 · durations and follow-up 1–365 days.

## UI rules
Mobile first (360 px wide), tap targets ≥ 48 px, high contrast, light theme. A status is always colour + icon + word, never colour alone. One primary action per screen. Show the worker the English meaning of every Hindi clip before it plays.

## How to work (autopilot)
- Do the phases in `docs/PLAN.md` in order. Per phase: write a 5-line plan in PROGRESS.md → build → run that phase's acceptance checks → fix → update PROGRESS.md (done / next / blockers / ACTION FOR USER) → commit `phase N: <summary>` → push.
- Run `date` at the start of each phase and compare with the time boxes. If behind, apply that phase's cut line. Never cut a non-negotiable.
- Don't stop to ask unless truly blocked. Make the reasonable call, log one line in `docs/DECISIONS.md`, keep going.
- Missing user assets (recordings, Hindi mp3s) → use the fallbacks in PLAN.md and continue.
- Ask the user first before: deleting anything outside this repo, global installs, anything that costs money, force-pushing or rewriting git history.
- Never commit secrets, real patient data, `public/models/`, `recordings/`, or any file over 50 MB.
- Never delete or overwrite `ps.pdf`, `CLAUDE.md`, `docs/`, `eval/scripts.json`. Never run a project scaffolder in the repo root (it can offer to wipe existing files).

## Unattended run (the user is asleep until about 10:00 IST)
- Don't end your turn or ask anything while there's work you can do. When Phases 0–5 are done, continue with "If you finish early" in PLAN.md.
- Anything that needs the user goes in a numbered `## WHEN YOU WAKE UP` checklist at the top of PROGRESS.md, with exact steps. Then carry on with other work.
- If `git push` fails or asks for credentials, keep committing locally and add it to WHEN YOU WAKE UP. Don't retry in a loop.
- If the permission mode blocks a command, use another approach or skip it, log it, and continue.
- No human voice tonight: test with OS text-to-speech audio and Playwright (see "How to test with nobody around" in PLAN.md). Label that audio "TTS-synthetic".

## Commands
`npm run dev` · `npm run build` · `npm run preview` · `npm test` · `npm run e2e` · `npm run fetch-models` · `npm run tts-audio` · `npm run eval`

## Compact Instructions
When compacting, keep: the current phase and task, open bugs, files changed in this phase, decisions not yet written to DECISIONS.md, and anything the user asked for in this session.
