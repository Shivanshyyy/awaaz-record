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
2. **Turn on GitHub Pages (needed for the live URL).** Open https://github.com/Shivanshyyy/awaaz-record → *Settings* → *Pages* → under "Build and deployment" set *Source* to **GitHub Actions**. If the repo is private: *Settings* → *General* → *Danger Zone* → *Change visibility* → **Make public** (the hackathon needs it public, and Pages on a private repo needs a paid plan). Then *Actions* tab → "Deploy to GitHub Pages" → *Run workflow* (or push any commit). The site should appear at https://shivanshyyy.github.io/awaaz-record/ (not verified yet).
3. **Optional security tidy-up.** While checking whether git could push, I ran the macOS keychain credential helper and its output printed the stored GitHub OAuth token once into tonight's session log. It is not in any file or commit. If you want to be safe: revoke it at https://github.com/settings/applications (Authorized OAuth Apps) and sign in again when you next push.

## Status
| Phase | State |
|---|---|
| 0 Setup | **done** 03:42 IST |
| 1 Offline speech | not started |
| 2 Extraction + review | not started |
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
- Push: attempted at the end of the phase; outcome is in the next log entry.
