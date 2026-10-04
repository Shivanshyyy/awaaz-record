# Judge audit

A strict self-review against `ps.pdf`: the rules and guardrails on p.7, the data rules on pp.7–8, the deliverables on p.10, the judging table and the pass/fail criterion on p.11, and the health annex on pp.13–14. Written on 4 Oct 2026 at 13:30 IST, with the code as pushed; the numbers quoted are from that day's run, and `docs/EVALUATION.md` is the live source. Statuses are **pass**, **partial**, **fail** or **n/a**. "Pass" means the evidence is in the repo or in a test you can run, not that the thing is perfect. Where the answer is "only you can do this", the row says so.

**Totals:** 20 pass · 9 partial · 2 fail · 1 not applicable, out of 32 requirements. The two fails are the video and your take: both are yours to produce. Nothing in the app or the docs fails a requirement.

## 1. The rules (p.7)

| # | Requirement | Status | Evidence | Fix, or what is left |
|---|---|---|---|---|
| 1.1 | "It runs on a device the user already has" | partial | A web app for a phone browser, installable (`e2e/shell.spec.ts` checks the manifest, icons and service worker). 360 px layouts, 48 px tap targets. A "Check this phone" screen (`src/app/device.ts`) lists what the browser can and cannot do. | **Never run on a real phone.** Every test is desktop Chromium pretending to be one, and speed on a low-end phone is unknown. You: WAKE UP item 4, once the site is live. |
| 1.2 | "Its core feature works offline" | pass | `e2e/journey.spec.ts` and `e2e/offline-speech.spec.ts`: set up once, switch the network off (a control request proves it is off), reload, then consent, record, transcribe, review, confirm, slip, Hindi playlist. Zero requests to any other host. | The first setup needs the one-time download (see 1.3). |
| 1.3 | "Its model files are small enough to side-load or send over a weak connection" | partial | 44.5 MB model plus 21.6 MB runtime, 66.1 MB in all; the whole site is 66 MB. Downloaded file by file with a progress bar; a short file is never stored as complete. **A dropped connection continues from the bytes already received** (`src/asr/offline.test.ts`, `e2e/weak-connection.spec.ts`: the saved file matches its checksum, and a ranged request works through the service worker and the host). | Not done: side-loading from a file or memory card; keeping a half-finished file if the app is closed (it starts that file again); download times on 2G or 3G, which are **not measured**. Fixed during this audit: the resume. |
| 1.4 | "At least one interaction is in a local language, by voice or text; name the language" | partial | Hindi, named. The consent message, the slip lines and the instructions are 23 fixed lines (`docs/HINDI_CLIPS.md`), copied by `scripts/build-hindi-clips.mjs` and tested through three paths: mp3, then the phone's Hindi voice, then the Hindi text. | **The Hindi has not been checked by a Hindi speaker** (the app says so on screen) and **there are no audio files yet**. You: WAKE UP item 6. |
| 1.5 | "Expect to be asked how the tool would fare in a less-supported language" | pass | README, "Local language: Hindi", second paragraph. The patient's side needs no model (a new folder of recorded lines and a text file). The worker's side needs a multilingual or fine-tuned model, and the README says we did not build one. | None. |

## 2. AI guardrails (p.7, p.11)

| # | Requirement | Status | Evidence | Fix, or what is left |
|---|---|---|---|---|
| 2.1 | "A person makes the final call. The tool informs a decision and flags what it is unsure of; it does not act on the user's behalf" | pass | Confirm is disabled while anything is amber or red (`canConfirm` in `src/record/completeness.ts`; `e2e/review.spec.ts`). Nothing auto-confirms. "Looks right" is not offered for something that was never heard. "Send" is a labelled mock the worker taps (`src/store/sync.ts`). | None. |
| 2.2 | "If an entry proposes an agentic workflow, ensure the AI checks in" | n/a | There is no agent: one model call per recording, started by the worker. | None. |
| 2.3 | "Avoid hallucinations" | pass | The record holds only list entries, numbers and words copied from the transcript (`src/extract/no-generated-text.test.ts` fails on any other string). Silence is refused before the model sees it. A repeating loop is cut (`src/asr/transcript.ts`). | **Limit, stated plainly:** the speech model still mishears. On real clinicians' speech it got 28.1% of words wrong (PriMock57, `docs/EVALUATION.md`); on computer-voice audio, 19 of 43 wrong values looked fine. The mandatory review is the control, and token probabilities to flag doubtful names and numbers are the first "next step" in the README. |
| 2.4 | Glossary: "Fixed list of answers: the complete set of things your tool is allowed to say" | pass | Everything the app says is a screen string, a flag question (`src/extract/flags.ts`), a word-list entry, or one of 23 Hindi lines. The only free text is the worker's own words copied from the transcript (a complaint not in the list, a piece of advice), shown as heard. | None. |
| 2.5 | Pass/fail fail-safe: "not sure, ask a person" rather than guessing | pass | Amber and red items carry a plain question. A garbled medicine name is matched to the closest drug only with a question, and a tie picks nothing. Impossible numbers are flagged. Tests in `src/extract/`. | None. |

