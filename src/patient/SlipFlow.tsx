import { useMemo, useState } from 'react';
import { PlaylistPanel } from './PlaylistPanel';
import { SlipView } from './SlipView';
import { TimingCard } from './TimingCard';
import { buildSlip, type SlipTiming } from './slip';
import type { VisitRecord } from '../record/schema';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useVault } from '../app/vault';

interface Props {
  record: VisitRecord;
  /** true right after saving, to say so; false when a saved record is opened again */
  justSaved?: boolean;
  onDone?: () => void;
}

/** After Confirm: the saved notice, the timing check, the slip to print, and the Hindi instructions. */
export function SlipFlow({ record, justSaved = false, onDone }: Props) {
  const vault = useVault();
  const [overrides, setOverrides] = useState<Record<string, SlipTiming>>({});
  const [clinic, setClinic] = useState(vault.settings.clinicName);
  const slip = useMemo(() => buildSlip(record, vault.settings.clinicName, overrides), [record, vault.settings.clinicName, overrides]);

  return (
    <div className="space-y-5">
      {justSaved && (
        <div data-testid="confirmed" className="no-print space-y-1 rounded-xl border-2 border-ok bg-ok-bg p-4 text-ok">
          <p className="flex items-center gap-2 text-xl font-bold">
            <Icon name="check" /> Record confirmed and saved
          </p>
          <p>It is locked with your PIN on this phone. The recording has been deleted. Nothing was added by the app.</p>
        </div>
      )}

      <form
        className="no-print space-y-2 rounded-xl border border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void vault.saveClinicName(clinic);
        }}
      >
        <label className="block space-y-1">
          <span className="block text-base font-bold text-ink-soft">Clinic name on the slip (optional)</span>
          <input className="min-h-12 w-full rounded-xl border-2 border-line px-3 text-lg" value={clinic} onChange={(e) => setClinic(e.target.value)} data-testid="clinic-name" />
        </label>
        <Button variant="secondary" type="submit" disabled={clinic.trim() === vault.settings.clinicName} data-testid="clinic-save">
          Save the clinic name
        </Button>
      </form>

      <TimingCard
        medications={record.medications}
        overrides={overrides}
        onChange={(id, timing) =>
          setOverrides((o) => {
            const next = { ...o };
            if (timing) next[id] = timing;
            else delete next[id];
            return next;
          })
        }
      />

      <SlipView slip={slip} />

      <Button icon="print" onClick={() => window.print()} className="no-print" data-testid="print-slip">
        Print the slip
      </Button>

      <PlaylistPanel record={record} />

      {onDone && (
        <Button variant="secondary" onClick={onDone} className="no-print" data-testid="next-visit">
          Start another visit
        </Button>
      )}
    </div>
  );
}
