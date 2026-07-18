import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchApi } from '../../api/client';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { S } from './crmKit';
import { SummaryStats } from '../SummaryStats';

// #6 — admin-side report of delivery discrepancies. Received purchase orders record a per-line
// Ordered / Received / Defective breakdown in received_lines; this flattens every received PO
// and surfaces only the lines that came up short (received < ordered) or arrived defective. It
// is a record, not an action — nothing here re-orders; it just makes shortfalls reviewable.
interface ReceivedLine { itemName?: string; ordered?: number; received?: number; defective?: number }
interface PurchaseOrder {
  id: string; poNumber: string; client?: string; prNumber?: string | null;
  receivedBy?: string | null; receivedAt?: string | null; receivedLines?: ReceivedLine[] | null;
}
interface DiscrepancyRow {
  poNumber: string; client: string; prNumber: string | null; receivedAt: string | null;
  itemName: string; ordered: number; received: number; missing: number; defective: number;
}

export function DeliveryDiscrepancies() {
  const [rows, setRows] = useState<DiscrepancyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const orders = await fetchApi<PurchaseOrder[]>('/purchase-orders?status=RECEIVED');
      const flat: DiscrepancyRow[] = [];
      for (const po of orders || []) {
        for (const l of po.receivedLines || []) {
          const ordered = Number(l.ordered) || 0;
          const received = Number(l.received) || 0;
          const defective = Number(l.defective) || 0;
          const missing = Math.max(0, ordered - received);
          if (missing > 0 || defective > 0) {
            flat.push({
              poNumber: po.poNumber, client: po.client || '—', prNumber: po.prNumber || null,
              receivedAt: po.receivedAt || null, itemName: l.itemName || '—',
              ordered, received, missing, defective,
            });
          }
        }
      }
      setRows(flat);
    } catch (e: any) { if (!silent) toast.error(e.message || 'Failed to load discrepancies'); }
    finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useLiveRefresh(() => load({ silent: true }));

  const missingLines = rows.filter(r => r.missing > 0).length;
  const defectiveLines = rows.filter(r => r.defective > 0).length;
  const affectedPOs = new Set(rows.map(r => r.poNumber)).size;

  return (
    <div style={S.page}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={S.h1}>Delivery Discrepancies</h1>
        <p style={S.sub}>Received purchase-order lines that arrived short of what was ordered, or with defective units. A record for follow-up — no re-order is raised automatically.</p>
      </div>

      <SummaryStats items={[
        { label: 'Discrepant lines', value: rows.length, accent: true },
        { label: 'Short lines', value: missingLines },
        { label: 'Defective lines', value: defectiveLines },
        { label: 'Affected POs', value: affectedPOs },
      ]} />

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>PO #</th><th style={S.th}>Supplier</th><th style={S.th}>Item</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Ordered</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Received</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Missing</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Defective</th>
            <th style={S.th}>Received</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={8}>Loading…</td></tr>
              : rows.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={8}>No discrepancies — every received line matched its order.</td></tr>
              : rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>
                    {r.poNumber}
                    {r.prNumber && <div style={{ fontWeight: 400, fontSize: '11px', color: '#8a8a8a' }}>for {r.prNumber}</div>}
                  </td>
                  <td style={S.td}>{r.client}</td>
                  <td style={S.td}>{r.itemName}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{r.ordered}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{r.received}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: r.missing > 0 ? '#b91c1c' : '#8a8a8a' }}>{r.missing}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: r.defective > 0 ? '#b91c1c' : '#8a8a8a' }}>{r.defective}</td>
                  <td style={S.td}>{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
