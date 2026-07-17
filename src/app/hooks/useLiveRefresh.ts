import { useEffect, useRef } from 'react';

// Keeps a screen's data live without a manual browser refresh. There is no websocket/SSE
// infrastructure here and no query library, so this is a deliberately small, defensive poll.
//
// It does four things, and every one of them exists to avoid a specific bug:
//   1. Polls `refresh` on an interval — BUT only while the tab is actually visible. A
//      backgrounded tab does nothing, so we don't hammer the live production DB for screens
//      nobody is looking at.
//   2. Refreshes immediately when the tab becomes visible or regains focus. THIS is what fixes
//      "I had to refresh the browser": coming back to a tab re-syncs it at once, not in 20s.
//   3. Never runs two refreshes at once (an `inFlight` guard), and never lets a slow older
//      response overwrite a newer one (a monotonic `seq` guard). Without these, overlapping
//      polls race and can flash stale data.
//   4. Can be paused via `enabled`. Callers pass `enabled: !busy` so a background poll can't
//      fire — and can't replace the list out from under — while a mutation is in flight or a
//      blocking modal is open.
//
// `refresh` MUST be a SILENT refetch (no loading-spinner toggle, no error toast). A background
// poll that flips the full-screen "Loading…" state every 20s, or toasts on a blip, is exactly
// the kind of bug this feature is prone to. The caller owns that: it passes a `silent` variant.
export function useLiveRefresh(
  refresh: () => Promise<void>,
  opts: { intervalMs?: number; enabled?: boolean } = {},
) {
  const { intervalMs = 20000, enabled = true } = opts;

  // Hold the latest refresh fn in a ref so the effect doesn't re-subscribe every render (the
  // caller almost always passes a fresh closure). The effect depends only on interval/enabled.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const inFlight = useRef(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const run = async () => {
      // A hidden tab is not worth a query — the visibility listener below will catch us up the
      // instant the user returns.
      if (document.visibilityState !== 'visible') return;
      if (inFlight.current) return; // don't overlap with a still-running refresh
      inFlight.current = true;
      const mine = ++seq.current;
      try {
        await refreshRef.current();
        // If a newer run started (or the component unmounted) while we awaited, drop this one.
        // The refresh itself has already set state, so this guard is belt-and-braces for any
        // caller that returns data to apply rather than setting state internally.
        if (cancelled || mine !== seq.current) return;
      } catch {
        // A failed background poll is a non-event: swallow it. The next tick retries, and a
        // real 401 is handled by the caller's own fetch helper exactly as it is on mount.
      } finally {
        inFlight.current = false;
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') run(); };

    const id = setInterval(run, intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [intervalMs, enabled]);
}
