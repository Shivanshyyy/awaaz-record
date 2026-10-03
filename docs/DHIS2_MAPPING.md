# DHIS2 mapping (prototype)

Why this exists: ps.pdf p.14 names DHIS2 as "the system your record most plausibly lands in" (it is used by ministries of health in more than 70 countries). The app can export each confirmed record as JSON in the shape of a DHIS2 event.

**What this is not.** It has not been sent to, imported into, or validated against any DHIS2 server. Every id in the file starts with `PLACEHOLDER_`; a DHIS2 administrator creates the real program, stages and data elements and replaces the ids. There is no network call: the in-app "Send (mock)" button only flips a flag on the phone.

## How a visit becomes events

One **visit event** per record, and one **medicine event** per medicine (a repeatable program stage).

| Where it comes from in the record | Placeholder data element | Suggested DHIS2 value type |
|---|---|---|
| `visitDate` | `eventDate` | date |
| patient first name + age (kept only as `note`) | `note` | text |
| `patient.ageYears` | `PLACEHOLDER_AGE_YEARS` | number |
| `complaint.terms` (joined with `; `) | `PLACEHOLDER_COMPLAINT` | long text |
| `complaint.durationDays` | `PLACEHOLDER_COMPLAINT_DURATION_DAYS` | integer ≥ 0 |
| `vitals.temp.value` / `.unit` | `PLACEHOLDER_TEMPERATURE` / `PLACEHOLDER_TEMPERATURE_UNIT` | number / text (C or F) |
| `vitals.bp.sys` / `.dia` | `PLACEHOLDER_BP_SYSTOLIC` / `PLACEHOLDER_BP_DIASTOLIC` | integer |
| `vitals.pulse`, `vitals.weightKg`, `vitals.spo2` | `PLACEHOLDER_PULSE`, `PLACEHOLDER_WEIGHT_KG`, `PLACEHOLDER_SPO2` | number |
| `advice.tags`, `advice.other` | `PLACEHOLDER_ADVICE_TAGS`, `PLACEHOLDER_ADVICE_OTHER` | long text |
| `referral.to`, `referral.urgent` | `PLACEHOLDER_REFERRAL_TO`, `PLACEHOLDER_REFERRAL_URGENT` | text / yes-no |
| `followUp.kind`, `.days`, `.date` | `PLACEHOLDER_FOLLOW_UP_KIND`, `_DAYS`, `_DATE` | text / integer / date |
| `consent.given` | `PLACEHOLDER_CONSENT_GIVEN` | yes-no |

Medicine events (stage `PLACEHOLDER_MEDICINE_STAGE`):

| Record | Placeholder data element | Type |
|---|---|---|
| `medications[].name` | `PLACEHOLDER_MEDICINE_NAME` | text |
| `.dose`, `.unit` | `PLACEHOLDER_DOSE`, `PLACEHOLDER_DOSE_UNIT` | number / text |
| `.perDay` | `PLACEHOLDER_TIMES_PER_DAY` | integer |
| `.prn` | `PLACEHOLDER_ONLY_WHEN_NEEDED` | yes-no |
| `.durationDays`, `.ongoing` | `PLACEHOLDER_DURATION_DAYS`, `PLACEHOLDER_CONTINUING` | integer / yes-no |
| `.withFood` | `PLACEHOLDER_WITH_FOOD` | text (before or after) |

## Deliberately not exported

The transcript, the audio (already deleted), the evidence spans, the record's `source` and `confirmed` fields, and the patient's full name. A real integration would send the patient as a DHIS2 tracked entity with the clinic's own identifier, not a name in free text.

## Privacy note

The export is a file the worker chooses to create. It contains patient details (first name, age, complaint, medicines), so the screen warns "share it only with your health system". Nothing is exported automatically.

## Next steps for a real integration

1. Agree the program, stages and data elements with the ministry's DHIS2 team and replace the placeholders.
2. Map the fixed lists to option sets: units (mg, g, mcg, ml, iu, units), advice tags, follow-up kinds.
3. Send with the DHIS2 events API over HTTPS from a clinic device on its own signal, with the same queue ("3 waiting for signal") and a retry that never drops a record.
4. Decide who holds the encryption key for records at the facility (today it is the worker's PIN on one phone).
