import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

/** Indonesian message for anything the api layer can throw. Shown to the user verbatim. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Terjadi kesalahan. Coba lagi.';
}

/** Reads a numeric API error code without rendering it. */
export function errorCode(e: unknown): string {
  return e instanceof ApiError ? e.code : 'UNKNOWN';
}

/** Details array from a 409 (used by BOOKING_CONFLICT). */
export function errorDetails<T>(e: unknown): T[] {
  return e instanceof ApiError && Array.isArray(e.details) ? (e.details as T[]) : [];
}

export interface Async<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: (d: T | null) => void;
}

/**
 * Load-on-mount with loading/error/reload. Every list and detail page needs
 * exactly these four things; `deps` re-runs it when a filter changes.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(fn);
  latest.current = fn;
  const alive = useRef(true);

  const reload = useCallback(async () => {
    alive.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await latest.current();
      if (alive.current) setData(result);
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload, setData };
}

/** Debounces a value — search inputs fire on a 300 ms pause. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
