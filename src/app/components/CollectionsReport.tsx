// ============================================================================
// Collections Report -- every non-voided payment logged against a billing invoice, in a date range.
// Read-only and derived: GET /api/reports/collections sums everything in SQL, this file formats it.
// The footer total and the by-client summary come from the same query as the rows, so they cannot
// disagree; the Excel export is built server-side from the same filters.
//
// `isAdmin` is the caller's "may manage billing" answer, required like the other accounting screens
// and handed on to Receivables, where a row opens its invoice; this report itself has no write action.
// ============================================================================
import { useEffect, useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { S, TableScroll, tightTh, tightTd, peso, shortDate, oneLine } from './crm/crmKit';
import { downloadXlsx, manilaMonth, qsOf } from '../lib/reportExport';

type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

interface CollectionRow {
  id: number; paidOn: string; biId: number; biNumber: string; client: string;
  orNumber: string | null; reference: string | null; amount: string;
}
interface CollectionsData {
  rows: CollectionRow[]; total: string; count: number;
  summary: { client: string; payments: number; total: string }[];
  voidedExcluded: number; clients: string[];
}

export function CollectionsReport({ api, isAdmin: _isAdmin, onOpenInvoice }: {
  api: Api; isAdmin: boolean;
  /** Opens that invoice in Receivables. */
  onOpenInvoice: (biId: number) => void;
}) {
  const month = manilaMonth();
  const [from, setFrom] = useState(month.first);
  const [to, setTo] = useState(month.last);
  const [client, setClient] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');           // the debounced search actually sent
  const [byClient, setByClient] = useState(false);
  const [data, setData] = useState<CollectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const params = { from, to, client, q };
  useEffect(() => {
    let off = false;
    setLoading(true);
    api<CollectionsData>(`/reports/collections${qsOf(params)}`)
      .then(d => { if (!off) setData(d); })
      .catch((e: any) => { if (!off) { toast.error(e.message || 'Failed to load the collections report'); setData(null); } })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, client, q]);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const r = await downloadXlsx(api, `/reports/collections/export${qsOf({ ...params, summary: byClient })}`);
      toast.success(`Exported ${r.rowCount} ${r.rowCount === 1 ? 'row' : 'rows'} — ${r.filename}`);
    } catch (e: any) { toast.error(e.message || 'Export failed'); } finally { setExporting(false); }
  };

  const filtered = !!(client || q || from !== month.first || to !== month.last);
  const rows = data?.rows ?? [];
  const input = { ...S.input, width: 'auto' } as React.CSSProperties;

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h1 style={S.h1}>Collections Report</h1>
          <p style={S.sub}>Every payment received against a billing invoice. Voided payments are left out.</p>
        </div>
        <button onClick={exportXlsx} disabled={exporting || !data || (byClient ? data.summary.length === 0 : rows.length === 0)} style={{ ...S.addBtn, opacity: exporting || !data ? 0.6 : 1 }}>
          <Download size={15} style={{ marginRight: '6px' }} />{exporting ? 'Exporting…' : 'Export to Excel'}
        </button>
      </div>

      <div style={{ ...S.card, padding: '12px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '14px', overflow: 'visible' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '200px' }}>
          <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search OR No., BI No. or client…" style={{ ...S.input, paddingLeft: '34px' }} />
        </div>
        <label style={{ fontSize: '11px', color: '#5a5a5a' }}>From<br /><input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} style={input} /></label>
        <label style={{ fontSize: '11px', color: '#5a5a5a' }}>To<br /><input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} style={input} /></label>
        <label style={{ fontSize: '11px', color: '#5a5a5a' }}>Client<br />
          <select value={client} onChange={e => setClient(e.target.value)} style={{ ...input, maxWidth: '240px', cursor: 'pointer' }}>
            <option value="">All clients</option>
            {(data?.clients ?? []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', paddingBottom: '9px', cursor: 'pointer' }}>
          <input type="checkbox" checked={byClient} onChange={e => setByClient(e.target.checked)} /> Summary by client
        </label>
        {filtered && (
          <button style={{ ...S.rowBtn, marginLeft: 0, marginBottom: '4px' }} onClick={() => { setFrom(month.first); setTo(month.last); setClient(''); setSearch(''); }}>
            <X size={12} style={{ verticalAlign: 'middle' }} /> Reset
          </button>
        )}
      </div>

      {data && data.voidedExcluded > 0 && (
        <p style={{ fontSize: '12px', color: '#8a8a8a', margin: '0 0 10px' }}>
          {data.voidedExcluded} voided payment{data.voidedExcluded === 1 ? '' : 's'} in this range {data.voidedExcluded === 1 ? 'was' : 'were'} left out.
        </p>
      )}

      {loading && !data ? <div style={{ color: '#8a8a8a', fontSize: '14px', padding: '30px 0' }}>Loading…</div> : (
        <TableScroll>
          {byClient ? (
            <table style={S.table}>
              <thead><tr>
                <th style={tightTh}>Client</th>
                <th style={{ ...tightTh, textAlign: 'right' }}>Payments</th>
                <th style={{ ...tightTh, textAlign: 'right' }}>Total collected</th>
              </tr></thead>
              <tbody>
                {(data?.summary ?? []).length === 0 ? (
                  <tr><td style={{ ...tightTd, color: '#8a8a8a' }} colSpan={3}>No payments in this range.</td></tr>
                ) : data!.summary.map(s => (
                  <tr key={s.client} style={{ cursor: 'pointer' }} title="Show this client's payments" onClick={() => { setClient(s.client); setByClient(false); }}>
                    <td style={{ ...tightTd, maxWidth: '420px' }}><div style={oneLine} title={s.client}>{s.client}</div></td>
                    <td style={{ ...tightTd, textAlign: 'right', whiteSpace: 'nowrap' }}>{s.payments}</td>
                    <td style={{ ...tightTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{peso(Number(s.total))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td style={{ ...tightTd, fontWeight: 700, background: '#f7f7f7' }}>Total — {data?.summary.length ?? 0} client{data?.summary.length === 1 ? '' : 's'}</td>
                <td style={{ ...tightTd, textAlign: 'right', fontWeight: 700, background: '#f7f7f7' }}>{data?.count ?? 0}</td>
                <td style={{ ...tightTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, background: '#f7f7f7' }}>{peso(Number(data?.total ?? 0))}</td>
              </tr></tfoot>
            </table>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={tightTh}>Date received</th>
                <th style={tightTh}>Client</th>
                <th style={tightTh}>BI No.</th>
                <th style={tightTh}>OR No.</th>
                <th style={tightTh}>Reference</th>
                <th style={{ ...tightTh, textAlign: 'right', paddingRight: '16px' }}>Amount</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td style={{ ...tightTd, color: '#8a8a8a' }} colSpan={6}>No payments match.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} title="Open this invoice in Receivables" onClick={() => onOpenInvoice(r.biId)}>
                    <td style={{ ...tightTd, whiteSpace: 'nowrap' }}>{shortDate(r.paidOn)}</td>
                    <td style={{ ...tightTd, maxWidth: '280px' }}><div style={oneLine} title={r.client}>{r.client}</div></td>
                    <td style={{ ...tightTd, whiteSpace: 'nowrap', fontWeight: 600 }}>{r.biNumber}</td>
                    <td style={{ ...tightTd, whiteSpace: 'nowrap' }}>{r.orNumber || '—'}</td>
                    <td style={{ ...tightTd, maxWidth: '200px' }}><div style={oneLine} title={r.reference || undefined}>{r.reference || '—'}</div></td>
                    <td style={{ ...tightTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, paddingRight: '16px' }}>{peso(Number(r.amount))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td style={{ ...tightTd, fontWeight: 700, background: '#f7f7f7' }} colSpan={5}>Total collected — {data?.count ?? 0} payment{data?.count === 1 ? '' : 's'}</td>
                <td style={{ ...tightTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, background: '#f7f7f7', paddingRight: '16px' }}>{peso(Number(data?.total ?? 0))}</td>
              </tr></tfoot>
            </table>
          )}
        </TableScroll>
      )}
    </div>
  );
}
