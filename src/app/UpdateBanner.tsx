import { Button } from '../ui/Button';
import { useUpdateReady } from './pwa';

export function UpdateBanner() {
  const apply = useUpdateReady();
  if (!apply) return null;
  return (
    <div role="status" className="border-b border-line bg-check-bg px-4 py-3 text-check">
      <p className="mb-2 font-semibold">A new version is ready. Finish the current visit first, then update.</p>
      <Button variant="secondary" onClick={apply}>
        Update now
      </Button>
    </div>
  );
}
