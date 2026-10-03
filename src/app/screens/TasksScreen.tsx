import { useEffect, useState } from 'react';
import { listTasks, saveTask } from '../../store/db';
import { dueText, sortTasks, type Task } from '../../store/tasks';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { VaultGate } from '../PinScreen';
import { today } from '../visit';
import { useVault } from '../vault';

function TaskList() {
  const vault = useVault();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const load = () => {
    if (vault.key) void listTasks(vault.key).then(setTasks);
  };
  useEffect(load, [vault.key]);
  if (!tasks) return <p className="text-ink-soft">Opening the tasks…</p>;
  const day = today();
  const open = sortTasks(tasks.filter((t) => !t.done), day);
  const done = tasks.filter((t) => t.done);
  return (
    <div className="space-y-4">
      {open.length === 0 ? (
        <p className="rounded-xl border border-line p-4 text-ink-soft">No follow-ups waiting.</p>
      ) : (
        <ul className="space-y-2" data-testid="task-list">
          {open.map((t) => {
            const overdue = t.dueDate !== null && t.dueDate < day;
            const tone = t.urgent && t.kind === 'referral' ? 'border-missing bg-missing-bg' : overdue ? 'border-check bg-check-bg' : 'border-line';
            return (
              <li key={t.id} data-testid={`task-${t.kind}`} className={`space-y-2 rounded-xl border-2 p-3 ${tone}`}>
                <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
                  {t.urgent && t.kind === 'referral' ? <><Icon name="x" size={18} /> Urgent referral</> : overdue ? <><Icon name="alert" size={18} /> Overdue</> : <><Icon name="check" size={18} /> {t.kind === 'follow-up' ? 'Follow-up' : 'Referral'}</>}
                </p>
                <p className="text-xl font-bold">{t.patient}</p>
                <p className="text-lg">{t.title}</p>
                <p className="text-base font-semibold text-ink-soft">{dueText(t, day)}</p>
                <Button
                  variant="secondary"
                  data-testid={`task-done-${t.kind}`}
                  onClick={async () => {
                    await saveTask(vault.key!, { ...t, done: true });
                    load();
                  }}
                >
                  Mark as done
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {done.length > 0 && <p className="text-ink-soft">{done.length} done</p>}
    </div>
  );
}

export function TasksScreen() {
  return (
    <section aria-labelledby="tasks-title" className="space-y-4">
      <h2 id="tasks-title" className="text-2xl font-bold">
        Tasks
      </h2>
      <VaultGate why="Tasks come from saved records, which are locked with your PIN. Enter it to see them.">
        <TaskList />
      </VaultGate>
    </section>
  );
}
