# Awaaz Record — build plan

All times are IST, Sunday 4 Oct 2026. Deadline ≈ 16:39 (confirm on the Hack-Nation portal). We aim to submit by **16:00**.

**Overnight mode:** the user is asleep from about 03:30 until about 10:00. Claude Code works alone until then: no questions, no waiting. Anything that needs the user goes in the `## WHEN YOU WAKE UP` checklist at the top of `docs/PROGRESS.md`, with exact steps.

**P0** = must ship · **P1** = should ship · **P2** = only if ahead of schedule.

## Timeline

| Phase | Time (IST) | Owner | Goal |
|---|---|---|---|
| 0 Setup | 03:30–04:00 | Claude Code | Repo, hand-written scaffold, PWA shell, model fetch, deploy workflow |
| 1 Offline speech | 04:00–06:00 | Claude Code | Record → Whisper on the device → transcript with word times; test audio + Playwright |
| 2 Extract + review | 06:00–09:15 | Claude Code | Fixed-field extractor + tests + review screen with linked evidence |
| 3 Record, privacy, patient | 09:15–11:45 | Claude Code | Consent, PIN + encryption, save, tasks, slip, Hindi playlist, sync export |
| 4 Evaluation | 11:45–12:45 | Claude Code | WER + field accuracy (TTS audio overnight, the user's recordings when they arrive) |
| 5 Polish, deploy, docs | 12:45–14:30 | Claude Code | UI pass, offline test, deploy, README, video script |
| 6 Video + submit | 14:30–16:00 | User | Record the video, final checks, submit |

If a phase finishes early, start the next one straight away. When Phases 0–5 are all done, go to **If you finish early** below.

## How to test with nobody around

- **Test audio:** `scripts/make-tts-audio.mjs` (`npm run tts-audio`) turns each script in `eval/scripts.json` into speech with the operating system's built-in voice: `say` on macOS, PowerShell `System.Speech` on Windows, `espeak-ng` on Linux. Convert to 16 kHz mono WAV with ffmpeg-static into `eval/tts/S01.wav` … `S10.wav` (git-ignored). This audio is **TTS-synthetic**: good for checking that the pipeline works, never presented as an accuracy claim. If the machine has no built-in voice, download one public-domain English speech sample for smoke tests and note it in DECISIONS.md.
- **Browser checks:** Playwright (`@playwright/test`, `npx playwright install chromium`), `npm run e2e`. Fake microphone: Chromium launch args `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<path to wav>`. Offline: `context.setOffline(true)`. Record every network request so a test fails if anything goes to a non-local host after going offline.
- Anything that truly needs a human or a real phone goes in WHEN YOU WAKE UP.

## When the user wakes up (Shivansh)

| When | Task | Takes |
|---|---|---|
| on waking | Open `docs/PROGRESS.md` and do the WHEN YOU WAKE UP list. If Claude Code has stopped, paste Prompt 2 | 10 min |
| next | If pushes failed: run `git push -u origin main` and sign in | 2 min |
| next | Make the repo **public**, then Settings → Pages → Source: **GitHub Actions** | 3 min |
| next | Record the 13 voice notes in `docs/RECORDINGS.md` → `recordings/` → paste Prompt 4 | 15 min |
| next | A Hindi speaker checks the text in `docs/HINDI_CLIPS.md` → generate the 23 clips in ElevenLabs → `public/audio/hi/` → paste Prompt 5 | 35 min |
| next | Open the live URL on your phone, load it once, switch on airplane mode, try one visit | 10 min |
| 12:45 | Paste Prompt 8 (judge audit) | 2 min |
| 14:00 | Paste Prompt 10 (final check); write "Your take" in the README | 20 min |
| 14:30–15:45 | Record the video from `docs/VIDEO_SCRIPT.md` | 75 min |
| 16:00 | Submit | 15 min |

---

## Phase 0 — Setup (P0) · 03:30–04:00

**Build**
1. Create `docs/PROGRESS.md` (with an empty `## WHEN YOU WAKE UP` section at the top) and `docs/DECISIONS.md`.
2. `git init -b main`, add remote `origin` (repo URL in CLAUDE.md), `.gitignore`: `node_modules/`, `dist/`, `public/models/`, `recordings/`, `eval/tts/`, `test-results/`, `playwright-report/`, `.env*`, `.DS_Store`.
3. Scaffold **by hand** (package.json, vite.config.ts, tsconfig, index.html, Tailwind setup). Do **not** run `npm create vite` in the root: it can offer to delete existing files. If you want the template, scaffold into `.tmp-scaffold/`, copy what you need, delete that folder.
4. Dependencies: react, react-dom, @huggingface/transformers, idb, qrcode. Dev: vite, @vitejs/plugin-react, typescript, tailwindcss, vite-plugin-pwa, vitest, @playwright/test, ffmpeg-static, wavefile, jsqr, @types/*.
5. `scripts/fetch-models.mjs` (`npm run fetch-models`): download Whisper tiny.en ONNX (q8 encoder + merged decoder) plus config/tokenizer files from the Hugging Face model repo into `public/models/<repo-id>/`, in the layout Transformers.js expects. Print the total size.
6. PWA manifest: name "Awaaz Record", short name "Awaaz", standalone, simple generated icons.
7. App shell: header + bottom nav (Today, New visit, Records, Tasks) with placeholder screens.
8. `.github/workflows/deploy.yml`: on push to `main` → `npm ci` → `npm run fetch-models` → `npm test` → `npm run build` → deploy to GitHub Pages (upload-pages-artifact + deploy-pages).
9. Commit and push. If the push fails or asks for credentials, keep committing locally and add "push to GitHub" to WHEN YOU WAKE UP.

**Acceptance**
- `npm run build` and `npm test` (one smoke test) pass.
- The shell renders at 360 px width (Playwright screenshot saved to `docs/screens/`).
- Model files exist in `public/models/`, total size printed (< 100 MB), folder is git-ignored.
- Pushed to `origin/main`, or committed locally with a WHEN YOU WAKE UP item.
- WHEN YOU WAKE UP contains: "Make the repo public + Settings → Pages → Source: GitHub Actions".

---

## Phase 1 — Offline speech (P0) · 04:00–06:00

**Build**
1. Recorder: MediaRecorder, mic permission states (prompt / denied with help text), 90 s cap, timer, simple level meter, stop / redo.
2. Decode to 16 kHz mono Float32 (`decodeAudioData` + `OfflineAudioContext` resample).
3. ASR Web Worker: `pipeline('automatic-speech-recognition', <local model id>, { dtype: 'q8' })` with `env.allowRemoteModels = false` and `env.localModelPath = import.meta.env.BASE_URL + 'models/'`. Use `chunk_length_s: 30, stride_length_s: 5`. Ask for `return_timestamps: 'word'`.
   - First verify word timestamps work with this model export. If they don't, use chunk timestamps and log it in DECISIONS.md.
   - **Transformers.js loads ONNX Runtime `.wasm` files from a CDN by default.** Serve them from our origin (copy at build, set `env.backends.onnx.wasm.wasmPaths`) so nothing external is needed offline.
4. First-run "Prepare offline mode" screen: loads the model once with progress + size, then shows "Ready offline ✓". Make sure the model, the worker chunk and the wasm files are cached for later offline loads.
5. Transcript view: tapping a word plays the audio from its `t0` to `t1`.
6. Dev-only helper: transcribe an uploaded audio file.
7. Test audio: `npm run tts-audio` (see "How to test with nobody around").
8. Playwright setup + `e2e/offline-speech.spec.ts`.

**Acceptance (automated with Playwright)**
- Load the app online once (model prepared) → go offline → reload → record through the fake mic using `eval/tts/S01.wav` → a transcript appears. Save the transcript text to PROGRESS.md.
- The test fails if any request goes to a non-local host after going offline.
- The timer/progress element keeps updating during transcription (worker doesn't block the UI).
- PROGRESS.md logs the transcription time for a ~15 s clip on this machine.

**Fallbacks**: no word timestamps → chunk-level evidence. Service-worker precache of the model fails → rely on the Transformers.js browser cache plus the explicit "Prepare offline mode" step; document it. Fake mic won't work → test the same pipeline through the dev upload helper and note it.

---

## Phase 2 — Extraction + review (P0, P1 where marked) · 06:00–09:15

**Build (test-first)**
1. Turn `eval/scripts.json` into Vitest cases: reference text → expected fields. They fail first.
2. `numbers.ts`: digits and spoken numbers → values with character offsets. Must handle: "thirty-eight", "one hundred and one", "ninety-nine point eight", "two hundred and fifty", and Indian shorthand "one forty" = 140 or "six fifty" = 650 (only where a 3-digit value is expected, i.e. BP or dose). Also "140/90" and "140 over 90". Whisper often writes digits, so support both.
3. Lexicons (put the source at the top of each file):
   - **drugs**: about 100 common primary-care generics (WHO Model List of Essential Medicines / India's NLEM) with aliases, e.g. "ORS", "O R S", "oral rehydration salts". A few Indian brand names map to a generic only when unambiguous ("Dolo", "Crocin", "Calpol" → paracetamol).
   - **symptoms / visit reasons**: about 60 phrases including Indian English ("loose motions", "body ache", "burning while passing urine", "blood pressure check").
   - **facilities**: district hospital, CHC, PHC, sub-centre, eye hospital, medical college, etc.
   - **advice cues**: fluids / water, rest, breastfeeding.
   - **correction cues**: sorry, make that, I mean, correction, no wait.
4. Field extractors:
   - patient name after "patient" (strip "baby"), age;
   - complaint + duration ("for three days", "since yesterday" = 1, "since morning" = 0, "over six months" = 180, months = 30 days); exclude negated terms ("no pain");
   - vitals; medications, segmented by drug mention (name → dose/unit → count → frequency/timing/prn → duration or "continue" = ongoing → with food);
   - advice tags; referral (+ urgent words: today, immediately, urgent);
   - follow-up: "review after / in N days, weeks, months", "follow up on Monday" (next such day after the visit date), "if not better / if worse, come back" → `if_worse`, "no follow-up needed" → `none`; anything else that mentions follow-up → `UNCLEAR`.
5. **P1** `NAME_SNAPPED`: an unknown word near a dose → phonetic + edit-distance match against the drug lexicon. If two candidates are close, flag both and pick neither.
6. **P1** `CONFLICT`: two different values for the same field (e.g. two BPs).
7. `completeness.ts` + `flags.ts`: required/conditional rules and sanity ranges (CLAUDE.md) → field status.
8. Review screen:
   - summary bar ("2 to check · 1 missing");
   - sections with status shown as dot + icon + word;
   - tap a field → evidence drawer: transcript with those words highlighted + play that audio span;
   - inline edit (`source = 'edited'`), "Not applicable" for optional fields, explicit "Looks right" on each amber/red;
   - record-level **Confirm** disabled until everything is resolved; a Transcript tab.
9. Run the extractor on the Whisper transcripts of `eval/tts/*.wav` too, and note in PROGRESS.md where speech recognition breaks extraction.

**Acceptance**
- `npm test` is green.
- On the 10 reference texts: field accuracy ≥ 90% and every expected flag raised. If not, list misses in PROGRESS.md and fix the top 3.
- Every non-null field has at least one evidence span. No code path writes generated text into a record.
- A Playwright test proves Confirm is disabled while amber/red fields are unresolved, and enabled after resolving them.

**Cut line (09:15)**: drop NAME_SNAPPED, CONFLICT and weekday follow-up dates. Keep everything else.

---

## Phase 3 — Record, privacy, patient (P0 unless marked) · 09:15–11:45

**Build**
1. **Consent** before recording: "Play consent in Hindi" (clip `consent`), English meaning shown to the worker, then "Patient agreed" / "Patient declined". Declined → manual form, no recording. Store consent + timestamp. Also allow "consent taken verbally in another language".
2. **PIN**: first run sets a 4–6 digit PIN. Key = PBKDF2(PIN, random salt, ≥ 200k iterations; tune so unlock takes < 1.5 s on a mid-range phone) → AES-GCM. Every record body is encrypted in IndexedDB. **P1**: auto-lock after 2 min idle; 5 wrong PINs → 60 s lockout (never wipe).
3. **Confirm** → save encrypted → delete the audio blob → create the follow-up task.
4. Records list + read-only detail (evidence still shown from the transcript).
5. **P1** Tasks screen: follow-ups sorted urgent referral → overdue → due date.
6. **Patient slip**:
   - date, clinic name (a setting), first name + age (no surname, phone or address);
   - medicines with timing icons: 1× shows one icon only if a time was said; 2× = morning + night; 3× = morning + afternoon + night; "when needed" icon for prn. The worker sees this mapping before printing;
   - follow-up date, referral;
   - the Hindi line under each item (text from `docs/HINDI_CLIPS.md`);
   - QR code holding a short plain-text summary any phone camera can read;
   - print CSS.
7. **Hindi playlist** (rules in `docs/HINDI_CLIPS.md`): built from the confirmed record; the worker sees the list with English meanings, can untick optional clips, then plays it. Per-clip fallback: mp3 → `speechSynthesis` with a `hi-IN` voice if the device has one → show the Hindi text with "audio not available". The mp3s won't exist overnight; the fallback must work without them. Clips are cached for offline once added.
8. **P1** Sync: a queue screen ("3 waiting for signal"); "Send" posts to a mock endpoint when online, clearly labelled **mock**; "Export" downloads a DHIS2-shaped event JSON per record; mapping documented in `docs/DHIS2_MAPPING.md`.

**Acceptance (automated where possible)**
- Playwright, offline: consent → record (fake mic) → review → resolve flags → confirm → slip → playlist list shown.
- `page.evaluate` reads raw IndexedDB values: no plaintext patient name or transcript.
- The audio blob is gone after confirm.
- A test decodes the generated QR image with `jsqr` and gets the expected summary text.
- A unit test shows a wrong PIN can't decrypt records.

**Cut line (11:45)**: drop sync/export, auto-lock and the Tasks screen (keep the follow-up date on the slip).

---

## Phase 4 — Evaluation (P0) · 11:45–12:45

**Build** `scripts/eval.mjs` (`npm run eval`):
1. Audio sources, reported in **separate sections**: (a) `recordings/` — the user's own voice (`S01`…`S10`, `S01_noisy` etc.; `.m4a .mp3 .wav .ogg .webm .aac`); (b) `eval/tts/` — TTS-synthetic, a pipeline check only.
2. Convert with ffmpeg-static to 16 kHz mono wav → run the **same** Whisper model in Node with Transformers.js → WER against the script text. Normalise case, punctuation and number formats on both sides before scoring, and write the normalisation rules in EVALUATION.md.
3. Run the extractor on (a) the reference text and (b) each ASR transcript. Score each field against `expect` using the matching rules in `eval/scripts.json`. Report expected-flag recall and list extra flags.
4. Timing: seconds per clip and real-time factor on this machine (name the CPU).
5. Write `eval/results/latest.json` and generate `docs/EVALUATION.md` from it: tables, method, limitations (13 clips, one speaker, scripted, synthetic, quiet vs noisy, laptop not phone; TTS audio is cleaner than real speech).

Overnight there are no human recordings: run on reference text + TTS audio, mark the human rows "pending recordings", and continue. Re-run when the user pastes Prompt 4.

**P2**: PriMock57 (github.com/babylonhealth/primock57). Check its license first; WER on about 10 clinician utterances as an outside benchmark.

**Acceptance**: `npm run eval` reproduces every number in EVALUATION.md. No hand-typed numbers.

---

## Phase 5 — Polish, deploy, docs (P0) · 12:45–14:30

**Build**
1. UI pass at 360 px: empty states, errors (mic denied, model not ready, storage full), loading states, contrast. Save Playwright screenshots of every screen to `docs/screens/`.
2. "Load demo visits" button: 3 synthetic records labelled SYNTHETIC, so judges can explore without recording.
3. Deploy: if GitHub Pages isn't enabled yet, run `npm run build && npm run preview` and the Playwright offline test against the preview build, then add "check the live URL" to WHEN YOU WAKE UP. Once Pages is on, confirm the workflow is green and the live URL loads.
4. Problem evidence: find 3–5 sources and open each one. Record name, year, country, URL. Leads to check (verify before citing, drop any you can't open):
   - WHO Global Health Observatory: health workforce density, India
   - MoHFW "Health Dynamics of India" (formerly Rural Health Statistics): doctor shortfall at PHCs
   - Irving et al., BMJ Open 2017: primary-care consultation length across 67 countries
   - GSMA Mobile Gender Gap Report: women's mobile vs smartphone ownership, India
5. `README.md` sections:
   - one-sentence problem statement in the template: "Because of this tool, [user] will [action] by [when] that they would otherwise [not do / do late / do worse]; we know because [evidence]."
   - screenshots; where the tool sits in the worker's day (when she opens it, what she does, what happens next)
   - what the AI does and why SMS, a spreadsheet or a search can't do it; the guardrails
   - architecture (mermaid diagram) and tech stack
   - data table: dataset/model, source, license, size, used for — plus **what our data does not cover**
   - privacy: where data sits, who can read it, lost or shared phone, consent
   - local language: Hindi; how it works in a less-supported language (a community member records the 23 fixed clips; no model needed)
   - evaluation summary (from EVALUATION.md); constraints the tool adds (smartphone with mic, one-time download, review time)
   - scalability and replicability (new language = new clip folder; new country = new lexicons and facility list; DHIS2 / ABDM path)
   - run locally and reproduce the eval; limitations and next steps (Hinglish dictation, Indian-accent fine-tuning — check AI4Bharat resources); a "Your take" placeholder for the user
6. `docs/VIDEO_SCRIPT.md`: follow Prompt 9 in `docs/PROMPTS.md`.

**Acceptance**: the preview build passes the Playwright offline journey; README has every section above; the only TODO left is "Your take"; every number is traceable.

---

## If you finish early (do in this order)

1. Run the judge audit yourself: follow Prompt 8 in `docs/PROMPTS.md`, then fix every "fail" and the cheapest "partials".
2. Bring back anything that was cut (NAME_SNAPPED, CONFLICT, weekday follow-up, auto-lock, Tasks screen, sync/export).
3. P2: PriMock57 benchmark (license first) · an in-app "About & evidence" screen (data sources, eval results, limitations, privacy) · accessibility pass (labels, focus order, screen-reader names) · Lighthouse PWA check · WebGPU option for faster transcription when the device supports it.
4. Polish README and VIDEO_SCRIPT.md.

No big refactors after 12:00. Keep `main` working at every commit.

---

## Phase 6 — Video + submit (User) · 14:30–16:00

- Video 2–5 min (aim for 3:30). It must cover: the problem statement sentence, the AI capabilities + why not a simpler tool + guardrails, the end-to-end demo, where it sits in the worker's day + tech stack, and your take.
- Record in Chrome device mode (360 × 740) or an Android emulator. Switch to offline / airplane mode on camera before the demo.
- Submit: live URL + repo link, video link, form fields.
- "Your take" prompts: The clinic writes in English but Noor understands Hindi — what does that gap mean to you? Why does it matter that her voice never leaves the phone? What did a 40 MB model get wrong (accents, Hinglish), and what would fix that locally?

---

## Rules traceability (ps.pdf)

| Requirement | How we meet it | Where |
|---|---|---|
| Runs on a device the user already has | PWA in Chrome on a basic Android phone; no app store | whole app |
| Core feature works offline | service worker + local model + IndexedDB | Phases 1, 3 |
| Model small enough to side-load | Whisper tiny.en q8 (size from fetch-models output); clips < 1 MB | Phase 0 |
| One interaction in a local language | Hindi consent + instructions (audio + text) | Phase 3 |
| Human in the loop | every amber/red must be resolved; nothing auto-confirms | Phase 2 |
| Avoid hallucinations | fixed schema, evidence span on every value, no generated text | Phase 2 |
| Fail-safe: "not sure → ask a person" | amber flags phrased as questions | Phase 2 |
| Cite data and say what it doesn't cover | README data table + gaps | Phase 5 |
| Privacy: where data sits, who reads it, lost phone | PIN + AES-GCM, audio deleted, consent | Phase 3 |
| No diagnosis (health annex) | no clinical suggestion anywhere | all |

## Risks

| Risk | Plan |
|---|---|
| No word timestamps in this Whisper export | chunk-level evidence; still links to text |
| Whisper tiny mishears drug names | lexicon snapping + amber flags; report WER honestly |
| Slow on low-end phones | progress UI; report real-time factor; WebGPU is future work |
| Model too big for service-worker precache | Transformers.js cache + "Prepare offline mode" |
| ONNX runtime wasm pulled from a CDN | serve from our origin (Phase 1) |
| No human to test overnight | OS text-to-speech audio + Playwright fake mic |
| `git push` needs sign-in overnight | commit locally; user pushes on waking |
| Permission mode blocks a command | another approach or skip; log it; continue |
| Laptop sleeps, terminal closes, or usage limit pauses Claude Code | user resumes with Prompt 2 |
| ElevenLabs late | `speechSynthesis` / text fallback; swap clips in later |
| Hindi mistakes (builder can't read Hindi) | native-speaker review logged in HINDI_CLIPS.md |
| Recordings late | reference text + TTS eval first |
| Pages not enabled or repo private | user action; fallback: import the repo on Vercel |
| Long session loses context | PROGRESS.md + Compact Instructions in CLAUDE.md |

## Submission checklist
- [ ] Live URL works, including offline after the first load
- [ ] Repo is public; README complete; "Your take" written
- [ ] `docs/EVALUATION.md` generated by `npm run eval`, with the user's recordings
- [ ] Hindi clips reviewed by a Hindi speaker (review log filled)
- [ ] Video 2–5 min uploaded; link opens without sign-in
- [ ] Form submitted before the deadline
