# Prompts for Claude Code

Copy-paste these into Claude Code. Prompt 1 starts everything; the rest are for specific moments.

## Before you start

1. Your folder should look like this:
   ```
   ps.pdf
   CLAUDE.md
   .claude/settings.json
   docs/  (PLAN.md, PROMPTS.md, RECORDINGS.md, HINDI_CLIPS.md)
   eval/  (scripts.json)
   ```
2. Install if missing: **Node.js 20+**, **git**, **Chrome**. Check with `node -v` and `git --version`.
3. Open a terminal in the folder and start Claude Code with a session name, so you can resume it by name later:
   ```
   claude -n awaaz
   ```
4. Permission mode: press `Shift+Tab` until the status line shows **Auto**. In Auto, risky actions get blocked instead of asking you, so Claude Code keeps working while you sleep. (If Auto isn't offered, use **Accept edits**; `.claude/settings.json` pre-approves npm, node, Playwright and git commands, but anything else will wait for you.)
5. **Before you sleep:** plug in the charger, set sleep to "Never" while plugged in (Mac: run `caffeinate -dims` in a second terminal), keep the lid open, keep Wi-Fi on, and don't close the terminal.
6. Paste **Prompt 1**.

When you wake up: open `docs/PROGRESS.md` and start with the **WHEN YOU WAKE UP** list. If Claude Code has stopped (laptop slept, usage limit, error), run `claude --resume awaaz` and paste Prompt 2.

Useful keys and commands: `Esc` stops Claude Code immediately · type a message and press Enter to steer it while it works · `Esc` twice rewinds file changes · `/context` shows how full the context is · `/compact` summarises the conversation · `claude --resume awaaz` reopens this session.

---

## Prompt 1 — Kickoff (overnight, unattended)

```
Read CLAUDE.md and docs/PLAN.md, then skim ps.pdf pages 7, 10–11 and 13–15.

I'm going to sleep now and won't reply until about 10:00 IST. Work fully on your own.

First, write at most 10 lines at the top of docs/PROGRESS.md: what we're building, the 3 riskiest parts, and anything in the plan that conflicts with ps.pdf. Then start building straight away.

Go through Phases 0 → 5 of docs/PLAN.md in order. For each phase: write a 5-line plan in docs/PROGRESS.md, build it, run that phase's acceptance checks (automate them with Vitest and Playwright, since nobody can click or speak tonight), fix what fails, update docs/PROGRESS.md, commit "phase N: <summary>", and push. If the push fails, keep committing locally.

Rules for tonight:
- Don't end your turn or ask me anything while there's work you can do. When Phases 0–5 are done, continue with "If you finish early" in the plan.
- Anything that needs me goes in the "WHEN YOU WAKE UP" checklist at the top of docs/PROGRESS.md, with exact steps. Then carry on with other work.
- Run `date` at the start of each phase and follow the time boxes and cut lines.
- Make reasonable calls yourself and log each one in docs/DECISIONS.md.
- Never: add diagnosis or clinical suggestions, put generated text into a record, write new Hindi, invent numbers or citations, commit secrets or files over 50 MB, or force-push.

Start now.
```

## Prompt 2 — Resume (new session, crash, or after /clear)

```
Read CLAUDE.md and docs/PROGRESS.md. Run `date`, `git log --oneline -15` and `git status`. Tell me in 3 lines where we are and what's next, then continue in autopilot from the next unfinished task in docs/PLAN.md.
```

## Prompt 3 — One phase at a time (use instead of Prompt 1 if autopilot drifts)

```
Do only Phase <N> from docs/PLAN.md. Start by listing its acceptance checks, then build until every check passes. Update docs/PROGRESS.md, commit "phase <N>: <summary>", push, and stop. Tell me in 5 lines what works, what doesn't, and any ACTION FOR USER.
```

For Phase 2 specifically, add: `Start by turning eval/scripts.json into failing Vitest cases, then implement until green. Report field accuracy on the 10 reference texts.`

## Prompt 4 — My recordings are in

```
My voice recordings are now in recordings/ (S01–S10 plus S01_noisy, S02_noisy, S06_noisy). Run npm run eval on them and regenerate docs/EVALUATION.md from the results. Add the top 3 extraction failures caused by speech recognition to docs/PROGRESS.md with a proposed fix for each. Fix any that takes under 20 minutes without hurting the reference-text scores, re-run the eval, then commit and push. Then continue with the plan.
```

## Prompt 5 — Hindi clips are in

```
The ElevenLabs Hindi clips are in public/audio/hi/, named by clip ID from docs/HINDI_CLIPS.md (e.g. consent.mp3). Build or refresh public/audio/hi/manifest.json, list any clip IDs that have no file, make sure all clips are cached for offline use, and test the playlist for S01, S03 and S04. Do not change any Hindi text. Commit and push, then continue with the plan.
```

## Prompt 6 — We're behind schedule

```
Run `date` and compare with the time boxes in docs/PLAN.md. If we're behind, apply the cut lines now: write what you're cutting and why in docs/PROGRESS.md, then continue with the remaining P0 items only. Never cut a non-negotiable from CLAUDE.md.
```

## Prompt 7 — Bug report

```
Bug: I did <steps> → I saw <what happened> → I expected <what should happen>. Reproduce it, find the root cause, fix it (add a test if it's in extraction), and tell me in 3 lines what was wrong.
```

## Prompt 8 — Judge audit (around 12:45)

```
Act as a strict judge for Challenge 04 using ps.pdf pages 7 and 10–11. Audit the repo and the running app against every rule on p.7, the AI guardrails, the pass/fail "Responsible AI, data and safety" criterion, and each weighted criterion. Output a table: requirement → pass / partial / fail → evidence (file or screen) → fix. Then fix every "fail" and the cheapest "partials", in priority order. Commit and push.
```

## Prompt 9 — Video script

```
Write docs/VIDEO_SCRIPT.md for a 3:30 video, as a table with time, what I say, and what's on screen. Cover everything ps.pdf p.10 asks for, in this order: the problem statement sentence (exact template, with our real evidence), the AI capabilities and why SMS / a spreadsheet / a search can't do this job, the guardrails, the end-to-end demo with the phone switched to offline on camera, where the tool sits in the health worker's day plus the tech stack, and a placeholder for "Your take" that I'll write myself. Use only numbers from docs/EVALUATION.md and sources cited in the README. Keep sentences short and easy to say out loud.
```

## Prompt 10 — Final check before recording (around 14:00)

```
Final check before I record the video: run tests and build; confirm the live GitHub Pages URL loads (and tell me exactly how to verify offline mode on my phone); make sure the README has every section listed in docs/PLAN.md Phase 5; no TODOs left except "Your take"; no secrets or large files in git; everything pushed. Then give me the live URL and a 5-line project summary I can paste into the submission form.
```

## Prompt 11 — Context is getting full

If `/context` shows the window is nearly full, run:

```
/compact keep the current phase and task, open bugs, files changed in this phase, and decisions not yet logged
```

If CC still seems confused afterwards: `/clear`, then paste Prompt 2.
