import { useEffect, useRef } from 'react';

/**
 * Runs `fn` immediately, then on an interval. Pauses when the tab is hidden and
 * refetches on return. `enabled=false` suspends the loop without unmounting.
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number, enabled = true) {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const run = () => { if (!stopped && !document.hidden) void saved.current(); };

    run(); // immediate
    const id = window.setInterval(run, intervalMs);
    const onVisible = () => { if (!document.hidden) void saved.current(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled]);
}
