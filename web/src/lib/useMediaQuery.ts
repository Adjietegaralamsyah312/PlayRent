import { useEffect, useState } from 'react';

/**
 * Tracks a CSS media query. Re-renders on change, so the layout can swap
 * markup instead of only restyling it (used where two layouts differ, not
 * just two sizes of the same thing).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);

  return matches;
}
