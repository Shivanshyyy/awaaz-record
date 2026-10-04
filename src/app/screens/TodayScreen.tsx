import { useEffect, useState } from 'react';
import type { VisitRecord } from '../../record/schema';
import { listRecords, listTasks } from '../../store/db';
import { patientLabel, type Task } from '../../store/tasks';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useRouter } from '../router';
import { today as todayIso } from '../visit';
import { useVault } from '../vault';

export function TodayScreen() {
  const { go } = useRouter();
  const vault = useVault();
  const day = todayIso();
  const [visits, setVisits] = useState<VisitRecord[] | null>(null);
  const [due, setDue] = useState<Task[]>([]);
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  useEffect(() => {
    if (vault.status !== 'unlocked' || !vault.key) {
      setVisits(null);
      return;
    }
    void Promise.all([listRecords(vault.key), listTasks(vault.key)]).then(([records, tasks]) => {
      setVisits(records.filter((r) => r.visitDate === day));
      setDue(tasks.filter((t) => !t.done && t.dueDate !== null && t.dueDate <= day));
    });
  }, [vault.status, vault.key, day]);

  return (
    <section aria-labelledby="today-title" className="space-y-4">
      <div>
        <h2 id="today-title" className="text-2xl font-bold">
          Today
        </h2>
        <p className="text-ink-soft">{date}</p>
      </div>

      {vault.status === 'no-pin' ? (
        <p data-testid="today-empty" className="rounded-xl border border-line p-4 text-ink-soft">
          Nothing is saved on this phone yet. Start a new visit, or look around with the demo visits.
        </p>
      ) : vault.status === 'locked' ? (
        <p data-testid="today-locked" className="flex gap-2 rounded-xl border border-line p-4 text-ink-soft">
          <Icon name="lock" /> Saved records are locked. Open Records and enter your PIN to see today’s summary.
        </p>
      ) : visits === null ? null : (
        <div className="space-y-3" data-testid="today-summary">
          <p className="rounded-xl border border-line p-4">
            <span className="block text-3xl font-bold">{visits.length}</span>
            <span className="text-ink-soft">{visits.length === 1 ? 'visit' : 'visits'} recorded today</span>
          </p>
          {visits.length > 0 && (
            <ul className="space-y-1 text-lg">
              {visits.map((v) => (
                <li key={v.id}>
                  {patientLabel(v)}
                  {v.synthetic ? <span className="ml-2 rounded-full border-2 border-dashed border-ink px-2 text-xs font-bold uppercase">Synthetic</span> : null}
                </li>
              ))}
            </ul>
          )}
          <p className={`rounded-xl border-2 p-4 ${due.length ? 'border-check bg-check-bg text-check' : 'border-line text-ink-soft'}`}>
            <span className="block text-3xl font-bold">{due.length}</span>
            {due.length === 1 ? 'follow-up' : 'follow-ups'} due or overdue
          </p>
          {due.length > 0 && (
            <Button variant="secondary" onClick={() => go({ name: 'tasks' })}>
              See the tasks
            </Button>
          )}
        </div>
      )}

      <Button onClick={() => go({ name: 'new' })} data-testid="start-visit">
        Start a new visit
      </Button>
      <Button variant="secondary" onClick={() => go({ name: 'records' })}>
        Look around with demo visits
      </Button>
      <Button variant="secondary" onClick={() => go({ name: 'about' })} data-testid="about-link">
        About, evidence and limits
      </Button>
    </section>
  );
}
