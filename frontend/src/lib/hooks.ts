import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, toApiError } from './api';

export interface Polled<T> {
  /** Latest data from the server. Kept on screen while a later refresh fails. */
  data: T | undefined;
  /** Why the most recent refresh failed, or undefined if it worked. */
  error: ApiError | undefined;
  /** True until the first answer (success or failure) has arrived. */
  loading: boolean;
  /** Fetch now, without waiting for the next tick. Used right after the user does something. */
  refresh: () => Promise<void>;
}

/**
 * Calls `fetcher` now and then every `intervalMs`, so the page stays current without a reload.
 * Pass `null` to switch it off. Change `key` when the fetcher starts meaning something else
 * (e.g. a different student), which discards the old data.
 */
export function usePolling<T>(fetcher: (() => Promise<T>) | null, intervalMs: number, key: string): Polled<T> {
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({ loading: fetcher !== null });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const generation = useRef(0); // bumped whenever older answers must be ignored
  const inFlight = useRef(false);

  const run = useCallback(async (force: boolean) => {
    const current = fetcherRef.current;
    if (!current) return;
    // A routine tick never piles up behind a slow request; a forced refresh always goes out.
    if (inFlight.current && !force) return;

    const mine = force ? ++generation.current : generation.current;
    inFlight.current = true;
    try {
      const data = await current();
      if (mine === generation.current) setState({ data, loading: false });
    } catch (error) {
      if (mine === generation.current) setState((previous) => ({ ...previous, error: toApiError(error), loading: false }));
    } finally {
      if (mine === generation.current) inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    generation.current++;
    inFlight.current = false;
    if (!fetcherRef.current) {
      setState({ loading: false });
      return;
    }

    setState({ loading: true });
    void run(false);
    const timer = setInterval(() => void run(false), intervalMs);
    // Coming back to the tab after a while: refresh immediately instead of showing stale numbers.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run(false);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      generation.current++;
    };
  }, [key, intervalMs, run]);

  const refresh = useCallback(() => run(true), [run]);

  return { data: state.data, error: state.error, loading: state.loading, refresh };
}

/** The current time, re-rendering the component every `intervalMs`. Drives the countdown. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** A text value that is remembered in the browser, so it is still there after a refresh or restart. */
export function useStoredString(storageKey: string, initialValue = ''): [string, (value: string) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? initialValue;
    } catch {
      return initialValue;
    }
  });

  const update = useCallback(
    (next: string) => {
      setValue(next);
      try {
        if (next) localStorage.setItem(storageKey, next);
        else localStorage.removeItem(storageKey);
      } catch {
        // Storage unavailable: the value still works for this visit.
      }
    },
    [storageKey],
  );

  return [value, update];
}

export type Route =
  | { page: 'classes' }
  | { page: 'applications' }
  | { page: 'application'; holdId: string }
  | { page: 'admin' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [first, second] = path.split('/');
  if (first === 'applications' && second) return { page: 'application', holdId: decodeURIComponent(second) };
  if (first === 'applications') return { page: 'applications' };
  if (first === 'admin') return { page: 'admin' };
  return { page: 'classes' };
}

export function routeHref(route: Route): string {
  switch (route.page) {
    case 'applications':
      return '#/applications';
    case 'application':
      return `#/applications/${encodeURIComponent(route.holdId)}`;
    case 'admin':
      return '#/admin';
    default:
      return '#/classes';
  }
}

/** Tiny hash router: the address bar and the back button work, with no server configuration. */
export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    window.location.hash = routeHref(next);
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);

  return [route, navigate];
}
