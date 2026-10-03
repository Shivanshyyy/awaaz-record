import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TabName } from './meta';

export type Route = { name: TabName | 'prepare' } | { name: 'record'; id: string };

interface Router {
  route: Route;
  go(route: Route, opts?: { replace?: boolean }): void;
  back(): void;
}

const RouterContext = createContext<Router | null>(null);
const HOME: Route = { name: 'today' };

function readRoute(state: unknown): Route {
  const saved = (state as { route?: Route } | null)?.route;
  return saved ?? HOME;
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => readRoute(history.state));

  useEffect(() => {
    const onPop = (e: PopStateEvent) => setRoute(readRoute(e.state));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: Route, opts?: { replace?: boolean }) => {
    if (opts?.replace) history.replaceState({ route: next }, '');
    else history.pushState({ route: next }, '');
    setRoute(next);
  }, []);

  const back = useCallback(() => history.back(), []);
  const value = useMemo(() => ({ route, go, back }), [route, go, back]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): Router {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside RouterProvider');
  return ctx;
}
