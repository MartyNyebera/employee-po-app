// "Export to Excel" for a list screen. The screen hands over the ids of the rows it is SHOWING, in the
// order it shows them; the server (server/listExports.js) re-reads exactly those rows and builds the
// workbook, so the file cannot disagree with the table whatever filter, search or status chip is on.
// Same look and position as the button on the Collections Report (S.addBtn, top right of the header).
import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { S } from './crm/crmKit';
import { downloadXlsx } from '../lib/reportExport';

type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

export function ExportXlsxButton({ api, path, ids, from, to, extra, disabled }: {
  api: Api; path: string;
  /** Ids of the rows currently shown, in display order. */
  ids: (string | number)[];
  /** The screen's own date range, when it has one (only used to name the file). */
  from?: string; to?: string;
  /** Any further screen state the server needs (for example which tab or period is open). */
  extra?: Record<string, unknown>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await downloadXlsx(api, path, { method: 'POST', body: JSON.stringify({ ids, from: from || undefined, to: to || undefined, ...(extra || {}) }) });
      toast.success(`Exported ${r.rowCount} ${r.rowCount === 1 ? 'row' : 'rows'} — ${r.filename}`);
    } catch (e: any) { toast.error(e.message || 'Export failed'); } finally { setBusy(false); }
  };
  const off = busy || disabled || ids.length === 0;
  return (
    <button onClick={run} disabled={off} style={{ ...S.addBtn, opacity: off ? 0.6 : 1, whiteSpace: 'nowrap' }}>
      <Download size={15} style={{ marginRight: '6px' }} />{busy ? 'Exporting…' : 'Export to Excel'}
    </button>
  );
}
