# Submission pack

Ready to paste into the portal. Everything here is true as of the last push; check the live link before you send it.

## Links

- **Live app:** https://shivanshyyy.github.io/awaaz-record/ (**not live until GitHub Pages is switched on**: repo → Settings → Pages → Source: GitHub Actions; then Actions → "Deploy to GitHub Pages" → Run workflow)
- **Code:** https://github.com/Shivanshyyy/awaaz-record
- **Video:** (add your link)

## Five lines for the form

1. **Awaaz Record** is an offline phone web app for a primary health centre worker in India: she speaks a 20 to 60 second English visit note, and the phone writes it down on the device and fills a fixed visit record where every value points to the words it came from.
2. **The AI is small and does one job:** Whisper tiny.en (English only, 8-bit, 44.5 MB) runs inside the browser to turn speech into text. Everything after that is plain rules and fixed word lists, so the record never contains generated text.
3. **Guardrails:** no diagnosis and no clinical advice; the app asks "not sure, please check" instead of guessing; a record cannot be confirmed while anything is amber or red; consent comes first; the recording is never stored; records are locked with the worker's PIN.
4. **For the patient:** a printed slip with medicine-timing icons, the return date and a QR summary, and 23 fixed Hindi instructions as voice and text (the Hindi still needs a check by a Hindi speaker).
5. **Honest evidence:** on computer-voice test notes 70.9% of fields were right and 19 of 43 wrong values looked fine; on real clinicians' speech from an outside dataset (PriMock57, UK English) 28.1% of words were wrong. Not yet tested on a real phone, with our own voices, or with a real worker, which is why a person checks every record.

## Check the live site from your computer (10 seconds)

`npm run check-live` asks the published site for every file the offline mode needs and ends with "All checks passed." if the sizes match their manifests.

## Check offline mode on your phone (about 5 minutes)

1. On an Android phone, open Chrome and go to the live link, on Wi-Fi.
2. Tap **Set up offline** (top right), then **Download now** (66 MB). Wait for the green **Ready offline**. If the connection drops it carries on by itself; if it gives up, tap **Try again** (files already saved are kept).
3. Reload once, so the app is controlled by its offline worker. The header should still say **Ready offline**.
4. Switch on **airplane mode**. Close the app completely and open it again from the browser: it must load.
5. **New visit** → **Play consent in Hindi** → **Patient agreed** → **Start recording** (allow the microphone) → read script S01 from `docs/RECORDINGS.md` → **Stop**. Note how many seconds the transcript takes, and what it says.
6. Review, resolve the amber items, **Confirm record**, set a PIN. Open the slip.

If anything fails, tell me exactly where. Do not record the video until step 5 works on your phone.

## Before you send

- `docs/JUDGE_AUDIT.md` lists what a strict judge would still mark partial or fail.
- Entries without a video do not reach the shortlist (ps.pdf p.10).
- The deadline in `CLAUDE.md` is 16:39 IST; ps.pdf gives only the dates, so confirm the time on the portal.
