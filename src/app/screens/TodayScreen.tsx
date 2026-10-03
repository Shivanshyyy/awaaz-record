import { useRouter } from '../router';

export function TodayScreen() {
  const { go } = useRouter();
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <section aria-labelledby="today-title" className="space-y-4">
      <div>
        <h2 id="today-title" className="text-2xl font-bold">
          Today
        </h2>
        <p className="text-ink-soft">{today}</p>
      </div>
      <p className="rounded-xl border border-line p-4 text-ink-soft">No visits recorded today.</p>
      <button
        type="button"
        onClick={() => go({ name: 'new' })}
        className="min-h-12 w-full rounded-xl bg-brand-700 px-4 text-lg font-bold text-white"
      >
        Start a new visit
      </button>
    </section>
  );
}
