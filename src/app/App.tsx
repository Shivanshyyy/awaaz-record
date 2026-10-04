import { useEffect } from 'react';
import { RouterProvider, useRouter } from './router';
import { APP_NAME, TABS } from './meta';
import { Icon } from '../ui/Icon';
import { TodayScreen } from './screens/TodayScreen';
import { NewVisitScreen } from './screens/NewVisitScreen';
import { RecordsScreen } from './screens/RecordsScreen';
import { TasksScreen } from './screens/TasksScreen';
import { PrepareScreen } from './screens/PrepareScreen';
import { AboutScreen } from './screens/AboutScreen';
import { RecordScreen } from './screens/RecordScreen';
import { VaultProvider } from './vault';
import { OfflineBadge } from './OfflineBadge';
import { UpdateBanner } from './UpdateBanner';
import { refreshOfflineStatus } from './offline-store';
import { useVisit, VisitProvider } from './visit';

function Screen() {
  const { route } = useRouter();
  switch (route.name) {
    case 'today':
      return <TodayScreen />;
    case 'new':
      return <NewVisitScreen />;
    case 'records':
      return <RecordsScreen />;
    case 'tasks':
      return <TasksScreen />;
    case 'prepare':
      return <PrepareScreen />;
    case 'about':
      return <AboutScreen />;
    case 'record':
      return <RecordScreen id={route.id} />;
  }
}

// Tests read this to prove the recording is gone after Confirm. It holds no patient data.
function AudioProbe() {
  const { hasAudio } = useVisit();
  return <span hidden data-testid="audio-state" data-has-audio={String(hasAudio)} />;
}

function BottomNav() {
  const { route, go } = useRouter();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-xl">
        {TABS.map((tab) => {
          const active = route.name === tab.name;
          return (
            <li key={tab.name} className="flex-1">
              <button
                type="button"
                onClick={() => go({ name: tab.name }, { replace: true })}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-16 w-full flex-col items-center justify-center gap-0.5 border-t-4 text-xs font-semibold ${
                  active ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-transparent text-ink-soft'
                }`}
              >
                <Icon name={tab.icon} />
                <span>{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function App() {
  useEffect(() => {
    void refreshOfflineStatus();
    const onControl = () => void refreshOfflineStatus();
    navigator.serviceWorker?.addEventListener('controllerchange', onControl);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', onControl);
  }, []);

  return (
    <RouterProvider>
      <VaultProvider>
      <VisitProvider>
        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 bg-brand-700 px-4 text-white">
            <h1 className="text-lg font-bold">{APP_NAME}</h1>
            <OfflineBadge />
          </header>
          <AudioProbe />
          <UpdateBanner />
          <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-24 pt-4">
            <Screen />
          </main>
          <BottomNav />
        </div>
      </VisitProvider>
      </VaultProvider>
    </RouterProvider>
  );
}
