import { addDays } from '../record/rows';
import type { VisitRecord } from '../record/schema';

export interface Task {
  id: string;
  recordId: string;
  kind: 'follow-up' | 'referral';
  /** first name and age, nothing more */
  patient: string;
  /** what to do, in plain English */
  title: string;
  /** YYYY-MM-DD, or null when no day was given */
  dueDate: string | null;
  urgent: boolean;
  done: boolean;
}

export function patientLabel(record: VisitRecord): string {
  const first = (record.patient.name.value ?? '').trim().split(/\s+/)[0] ?? '';
  const age = record.patient.ageYears.value;
  return [first || 'Patient', age !== null ? `${age < 2 ? `${Math.round(age * 12)} months` : `${age} y`}` : ''].filter(Boolean).join(', ');
}

/** The follow-up and the referral become tasks, so nothing depends on anyone remembering. */
export function tasksFor(record: VisitRecord): Task[] {
  const who = patientLabel(record);
  const tasks: Task[] = [];
  const follow = record.followUp.value;
  let followDue: string | null = null;
  if (follow?.kind === 'days') followDue = addDays(record.visitDate, follow.days);
  if (follow?.kind === 'date') followDue = follow.date;
  if (followDue) {
    tasks.push({ id: `${record.id}:follow-up`, recordId: record.id, kind: 'follow-up', patient: who, title: 'Follow-up visit', dueDate: followDue, urgent: false, done: false });
  }
  const referral = record.referral.value;
  if (referral) {
    const place = referral.to ?? 'a hospital';
    tasks.push({
      id: `${record.id}:referral`,
      recordId: record.id,
      kind: 'referral',
      patient: who,
      title: referral.urgent ? `Urgent referral to ${place}: check the patient went today` : `Referred to ${place}: check the patient went`,
      dueDate: referral.urgent ? record.visitDate : followDue,
      urgent: referral.urgent,
      done: false,
    });
  }
  return tasks;
}

/** Urgent referrals first, then overdue, then by due date; tasks with no date last. */
export function sortTasks(tasks: Task[], today: string): Task[] {
  const rank = (t: Task) => (t.urgent && t.kind === 'referral' ? 0 : t.dueDate !== null && t.dueDate < today ? 1 : t.dueDate !== null ? 2 : 3);
  return [...tasks].sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.patient.localeCompare(b.patient));
}

export function dueText(task: Task, today: string): string {
  if (!task.dueDate) return 'No date given';
  const days = Math.round((Date.parse(`${task.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  return `Overdue by ${-days} ${-days === 1 ? 'day' : 'days'}`;
}
