// ============================================================================
// Purchases -- a summary of every valid PO (paid ones included), with the VAT split out.
// Read-only and derived: GET /api/reports/purchases runs the Payable Report's own query and rules and
// sums everything in whole centavos, so the payment status and the Total always agree with that report
// and Net + VAT = Total on every row. This file formats; the Excel export is built server-side from the
// same filters. `isAdmin` is required like the other accounting screens; there is no write action here.
// ============================================================================
import { useEffect, useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { S, TableScroll, tightTh, tightTd, peso, shortDate, oneLine, pill, type Tone } from './crm/crmKit';
import { AllocationTag, AllocationFilter, type Allocated } from './AllocationTag';
import { downloadXlsx, manilaMonth, qsOf } from '../lib/reportExport';

type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

interface PurchaseRow extends Allocated {
  id: string; poDate: string; poNumber: string; supplier: string | null; supplierId: string | null;
  net: string; vat: string; total: string; status: string; poStatus: string;
}
interface PurchasesData {
  rows: PurchaseRow[]; count: number; net: string; vat: string; total: string;
  summary: { supplier: string; count: number; net: string; vat: string; total: string }[];
  suppliers: { id: string; name: string }[]; allocations: Allocated[];
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  unpaid: { label: 'Unpaid', tone: 'pending' }, partial: { label: 'Partly paid', tone: 'pending' },
  paid: { label: 'Paid', tone: 'good' }, overpaid: { label: 'Overpaid', tone: 'bad' },
};

export function PurchasesReport({ api, isAdmin: _isAdmin, onOpenPo }: {
  api: Api; isAdmin: boolean;
  /** Opens that purchase order (in the PO list). */
  onOpenPo: (poId: string) => void;
}) {
  const month = manilaMonth();
  const [from, setFrom] = useState(month.first);
  const [to, setTo] = useState(month.last);
  const [supplierId, setSupplierId] = useState('');
  const [alloc, setAlloc] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [bySupplier, setBySupplier] = useState(false);
  const [data, setData] = useState<PurchasesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const params = { from, to, supplierId, alloc, status, q };
  useEffect(() => {
    let off = false;
    setLoading(true);
    api<PurchasesData>(`/reports/purchases${qsOf(params)}`)
      .then(d => { if (!off) setData(d); })
      .catch((e: any) => { if (!off) { toast.error(e.message || 'Failed to load the purchases report'); setData(null); } })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, supplierId, alloc, status, q]);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const r = await downloadXlsx(api, `/reports/purchases/export${qsOf({ ...params, summary: bySupplier })}`);
      toast.success(`Exported ${r.rowCount} ${r.rowCount === 1 ? 'row' : 'rows'} — ${r.filename}`);
    } catch (e: any) { toast.error(e.message || 'Export failed'); } finally { setExporting(false); }
  };

  const filtered = !!(supplierId || alloc || status || q || from !== month.first || to !== month.last);
  const rows = data?.rows ?? [];
  const input = { ...S.input, width: 'auto' } as React.CSSProperties;
  const num = { textAlign: 'right', whiteSpace: 'nowrap' } as React.CSSProperties;
  const foot = { background: '#f7f7f7', fontWeight: 700 } as React.CSSProperties;

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h1 style={S.h1}>Purchases</h1>
          <p style={S.sub}>Every valid purchase order, paid or not, with the VAT split out. Total is the VAT-inclusive amount owed.</p>
        </div>
        <button onClick={exportXlsx} disabled={exporting || !data || (bySupplier ? data.summary.length === 0 : rows.length === 0)} style={{ ...S.addBtn, opacity: exporting || !data ? 0.6 : 1 }}>
          <Download size={15} style={{ marginRight: '6px' }} />{exporting ? 'Exporting…' : 'Export to Excel'}
        </button>
      </div>

      <div style={{ ...S.card, padding: '12px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '14px', overflow: 'visible' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px' }}>
          <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search PO no., supplier or project…" style={{ ...S.input, paddingLeft: '34px' }} />
        </div>
        <label style={{ fontSize: '11px', color: '#5a5a5a' }}>From<br /><input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} style={input} /></label>
        <label style={{ fontSize: '11px', color: '#5a5a5a' }}>To<br /><input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} style={input} /></label>
        <label style={{ fontSize: '11px', color: '#5a5a5a' }}>Supplier<br />
          <select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={{ ...input, maxWidth: '200px', cursor: 'pointer' }}>
            <option value="">All suppliers</option>
            {(data?.suppliers ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: '11px', color: '#5a5a5a' }}>Allocated to<br />
          <AllocationFilter rows={data?.allocations ?? []} value={alloc} onChange={setAlloc} style={{ ...input, maxWidth: '210px', cursor: 'pointer' }} />
        </label>
        <label style={{ fontSize: '11px', color: '#5a5a5a' }}>Payment status<br />
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
            <option value="">All</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', paddingBottom: '9px', cursor: 'pointer' }}>
          <input type="checkbox" checked={bySupplier} onChange={e => setBySupplier(e.target.checked)} /> Summary by supplier
        </label>
        {filtered && (
          <button style={{ ...S.rowBtn, marginLeft: 0, marginBottom: '4px' }}
            onClick={() => { setFrom(month.first); setTo(month.last); setSupplierId(''); setAlloc(''); setStatus(''); setSearch(''); }}>
            <X size={12} style={{ verticalAlign: 'middle' }} /> Reset
          </button>
        )}
      </div>

      {loading && !data ? <div style={{ color: '#8a8a8a', fontSize: '14px', padding: '30px 0' }}>Loading…</div> : (
        <TableScroll>
          {bySupplier ? (
            <table style={S.table}>
              <thead><tr>
                <th style={tightTh}>Supplier</th>
                <th style={{ ...tightTh, textAlign: 'right' }}>POs</th>
                <th style={{ ...tightTh, textAlign: 'right' }}>Net of VAT</th>
                <th style={{ ...tightTh, textAlign: 'right' }}>VAT</th>
                <th style={{ ...tightTh, textAlign: 'right', paddingRight: '16px' }}>Total</th>
              </tr></thead>
              <tbody>
                {(data?.summary ?? []).length === 0 ? (
                  <tr><td style={{ ...tightTd, color: '#8a8a8a' }} colSpan={5}>No purchase orders in this range.</td></tr>
                ) : data!.summary.map(s => (
                  <tr key={s.supplier}>
                    <td style={{ ...tightTd, maxWidth: '360px' }}><div style={oneLine} title={s.supplier}>{s.supplier}</div></td>
                    <td style={{ ...tightTd, ...num }}>{s.count}</td>
                    <td style={{ ...tightTd, ...num }}>{peso(Number(s.net))}</td>
                    <td style={{ ...tightTd, ...num }}>{peso(Number(s.vat))}</td>
                    <td style={{ ...tightTd, ...num, fontWeight: 600, paddingRight: '16px' }}>{peso(Number(s.total))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td style={{ ...tightTd, ...foot }}>Total — {data?.summary.length ?? 0} supplier{data?.summary.length === 1 ? '' : 's'}</td>
                <td style={{ ...tightTd, ...foot, ...num }}>{data?.count ?? 0}</td>
                <td style={{ ...tightTd, ...foot, ...num }}>{peso(Number(data?.net ?? 0))}</td>
                <td style={{ ...tightTd, ...foot, ...num }}>{peso(Number(data?.vat ?? 0))}</td>
                <td style={{ ...tightTd, ...foot, ...num, paddingRight: '16px' }}>{peso(Number(data?.total ?? 0))}</td>
              </tr></tfoot>
            </table>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={tightTh}>PO Date</th>
                <th style={tightTh}>PO No.</th>
                <th style={tightTh}>Supplier</th>
                <th style={tightTh}>Allocated to</th>
                <th style={{ ...tightTh, textAlign: 'right' }}>Net of VAT</th>
                <th style={{ ...tightTh, textAlign: 'right' }}>VAT</th>
                <th style={{ ...tightTh, textAlign: 'right' }}>Total</th>
                <th style={{ ...tightTh, paddingRight: '16px' }}>Payment status</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td style={{ ...tightTd, color: '#8a8a8a' }} colSpan={8}>No purchase orders match.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} title="Open this purchase order" onClick={() => onOpenPo(r.id)}>
                    <td style={{ ...tightTd, whiteSpace: 'nowrap' }}>{shortDate(r.poDate)}</td>
                    <td style={{ ...tightTd, whiteSpace: 'nowrap', fontWeight: 600 }}>{r.poNumber}</td>
                    <td style={{ ...tightTd, maxWidth: '170px' }}><div style={oneLine} title={r.supplier || undefined}>{r.supplier || '—'}</div></td>
                    <td style={{ ...tightTd, maxWidth: '230px', whiteSpace: 'nowrap' }}><AllocationTag a={r} maxWidth={140} /></td>
                    <td style={{ ...tightTd, ...num }}>{peso(Number(r.net))}</td>
                    <td style={{ ...tightTd, ...num }}>{peso(Number(r.vat))}</td>
                    <td style={{ ...tightTd, ...num, fontWeight: 600 }}>{peso(Number(r.total))}</td>
                    <td style={{ ...tightTd, whiteSpace: 'nowrap', paddingRight: '16px' }}>{STATUS[r.status] ? pill(STATUS[r.status].label, STATUS[r.status].tone) : r.status}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td style={{ ...tightTd, ...foot }} colSpan={4}>Total — {data?.count ?? 0} purchase order{data?.count === 1 ? '' : 's'}</td>
                <td style={{ ...tightTd, ...foot, ...num }}>{peso(Number(data?.net ?? 0))}</td>
                <td style={{ ...tightTd, ...foot, ...num }}>{peso(Number(data?.vat ?? 0))}</td>
                <td style={{ ...tightTd, ...foot, ...num }}>{peso(Number(data?.total ?? 0))}</td>
                <td style={{ ...tightTd, ...foot }}></td>
              </tr></tfoot>
            </table>
          )}
        </TableScroll>
      )}
    </div>
  );
}
