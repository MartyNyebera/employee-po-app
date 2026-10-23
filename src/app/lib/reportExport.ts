// Shared by the Accounting reports. The server builds the whole .xlsx (server/xlsx.js) from the same
// query and filters the screen uses and hands it back as base64 JSON, so nothing here touches a peso
// figure: the file cannot disagree with the table.
type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

export async function downloadXlsx(api: Api, path: string, options?: RequestInit): Promise<{ filename: string; rowCount: number }> {
  const r = await api<{ filename: string; mime: string; base64: string; rowCount: number }>(path, options);
  // base64 -> bytes: the only "arithmetic" on the way to the file, and it is on characters.
  const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
  const a = document.createElement('a');
  a.href = url; a.download = r.filename;
  document.body.appendChild(a); a.click(); a.remove();
  // Revoked on a delay: revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { filename: r.filename, rowCount: r.rowCount };
}

/** Today's date and this month's first/last day on Manila's calendar, as YYYY-MM-DD. */
export function manilaMonth(): { today: string; first: string; last: string } {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const [y, m] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { today, first: `${y}-${pad(m)}-01`, last: `${y}-${pad(m)}-${pad(lastDay)}` };
}

/** Builds a query string from the non-empty entries. */
export function qsOf(o: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== '' && v !== null && v !== undefined && v !== false) p.set(k, String(v === true ? 1 : v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