## 3. Data (pp.7–8, 13–14)

| # | Requirement | Status | Evidence | Fix, or what is left |
|---|---|---|---|---|
| 3.1 | "Every entry should cite its data sources" | pass | README, "Data: what we use" table and "Sources I opened". | None. |
| 3.2 | Data that shows the problem: "cite source, year and country; make a note if from modelling, an article or a journal" | pass | Five sources, each opened and read: Irving et al. (BMJ Open 2017, a review of 67 countries; four Indian studies), the health ministry's Health Dynamics of India release (PIB, 2024), WHO GHO HWF_0001 (India, 2024), GSMA Mobile Gender Gap Report 2025 (South Asia), Kessels (2003, a review). Each has its caveat written beside it. | None of them is about rural primary health centres' note-writing time itself, and the README says so. |
| 3.3 | "Name every dataset, its source, its licence and its size" | pass | The README data table lists the speech model, the runtime, the library, the word lists, the scripts, the computer-voice clips, the (pending) own recordings, PriMock57 (CC BY 4.0, 88.1 MB, used only for the outside check, not shipped), the Speech Accent Archive (CC BY-NC-SA 4.0, 16.4 MB, same use) and the Hindi lines. | None. |
| 3.4 | "Indicate what your data does not cover; this is scored" | pass | README, "What our data does not cover" (ten items), the About screen, and the limitations in `docs/EVALUATION.md`. | None. |
| 3.5 | "You may supplement with synthetic data as long as you label it" | pass | The scripts, the computer-voice audio and the demo visits are labelled synthetic everywhere they appear: the evaluation, the README, on screen, on the printed slip and in the QR text. | None. |
| 3.6 | Annex A: "state where the data sits, who can read it, and what happens when the phone is lost or shared" | pass | README, "Privacy", answers each in order. Records are sealed with AES-GCM-256 under a key made from the PIN; a test reads the raw database and finds no patient text (`src/store/store.test.ts`); lockout and idle lock (`e2e/privacy.spec.ts`). | **Limit, stated:** someone who copies the phone's storage can try PINs offline, and 4 to 6 digits is a small space. |
| 3.7 | Annex A: patient data on a mobile network "raises safety exposures that a paper record does not" | pass | No patient data has any network path. "Send" is a mock, and the browser tests fail on any request to another host. | None. |
| 3.8 | Annex A hard limit: no diagnosis | pass | The app never suggests a condition, drug, dose or treatment. Its checks cover documentation only (`src/extract/flags.ts`). | None. |

## 4. Deliverables (p.10)

