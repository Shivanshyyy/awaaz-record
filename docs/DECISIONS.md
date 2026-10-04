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
- @axe-core/playwright (dev) — automated accessibility scan (contrast, names, roles) of every screen in the browser tests.

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

## Phase 3 (record, privacy, patient)
- The PIN is asked for at the first Confirm (or when Records or Tasks is opened), not at app start. Unsaved work lives only in memory and everything saved is sealed, so the PIN guards exactly what needs guarding, and a first-time visitor can try the recording and review without setting anything up.
- Key = PBKDF2-SHA256 of the PIN with a random 16-byte salt, rounds calibrated once on the phone to about 0.7 s and clamped to 200k to 600k, then AES-GCM-256 (non-extractable key). On a very slow phone the 200k floor wins over the 1.5 s goal. The rounds and salt are stored in the clear (they are not secret); a verifier sealed with the key says whether a PIN is right.
- Each record body and each task is sealed with a fresh 96-bit IV and its own id as authenticated data, so a sealed body cannot be moved to another record. In the clear: random id, created timestamp (used to sort), `status`, `sync`. The lockout counter and clinic name are also in the clear (neither is patient data).
- Lockout and idle lock are screen-level controls. The real protection is the PBKDF2 cost. A determined person with a copy of the storage can try PINs offline; 4 to 6 digits is a small space. This is stated in the README.
- Auto-lock drops the key after 2 minutes without a touch. A visit still being reviewed stays in memory behind the lock screen (hidden, not wiped), so locking never loses work.
- The recording is only ever kept as decoded samples in memory; Confirm saves the record, creates the tasks and drops the samples. Nothing audio is written to any store. A hidden probe element reports `data-has-audio` so tests can prove it.
- Consent has three outcomes, all stored on the record: agreed after the Hindi message, agreed when asked in another language, declined (then a blank record is filled in by hand and the recording step does not exist).
- Playlist follows `docs/HINDI_CLIPS.md` exactly. Any line except the opening and closing can be unticked; "finish the course" starts unticked. A text-only fallback stays on screen about 2 s per line so it can be read.
- Hindi is never typed in code. `scripts/build-hindi-clips.mjs` copies the 23 lines out of the markdown into a generated JSON that the app imports, and also reads whether the review log has an entry (it does not, so the app says the text is unchecked).
- The slip shows a Hindi line under each medicine using the same rule as the playlist, per medicine. A medicine only when needed gets `med_multi`; the accurate line is on the translation list.
- Timing icons: once a day shows an icon only if a time was said; twice is morning and night; three times is morning, afternoon and night; if the worker said the times and the count matches, those are used. The worker sees the mapping in words and can switch icons before printing.
- QR: a plain-text summary, English, at most four medicines plus "+N more", at error-correction level M. The module matrix is rasterised by our own function so the tested pixels are the displayed pixels.
- Tasks are made when a record is confirmed: a follow-up (days or date) and any referral. An urgent referral is due the visit day; a non-urgent one is due at the follow-up date, or has no date. "If not better" and "none" make no task.
- "Send" is a pure mock with no network call, because ps.pdf p.13 warns that patient data moving through a mobile network carries risks a paper record does not. The button is disabled with no signal and is labelled MOCK. The export is a file the worker chooses to create.
- Tests never speak: this Mac has Hindi system voices and Chromium used one aloud. `e2e/test.ts` gives every spec a silent speech engine with no voices; tests that need a voice install a fake one.
- Print uses `visibility` so only the slip prints on A5, black on white; every icon has its word beside it so a black-and-white printer loses nothing.

