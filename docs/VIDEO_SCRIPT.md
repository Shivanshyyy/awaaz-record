# Video script (about 4:00 with your take; the limit is 2:00 to 5:00)

Written to be said out loud: short sentences, plain words. Every number comes from `docs/EVALUATION.md` or a source listed in the README ("Sources I opened"). The three marked ⚑ come from the evaluation: **if you record your own voice and re-run `npm run eval`, read the new numbers from `docs/EVALUATION.md` before you record, and change them here.**

ps.pdf p.10 asks the video to cover, in this order: the problem sentence, the AI and why not something simpler, the guardrails, the end-to-end demo, where the tool sits in the worker's day plus the tech stack, and your take.

## Before you record (10 minutes)

1. Open the live app in Chrome on your computer. Press `F12`, then the device icon, and pick 360 × 740. Or record on the phone itself.
2. Set it up beforehand: *Set up offline* (wait for "Ready offline"), set your PIN, reload once.
3. Know the note you will speak. Use script S01 or S04 from `docs/RECORDINGS.md`, read slowly. If the app mishears a name or a medicine, **leave it in**: showing the amber question and fixing it is the best part of the demo.
4. If the Hindi clips are ready, check the sound plays. If not, the screen shows the Hindi text and says "audio not available": say so, it is honest.
5. Plan to show **airplane mode being switched on, on camera**, before the demo.

## Script

| Time | What I say | On screen |
|---|---|---|
| 0:00 | Because of this tool, a health worker at a primary health centre in India will finish a checked record of the visit, and give the patient a slip and a Hindi voice message, before the patient leaves the room. | Title card: **Awaaz Record**. Then the *Today* screen. |
| 0:14 | Otherwise she writes it up later, in a hurry, or not at all. | Same screen. |
| 0:19 | We know the problem is real. In a review of 67 countries, four Indian studies measured consultations of 1.5 to 2.3 minutes. India's health ministry talks about the burden of work on health workers. And patients forget 40 to 80 percent of what they are told. | Three source cards, one at a time: Irving et al., BMJ Open 2017 · Health ministry, PIB 2024 · Kessels, 2003. Each shows its one quoted line from the README. |
| 0:42 | The AI does one thing: speech recognition. A small English Whisper model runs on the phone and turns a spoken note into text. | The architecture diagram from the README, highlighting *Whisper tiny.en on the phone*. |
| 0:52 | Everything after that is not generative. Plain word lists and rules fill a fixed record. A simpler tool, like SMS or a spreadsheet, cannot turn a spoken note into a checked record, and cannot show where each value came from. A tick-box form could do the same job, with more tapping. I have not yet timed a real worker, so that is a design idea, not a result. | Split screen: a spreadsheet next to the review screen. |
| 1:14 | Guardrails. No diagnosis, ever. Every value points to the words it came from. The app asks, it does not guess. And she cannot confirm while anything is amber or red. | The review screen: tap a row, the words are highlighted, the *Play* button. Then Confirm greyed out under "2 to check · 1 missing". |
| 1:32 | Now the demo. First, I switch off the network. | Phone or browser: switch on **airplane mode**, on camera. Show "Ready offline" in the header. |
| 1:40 | The patient is asked first. The app plays a Hindi message and shows me what it says in English. She agrees. | *New visit*: consent screen, English meaning, tap *Play consent in Hindi*, then *Patient agreed*. |
| 1:52 | I record a short note. | Record the note (cut to the end of it): "Patient Noor, thirty-eight years. Complains of fever for three days. Temperature one hundred and one. Gave paracetamol five hundred milligrams three times a day for three days. Review after three days." |
| 2:05 | It is written down on the phone, with no internet. Everything it is unsure of is a question. Here it misheard the name. I tap *Hear it*, listen, and fix it. | Review screen. Tap *Hear it* on the name, edit it. Resolve any amber item. Summary turns green: "Everything is checked". |
| 2:25 | Now I confirm. The record is saved, locked with my PIN. The recording is deleted. | Tap *Confirm record*, enter the PIN. The "Record confirmed and saved" banner. |
| 2:35 | The patient gets this slip: first name and age only, medicine times as pictures and words, the date to come back, and a Hindi line under each item. A QR code holds a short summary. | The slip. Scroll slowly past the icons, the Hindi lines and the QR. |
| 2:50 | And she hears her instructions in Hindi. I see every line in English first and can untick what I do not want. | The playlist. Tick or untick one line, press *Play the ticked lines*. |
| 3:00 | Where does it sit in her day? She sets it up once on Wi-Fi. Then, for each patient: consent, speak, check, confirm, slip. Records wait for a signal, and follow-ups show up as tasks. It is a web app with no server: React, Whisper on ONNX Runtime in the browser, and an encrypted local database. | The *Tasks* screen (urgent referral first), then the *Records* screen with "N waiting for signal". Then the tech stack line. |
| 3:15 | I tested it honestly. On computer-voice test audio ⚑ the app got about 71 percent of the fields right, and 43 values were wrong. 19 of those looked fine, mostly names and ages. That is why a person must check. Real voices are still to be tested, and the Hindi lines still need a Hindi speaker. | The results table from the README (the generated block). |
| 3:30 to 4:00 | **[YOUR TAKE: write and say this yourself, about 30 seconds. Prompts: The clinic writes in English but Noor understands Hindi. What does that gap mean to you? Why does it matter that her voice never leaves the phone? What did a small model get wrong, and what would fix that locally?]** | You, or the app's *Today* screen. |

The spoken lines above are 468 words (counted), about 3 minutes 20 seconds at an easy pace of 140 words a minute. Your take adds about 30 seconds, so the video should land near 4:00. If you run over 5:00, cut the "simpler tool" sentence and shorten the tech-stack line.

## Words to avoid

Do not say: "accurate", "reliable" or "ready for clinics". Do say: "pipeline check", "pending real voices", "a person checks". The evaluation says the same.

## After recording

Upload, set the link to open without sign-in, and put it in the submission form with the live URL and the repo link.
