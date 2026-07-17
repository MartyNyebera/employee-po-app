import { useEffect } from 'react';

const SUFFIX = 'Kimoel Tracking System';

/**
 * Names the browser tab after the portal you're in.
 *
 * index.html carries a single static <title>, so every portal used to read
 * "Kimoel Tracking System" — indistinguishable once a few tabs are open. Each portal calls
 * this with its own name; the favicon (the logo) stays shared, so tabs are told apart by
 * their title.
 *
 * @param title the portal's name, e.g. "Production". Pass null to leave the title alone.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} — ${SUFFIX}`;
    // Restore on unmount so a portal doesn't leave its name on whatever renders next.
    return () => { document.title = previous; };
  }, [title]);
}