## Phase 5 (polish)
- Demo visits are three of the ten scripts run through the real extractor, with the worker's answers applied the way a worker would (the unclear "follow up after delivery" becomes two weeks; ORS gets "not applicable" for its dose). They carry `synthetic: true`, an extra optional field on the record that the fixed schema otherwise lacks, shown as SYNTHETIC on every screen and printed on the slip and in the QR text, so a demo can never be mistaken for a patient.
- The Today screen reads saved records only when the PIN is open and otherwise says they are locked; it never shows patient names while locked.
- Outside benchmark: PriMock57 (Babylon Health, ACL 2022). Licence checked in the repository's own LICENSE.md at the pinned commit: CC BY 4.0, so short quotations and cut utterances are allowed with credit and a note of what we changed (written in `docs/EVALUATION.md`). The audio (88.1 MB for five consultations) is not committed; `npm run fetch-primock` downloads it from the pinned commit and checks each file against the sha256 in its Git LFS pointer.
- PriMock57 measures speech recognition only. The extractor is not run on it: those are conversations, not notes in our format, and a score there would mean nothing.
- The PriMock57 utterance rule is fixed in `src/eval/primock.ts` and tested: per consultation, the earliest two with no transcriber tag and 8 to 25 s, cut at the annotated times, no padding. It was written before any model output on these clips was seen, and not changed afterwards. One consultation had only one that fits, so 9 utterances are scored, not 10; I kept the rule rather than widen it after seeing the results.
- Word errors on PriMock57 use the same normaliser as the rest of the evaluation, plus dropping fillers ("um", "uh") from both sides. Repeated words ("let let let") and spelling differences are not cleaned, which makes the figure stricter. This is written next to the number.
- If `eval/primock57/` is absent, `npm run eval` leaves the section out instead of carrying an old result forward, and says how to add it.
- Bias and fairness got its own README section and a short About paragraph. It says what is not measured (accent, gender, age) instead of implying a result.
- "Check this phone" on the offline setup screen only reads what the browser offers (secure context, microphone, WebAssembly, service worker, storage space, a Hindi voice). It makes no network request and stores nothing.
- A dropped download continues from the bytes already received (HTTP Range) instead of restarting the file. Only in memory: closing the app mid-file restarts that file, because persisting partial files adds failure modes I cannot test on a real phone tonight. It restarts from zero if the server ignores Range or answers with the wrong part (checked against `Content-Range` and the manifest size, which also protects against a compressed host), and gives up after 3 attempts in a row that bring no new bytes, waiting 1 s then 2 s between them.
- The installability test asserts the web manifest, its icons and an active service worker directly in the browser. I did not run Lighthouse for installability.
- ABDM gets one sentence in the README and no mapping: I have not read its specifications.
- First-run wording, found by looking at the screens as a newcomer: Today says "Nothing is saved on this phone yet" when no PIN exists (it used to say records were "locked", which is false before the first save); the PIN panel shows its "enter it to see them" line only when a PIN exists, because the set-a-PIN form carries its own text; free space in the phone check reads in GB once it passes 1 GB; the phone check waits for the phone's voice list like the playlist does.
- `npm run check-live` is read-only: it asks the published site for one byte of every offline file (a ranged request), compares the total with the manifest, and reports whether the host serves parts of files. A compressed response can only be checked for existence, because its headers give the compressed size.
- WebGPU is not enabled. The weights are 8-bit for WebAssembly; WebGPU is a different path I cannot test on a phone, and a silent failure there would cost more than the speed-up gains.
- Accent check: the README's bias section had nothing measured in it, so I added the Speech Accent Archive (George Mason University, https://accent.gmu.edu). Licence read on the site: CC BY-NC-SA 4.0, and its About page lists "engineers who train speech recognition machines" among its users. Our use is a non-commercial evaluation; the audio is not committed (git-ignored, `npm run fetch-accent` downloads it from the Archive's OSF repository), and the repo carries only our analysis (per-speaker error rates) with credit.
- Accent check design: every speaker reads the same 69-word paragraph, so one reference text serves all. Two groups (born in India with a mother tongue other than English; native English speakers born in the USA), the first 10 women and 10 men of each by speaker id (the lowest ids first, the order the Archive assigns). The rule is in `src/eval/accent.ts`, tested, and was fixed before any model output on these recordings was seen. One recording (pahari1.mp3) is listed in the spreadsheet but not in the repository; the next speaker was taken, and that is written in the evaluation. Availability has nothing to do with model performance.
- The result is reported even though it is unflattering (the model made more than twice as many errors on the Indian-language group), and with its limits: 20 speakers per group, read speech, recordings made on different equipment, a child (age 7) in the US group, women and men in each group only 10 each. The README says "not a fairness audit". A test fails if the README says the model made more errors on the Indian-language speakers when the results do not show it.
- Correction made before anything was committed to the docs: the Archive's "country" column is where a speaker was **born**, not where they were recorded. I checked its "English residence" column: 15 of the 20 Indian-born speakers lived in the USA when recorded (mostly for months to a few years). The groups are therefore labelled "born in India" and "born in the USA", the residence counts are reported next to the result, and the text says that accents may have shifted for people living abroad.

