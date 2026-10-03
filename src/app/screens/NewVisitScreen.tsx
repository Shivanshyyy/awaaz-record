const STEPS = ['Patient consent', 'Record the visit note', 'Check the record', 'Confirm and save', 'Patient slip and Hindi audio'];

export function NewVisitScreen() {
  return (
    <section aria-labelledby="new-title" className="space-y-4">
      <h2 id="new-title" className="text-2xl font-bold">
        New visit
      </h2>
      <ol className="space-y-2">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
