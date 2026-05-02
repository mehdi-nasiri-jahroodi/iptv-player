import { useEffect, useState } from 'react';

/**
 * Returns a `Date` that advances on **wall-clock minute boundaries** (then every minute).
 *
 * A plain `setInterval(..., 60_000)` only fires 60s after mount, so the UI can sit one full
 * minute behind (e.g. header still showing 9:20 PM after the clock rolls to 9:21 PM).
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());

    let intervalId: ReturnType<typeof setInterval> | undefined;
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    const timeoutId = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, 60_000);
    }, msToNextMinute);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);
  return now;
}
