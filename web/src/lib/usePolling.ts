import { useEffect, useRef } from 'react';

/**
 * Runs `fn` immediately, then on an interval. Pauses when the tab is hidden and
 * refetches on return. `enabled=false` suspends the loop without unmounting.
 *
 * A tick is skipped while the previous request is still running: overlapping
 * requests let a slow answer overwrite a fresh one (FE-020).
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number, enabled = true) {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;
    const run = () => {
      if (stopped || document.hidden || running) return;
      running = true;
      void Promise.resolve(saved.current()).finally(() => { running = false; });
    };

    run(); // immediate
    const id = window.setInterval(run, intervalMs);
    const onVisible = () => { if (!document.hidden) run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled]);
}