| # | Requirement | Status | Evidence | Fix, or what is left |
|---|---|---|---|---|
| 4.1 | "Your prototype: the working tool, with the code, or a link to it" | partial | The code is public and pushed (https://github.com/Shivanshyyy/awaaz-record). GitHub's build passes npm ci, the model download, the unit tests and the production build. **The live URL does not exist yet** because GitHub Pages is switched off, so the last step fails. | You, one minute: WAKE UP item 2 (Settings, Pages, Source: GitHub Actions). |
| 4.2 | "A video, 2 to 5 minutes. Entries without this will not make it to the shortlist" | fail | Not recorded. The script is ready: `docs/VIDEO_SCRIPT.md`, about 4:00 with your take. | **You.** Record and upload. |
| 4.3 | Video: the problem statement in the one-sentence template | pass | README, "The problem, in one sentence", and the script's first row. | None. |
| 4.4 | Video: AI capabilities, why not a simpler tool, the guardrails | pass | Script rows 0:42 to 1:32; README sections of the same names. The comparison is honest: a tick-box form could do the same job, and the speed advantage is a hypothesis, not a result. | None. |
| 4.5 | Video: a demo with a clear user journey end to end | partial | The script covers it, with airplane mode switched on camera. "Load 3 demo visits (SYNTHETIC)" gives you a safe, complete journey to show. | **You** have to record it. |
| 4.6 | Video: where the tool sits in the user's day, and the tech stack | pass | Script row 3:00; README, "Where it sits in the worker's day" and "Architecture and stack". | None. |
| 4.7 | Video: "Your take: what localizing AI development means to you" | fail | A placeholder in the script and the README. | **You.** About 30 seconds, in your own words. |

## 5. Judging criteria (p.11)

| # | Criterion (weight) | Status | Evidence | What would lift it |
|---|---|---|---|---|
| 5.1 | The built solution, "Small AI fidelity" (25%) | partial | The whole visit works end to end offline in the automated browser tests: consent, record, transcribe, review, confirm, slip, Hindi playlist. Small: 66 MB, English-only Whisper tiny, no on-device LLM. | A real phone run; the Hindi audio; the live URL. |
| 5.2 | Development relevance and impact (20%) | partial | A real problem from Annex A ("burdensome record-keeping requirements") with five sources and caveats. | **Nobody has timed a real worker**, so the benefit is a design hypothesis. The README and the script say so. |
| 5.3 | Data grounding (15%) | partial | The gap (documentation time, patients forgetting instructions) is sourced; the data used is fully described with what it misses; the export fits DHIS2 (`docs/DHIS2_MAPPING.md`), the system Annex A names. | No real clinic audio exists in the evaluation: made-up notes, computer voices, an outside set of UK clinicians, and 40 people reading one paragraph. |
| 5.4 | Evidence it works (15%) | partial | `docs/EVALUATION.md` is generated from run output, so no number is typed by hand. Extractor alone: 128 of 128 field checks (optimistic: the scripts were used to build it). Computer-voice audio: 105 of 148 = 70.9%, 43 wrong values, 19 not flagged. Real clinicians (PriMock57): 28.1% word errors. Accent check (40 speakers reading one paragraph, Speech Accent Archive): 10.1% word errors for Indian-language speakers against 4.4% for native English speakers born in the USA, the model's gap on accents, stated with its limits. "My own voice" says **pending recordings**. | You record the 13 notes and paste Prompt 4: the real-voice rows then fill in by themselves. |
| 5.5 | Value proposition for AI, and clarity, design and inclusivity (15%) | pass | The AI is one thing, speech recognition; everything after it is deliberately not generative. Statuses are colour plus icon plus word; tap targets are 48 px; an automated accessibility scan (WCAG 2 A and AA) finds nothing on any screen and a canary proves the scanner works. The patient gets timing icons and Hindi lines. | The worker's screens are English only, and nobody has tried it with a screen reader on a phone. |
| 5.6 | Scalability, replicability, what happens next (10%) | pass | README, "Scalability and replicability" and "Limitations and next steps": a new language is a folder and a text file; static hosting needs no server; the export is DHIS2-shaped. | None. |
| 5.7 | Responsible AI, data and safety (pass/fail) | pass | Consent comes before recording and is stored on the record; audio is never stored and is dropped on confirm; records are sealed; a person must clear every amber and red item; "ask a person" flags exist; there is no diagnosis. README "Bias and fairness" reports a small accent check (the model made more errors on Indian-language speakers) and says what is **not measured**: error rates by age or gender, and for clinic speech. | Residual risks, all stated: the Hindi is unchecked, the PIN space is small, the accent gap is measured only on read speech, and no reliable error rate by gender or age exists. |

## What I changed because of this audit

1. **Weak-connection download.** Rule 1.3 asks for model files that can be sent over a weak connection. A dropped connection used to restart the file; it now continues from the bytes received, restarts cleanly if the host ignores or garbles the range, and gives up politely after three attempts with no progress. Three unit tests plus two browser tests, including a checksum of the saved file.
2. **Real human speech in the evaluation.** The weakest honest sentence in the README was "no real voice has been tested". PriMock57 (real clinicians, UK English, CC BY 4.0) is now in the evaluation, the README and the About screen, with its limits written next to the number.
3. **An accent check, because the bias section had nothing measured in it.** The Speech Accent Archive (CC BY-NC-SA 4.0) has people reading one paragraph. Twenty speakers born in India with an Indian mother tongue (most of them recorded while living abroad) and twenty native English speakers born in the USA (chosen by a fixed rule, women and men in equal numbers) went through the same model. The result is unflattering and is reported as it is: more errors for the Indian-language speakers. It is in the evaluation, the README and the About screen, with the limits (small sample, read speech, recordings that differ in more than accent).
4. **Installability test.** The app's claim to be an installable web app is now checked by a test (manifest, icons, service worker).
5. **Wording.** The README, the About screen and the video script no longer say "no real voice has been tested" without the qualification that matters: nothing from our own setting has been.

## What only you can do, in order of effect on the score

1. **Switch on GitHub Pages** (4.1). Without a live link, the prototype row is partial and the demo cannot be shown on a phone.
2. **Record the video** (4.2, 4.5) and **write your take** (4.7). The shortlist rule is explicit.
3. **Try it on a real phone** (1.1) and tell me the time it took to transcribe. One honest line in the video beats any claim.
4. **Hindi**: a fluent speaker checks the 23 lines, then you add the audio (1.4).
5. **Your own voice**: 13 short recordings (5.4).
6. **Choose a licence** for the code (the README says none is chosen yet).

## Questions a strict judge is likely to ask

- *Does it work on a phone?* We have only run it in a desktop browser set to phone size. We do not know the speed on a low-end phone.
- *How accurate is it on real speech?* On a small outside set of UK clinicians, about 28 words in every 100 were wrong; on our own voice we do not know yet. The design assumes it will be wrong sometimes, which is why a person checks every value.
- *Does it work for Indian accents?* Less well than for American ones, in a small check: forty people reading one paragraph, with more word errors for the Indian-language speakers. It is read speech, not clinic speech, and a person checks every record because of this kind of gap.
- *Is the Hindi correct?* Not yet confirmed by a Hindi speaker, and the app says so on screen.
- *Why not a form?* A form with tick-boxes could capture the same fields. Speech may save time; we have not measured it.
- *What happens to the audio?* It stays in memory while the worker reviews and is dropped when she confirms. It is never written to storage and never sent anywhere.
