# Voice notes to record (synthetic test set)

These are **scripted, made-up** visit notes. Never record real patients. Claude Code uses them to measure how well speech recognition and extraction work (`npm run eval`).

## How to record
- Use your phone's voice recorder (any format is fine: m4a, mp3, wav…) or your laptop.
- **Quiet room** for the normal versions. For the 3 `_noisy` versions, turn on a fan or a TV in the background.
- Speak naturally, like a busy health worker dictating, but clearly. Hold the phone about 30 cm away.
- Read each script **exactly** as written. Numbers are written as words on purpose: say them that way. If you stumble or change a word, record that one again (the eval compares against the exact text).
- One file per script, named exactly: `S01`, `S02` … `S10`, plus `S01_noisy`, `S02_noisy`, `S06_noisy` (keep the file extension your recorder gives).
- Put all 13 files in the `recordings/` folder, then paste Prompt 4 into Claude Code.

13 files, about 15–20 seconds each. Total: around 15 minutes including retakes.

## Scripts

**S01** (also record `S01_noisy`)
> Patient Noor, thirty-eight years. Complains of fever for three days. Temperature one hundred and one. Gave paracetamol five hundred milligrams three times a day for three days. Review after three days.

**S02** (also record `S02_noisy`)
> Patient Ramesh, fifty-two. Sneezing and runny nose for one week, worse in the mornings. BP one forty over ninety. Pulse eighty-eight. Gave cetirizine ten milligrams once at night for five days. Follow up in one week.

**S03**
> Patient Sunita, twenty-six, seven months pregnant. Swelling of feet and headache since yesterday. BP one sixty over one hundred and ten. Referred to the district hospital today. Follow up after delivery.

**S04**
> Patient baby Aarav, two years, brought by mother. Loose motions since two days. Gave O R S after every loose stool, and zinc twenty milligrams once daily for fourteen days. Advised mother to continue breastfeeding and give plenty of fluids. Review in five days.

Say "O R S" as three separate letters.

**S05**
> Patient Lakshmi, sixty years. Pain in both knees for two months. Gave diclofenac fifty milligrams twice a day after food for five days. Sorry, make that ibuprofen four hundred milligrams twice a day after food for five days. Review in two weeks.

**S06** (also record `S06_noisy`)
> Patient Kavita, thirty-three. Burning while passing urine for two days. Temperature ninety-nine point eight. Gave nitrofurantoin one hundred milligrams twice a day for five days. Advised to drink plenty of water.

Pronunciation help: nitrofurantoin = *nye-tro-fyoo-RAN-toe-in*.

**S07**
> Patient Mohan, seventy. Came for a blood pressure check. BP one fifty over ninety-five. Weight sixty-two kilos. Continue amlodipine five milligrams once daily. Review in one month.

Pronunciation help: amlodipine = *am-LOH-di-peen*.

**S08**
> Okay so, patient Imran, twenty-nine. He was saying it is very hot these days. Anyway, headache and body ache since morning. Temperature normal. Gave paracetamol six fifty, one tablet three times a day for two days. If not better, come back.

**S09**
> Patient Geeta, forty-one. Blurred vision for distance, slowly over six months. No pain. Referred to the eye hospital in the district for a check-up. Follow up on Monday.

**S10**
> Patient Raju, eight years, brought by father. Ear pain for two days. Temperature thirty-eight point two. Gave amoxicillin two hundred and fifty milligrams three times a day for five days, and paracetamol syrup when needed for pain. Review after five days.

## What each one tests
| Script | Tests |
|---|---|
| S01 | Basic note, number words, temperature unit worked out from the value |
| S02 | BP and pulse, "once at night", a distracting "worse in the mornings" |
| S03 | Urgent referral, "seven months pregnant" must not be read as the complaint duration, unclear follow-up |
| S04 | A child, "O R S", a medicine with no dose, two medicines, advice |
| S05 | A spoken correction ("sorry, make that"), "after food" |
| S06 | Missing follow-up (must turn red), decimal temperature, a hard drug name |
| S07 | A check-up with no symptoms, weight, "continue" = ongoing medicine |
| S08 | Small talk to ignore, "temperature normal", a dose with no unit |
| S09 | "No pain" (negation), non-urgent referral, "on Monday" |
| S10 | Celsius temperature, two medicines, a syrup "when needed" with no dose |

The exact expected results are in `eval/scripts.json`.
