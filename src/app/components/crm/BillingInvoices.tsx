// ============================================================================
// Billing Invoices + Receivables — stage 2 of billing, and the same family of document as the
// delivery receipt next door (DeliveryReceipts.tsx): an internal working copy whose number comes
// from a physical BIR booklet, void-never-delete, Accounting + admin.
//
// THE RULE THIS SCREEN ENFORCES BY DESIGN: the invoice mirrors the client's purchase order. The
// totals block is filled in from the item lines (lib/biTotals.ts) as a starting point, and every box
// stays editable so the accountant can match the PO exactly. What is stored and printed is what the
// boxes show when she saves; the server recomputes nothing but the line amounts.
//
// A BI is always raised from a DR, which is what ties it to one trading deal or project and means
// the line descriptions never get retyped.
//
// Two screens, one file, because they are two views of the same rows: BillingInvoices is the
// document list, Receivables is the money.
// ============================================================================

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Ban, FileText, Search, Coins, ChevronDown, ChevronRight, AlertTriangle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { printBillingInvoice } from '../../lib/billingInvoicePrint';
import { computeBiTotals, type BiBox, type VatTreatment, type Withholding } from '../../lib/biTotals';
import { S, Modal, Field, TextInput, TextArea, PrimaryBtn, GhostBtn, pill, peso, TableScroll, tightTh, tightTd, stickyTh, stickyTd, shortDate, oneLine } from './crmKit';

type Api = <T = any>(path: string, init?: RequestInit) => Promise<T>;

// The stored JSONB line shape, snake_case as the server writes it.
export interface BiLine {
  description: string;
  quantity: number | string;
  unit?: string | null;
  unit_price?: number | string | null;
  amount?: number | string | null;
}

export interface Payment {
  id: number; billingInvoiceId: number;
  amount: string; paidOn: string;
  orNumber?: string | null; reference?: string | null; notes?: string | null;
  createdBy?: string | null; createdAt?: string | null;
  voidedAt?: string | null; voidedBy?: string | null; voidReason?: string | null;
}

export interface Bi {
  id: number; serialNo?: string | null; biNumber: string;
  deliveryReceiptId: number; drNumber?: string | null; drDate?: string | null;
  sourceKind: 'trading' | 'project'; sourceName?: string | null;
  customerId?: string | null;
  billedTo: string; billedAddress?: string | null; billedTin?: string | null;
  saleType: 'cash' | 'charge' | string;
  biDate: string; paymentTerms?: string | null;
  dueDate?: string | null; dueDate2?: string | null; dpPercent?: number | null;
  items: BiLine[];
  vatableSales?: string | null; vatExemptSales?: string | null; zeroRatedSales?: string | null;
  vatAmount?: string | null; lessVat?: string | null; netOfVat?: string | null;
  lessDiscount?: string | null; lessWithholding?: string | null;
  totalAmountDue: string;
  // Derived server-side, never stored.
  paidTotal: string; balance: string; paymentCount: number;
  status: 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'voided' | string;
  overdue: boolean; amountOverdue: string; overpaidAmount?: string;
  createdBy?: string | null; createdAt?: string | null;
  voidedAt?: string | null; voidedBy?: string | null; voidReason?: string | null;
  payments?: Payment[];
}

interface DrOption {
  id: number; drNumber: string; drDate: string; deliveredTo: string;
  sourceKind: string; sourceName?: string | null; voidedAt?: string | null;
}

interface SourceDr {
  drId: number; drNumber: string; drDate: string;
  sourceKind: string; sourceName?: string | null;
  customerId?: string | null;
  billedTo: string; billedAddress: string; billedTin: string; paymentTerms: string;
  items: BiLine[];
  existingInvoices: { id: number; biNumber: string; voidedAt?: string | null }[];
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : '');
const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const money2 = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);

const STATUS_TONE: Record<string, 'good' | 'pending' | 'bad'> = {
  paid: 'good', partial: 'pending', unpaid: 'pending', voided: 'bad',
};

// Overpaid gets its own amber badge rather than a tone from crmKit, which has no warning
// tone — and it must not look like a clean settlement. It says the amount, because "overpaid"
// alone does not tell the accountant whether it is a centavo of rounding or a misplaced digit.
const overpaidBadge = (amount: string | undefined) => (
  <span style={{
    padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
    color: '#b45309', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', whiteSpace: 'nowrap',
  }}>
    {`Overpaid \u2212${peso(num(amount ?? 0))}`}
  </span>
);

// The one place either screen decides what badge an invoice wears.
function statusBadge(bi: Bi) {
  if (bi.voidedAt) return <span title={bi.voidReason ? `Reason: ${bi.voidReason}` : undefined}>{pill('Voided', 'bad')}</span>;
  if (bi.status === 'overpaid') return overpaidBadge(bi.overpaidAmount);
  if (bi.status === 'paid') return pill('Paid', 'good');
  return pill(bi.status === 'partial' ? 'Partly paid' : 'Unpaid', STATUS_TONE[bi.status] || 'pending');
}

// Terms the accountant reaches for most. The field stays free text — terms vary per PO.
const BI_TERMS_PRESETS = ['COD', '7 days', '15 days', '30 days', '60 days', '50% DP, 50% net 30'];

// ============================================================================
// 1. THE DOCUMENT LIST
// ============================================================================
// `isAdmin` — see the note on DeliveryReceipts: the caller derives it from the permission
// matrix, view-only keeps the list and the print, and the server stays the real gate.
export function BillingInvoices({ api, isAdmin }: { api: Api; isAdmin: boolean }) {
  const [rows, setRows] = useState<Bi[]>([]);
  const [drs, setDrs] = useState<DrOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<Bi | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [bis, drList] = await Promise.all([
        api<Bi[]>('/billing-invoices'),
        api<DrOption[]>('/delivery-receipts').catch(() => []),
      ]);
      setRows(bis || []);
      // Only a live DR can be billed; the server refuses a voided one anyway.
      setDrs((drList || []).filter(d => !d.voidedAt));
    } catch (e: any) { toast.error(e.message || 'Failed to load billing invoices'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.biNumber.toLowerCase().includes(q) ||
      r.billedTo.toLowerCase().includes(q) ||
      (r.drNumber || '').toLowerCase().includes(q) ||
      (r.sourceName || '').toLowerCase().includes(q));
  }, [rows, search]);

  const confirmVoid = async () => {
    if (!voiding) return;
    if (!voidReason.trim()) { toast.error('A reason is required to void a billing invoice'); return; }
    setVoidBusy(true);
    try {
      const updated = await api<Bi>(`/billing-invoices/${voiding.id}/void`, { method: 'POST', body: JSON.stringify({ reason: voidReason.trim() }) });
      setRows(rs => rs.map(r => (r.id === voiding.id ? updated : r)));
      toast.success(`BI No. ${voiding.biNumber} voided`);
      setVoiding(null); setVoidReason('');
    } catch (e: any) { toast.error(e.message || 'Could not void'); } finally { setVoidBusy(false); }
  };

  const onPrint = (bi: Bi) => {
    const r = printBillingInvoice({
      biNumber: bi.biNumber, biDate: dayOnly(bi.biDate), saleType: bi.saleType,
      billedTo: bi.billedTo, billedAddress: bi.billedAddress, billedTin: bi.billedTin,
      paymentTerms: bi.paymentTerms, items: bi.items || [],
      vatableSales: bi.vatableSales, vatExemptSales: bi.vatExemptSales, zeroRatedSales: bi.zeroRatedSales,
      vatAmount: bi.vatAmount, lessVat: bi.lessVat, netOfVat: bi.netOfVat,
      lessDiscount: bi.lessDiscount, lessWithholding: bi.lessWithholding,
      totalAmountDue: bi.totalAmountDue, voidedAt: bi.voidedAt,
    });
    if (!r.ok) toast.error(r.error || 'Could not open the print window');
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={S.h1}>Billing Invoices</h1>
          <p style={S.sub}>Raised from a delivery receipt. The figures mirror the client&rsquo;s purchase order; the number comes from the booklet.</p>
        </div>
        {isAdmin && (
          <button style={{ ...S.addBtn, color: '#000000' }} onClick={() => setCreating(true)}>
            <Plus size={16} style={{ marginRight: '6px' }} /> New Billing Invoice
          </button>
        )}
      </div>

      <div style={{ position: 'relative', maxWidth: '340px', marginBottom: '20px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: '#8a8a8a' }} />
        <input placeholder="Search BI no., client, DR no.…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, paddingLeft: '36px' }} />
      </div>

      <TableScroll>
        <table style={S.table}>
          <thead><tr>
            <th style={tightTh}>BI No.</th><th style={tightTh}>Date</th><th style={tightTh}>Billed to</th>
            <th style={tightTh}>From DR</th><th style={tightTh}>Sale</th>
            <th style={{ ...tightTh, textAlign: 'right' }}>Total due</th>
            <th style={tightTh}>Status</th><th style={stickyTh}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={8}>Loading…</td></tr>
              : filtered.length === 0 ? (
                <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={8}>
                  {rows.length === 0 ? 'No billing invoices issued yet.' : 'No billing invoices match that search.'}
                </td></tr>
              ) : filtered.map(bi => (
                <tr key={bi.id} style={bi.voidedAt ? { opacity: 0.6 } : undefined}>
                  <td style={{ ...tightTd, fontWeight: 600, color: '#000000', whiteSpace: 'nowrap' }}>
                    {bi.biNumber}
                    {bi.serialNo ? <div style={{ fontSize: '11px', color: '#8a8a8a', fontWeight: 400 }}>{bi.serialNo}</div> : null}
                  </td>
                  <td style={{ ...tightTd, whiteSpace: 'nowrap' }}>{shortDate(bi.biDate) || '—'}</td>
                  <td style={{ ...tightTd, maxWidth: '220px' }}>
                    <div style={oneLine} title={bi.billedTo}>{bi.billedTo}</div>
                    {bi.billedTin ? <div style={{ fontSize: '11px', color: '#8a8a8a', whiteSpace: 'nowrap' }}>TIN {bi.billedTin}</div> : null}
                  </td>
                  <td style={{ ...tightTd, maxWidth: '200px' }}>
                    <div style={{ whiteSpace: 'nowrap' }}>{bi.drNumber || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#8a8a8a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={bi.sourceName || undefined}>{bi.sourceName || ''}</div>
                  </td>
                  <td style={{ ...tightTd, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{bi.saleType}</td>
                  <td style={{ ...tightTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{peso(num(bi.totalAmountDue))}</td>
                  <td style={{ ...tightTd, whiteSpace: 'nowrap' }}>
                    {statusBadge(bi)}
                  </td>
                  <td style={stickyTd()}>
                    <button title="Print working copy" style={S.rowBtn} onClick={() => onPrint(bi)}><Printer size={14} /></button>
                    {isAdmin && !bi.voidedAt && (
                      <button title="Void (the record is kept)" style={{ ...S.rowBtn, color: '#b91c1c' }}
                        onClick={() => { setVoiding(bi); setVoidReason(''); }}><Ban size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </TableScroll>

      {creating && (
        <CreateBiModal api={api} drs={drs}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }} />
      )}

      {voiding && (
        <Modal title={`Void BI No. ${voiding.biNumber}`} onClose={() => setVoiding(null)}
          footer={<>
            <GhostBtn onClick={() => setVoiding(null)}>Cancel</GhostBtn>
            <PrimaryBtn onClick={confirmVoid} disabled={voidBusy}>{voidBusy ? 'Voiding…' : 'Void this invoice'}</PrimaryBtn>
          </>}>
          <p style={{ fontSize: '13px', color: '#5a5a5a', marginTop: 0 }}>
            The record is kept, never deleted, and prints stamped <b>VOID</b>. The booklet number is
            <b> not</b> freed for reuse. Payments already logged against it stay on the record but it
            stops counting as a receivable.
          </p>
          {num(voiding.paidTotal) > 0 && (
            <p style={{ fontSize: '13px', color: '#b45309' }}>
              <AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> {peso(num(voiding.paidTotal))} has already been collected against this invoice.
            </p>
          )}
          <Field label="Reason *">
            <TextArea value={voidReason} onChange={e => setVoidReason(e.target.value)}
              placeholder="e.g. Wrong figures — reissued on the next sheet" />
          </Field>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// 2. CREATE. Order of the form follows the order of the work: pick the delivery, let the lines
// pre-fill, type the prices and the PO's tax figures, then write the booklet number on it.
// ============================================================================
function CreateBiModal({ api, drs, onClose, onCreated }: {
  api: Api; drs: DrOption[]; onClose: () => void; onCreated: () => void;
}) {
  const [drId, setDrId] = useState('');
  const [src, setSrc] = useState<SourceDr | null>(null);
  const [pulling, setPulling] = useState(false);
  const [items, setItems] = useState<BiLine[]>([]);

  const [billedTo, setBilledTo] = useState('');
  const [billedAddress, setBilledAddress] = useState('');
  const [billedTin, setBilledTin] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [saleType, setSaleType] = useState<'cash' | 'charge'>('charge');
  const [biNumber, setBiNumber] = useState('');
  const [biDate, setBiDate] = useState(todayLocal());
  const [paymentTerms, setPaymentTerms] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueDate2, setDueDate2] = useState('');
  const [dpPercent, setDpPercent] = useState('');
  const [saving, setSaving] = useState(false);

  // The discount is the one totals figure that is only ever typed. Strings, not numbers: a blank
  // field means "not on the PO", which is a different fact from zero, and the server stores it as NULL.
  const [t, setT] = useState({ lessDiscount: '' });
  const setTot = (k: keyof typeof t, v: string) => setT(p => ({ ...p, [k]: v }));
  // How the other totals boxes are computed from the lines, and the boxes she has typed over.
  const [treatment, setTreatment] = useState<VatTreatment>('vatable');
  const [pricesIncludeVat, setPricesIncludeVat] = useState(true);
  const [withholding, setWithholding] = useState<Withholding>('none');
  const [customWht, setCustomWht] = useState('');
  const [ovr, setOvr] = useState<Partial<Record<BiBox, string>>>({});

  // Pull the delivery's lines and client header as soon as a DR is chosen.
  useEffect(() => {
    if (!drId) { setSrc(null); setItems([]); return; }
    let cancelled = false;
    setPulling(true);
    api<SourceDr>(`/billing-invoices/source-dr/${drId}`)
      .then(d => {
        if (cancelled) return;
        setSrc(d);
        setItems((d.items || []).map(it => ({ ...it, unit_price: '', amount: '' })));
        setBilledTo(prev => (prev.trim() ? prev : d.billedTo || ''));
        setBilledAddress(prev => (prev.trim() ? prev : d.billedAddress || ''));
        setBilledTin(prev => (prev.trim() ? prev : d.billedTin || ''));
        setPaymentTerms(prev => (prev.trim() ? prev : d.paymentTerms || ''));
        setCustomerId(d.customerId ?? null);
      })
      .catch(e => { if (!cancelled) { setSrc(null); setItems([]); toast.error(e.message || 'Could not load that delivery receipt'); } })
      .finally(() => { if (!cancelled) setPulling(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drId]);

  const setLine = (i: number, k: keyof BiLine, v: string) =>
    setItems(list => list.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const removeLine = (i: number) => setItems(list => list.filter((_, j) => j !== i));
  const addLine = () => setItems(list => [...list, { description: '', quantity: '', unit: '', unit_price: '' }]);

  // The line sum — shown ONLY as a cross-check against the PO. It is never sent as the total.
  // Each line is rounded to the centavo first, as the server rounds it, so the sum matches what is stored.
  const lineSum = useMemo(
    () => items.reduce((n, it) => n + Math.round((num(it.quantity) * num(it.unit_price) + Number.EPSILON) * 100) / 100, 0),
    [items]);

  // The totals block: computed from the lines, an edited box wins, the total follows the boxes shown.
  const totals = useMemo(
    () => computeBiTotals({ lineSum, treatment, pricesIncludeVat, withholding, customWithholding: customWht, discount: t.lessDiscount }, ovr),
    [lineSum, treatment, pricesIncludeVat, withholding, customWht, t.lessDiscount, ovr]);
  const shown = totals.shown;

  // A granular project DR can be a dozen material lines the client never asked to see itemised;
  // their PO says "fabrication of X". This collapses them into one service line at the same money.
  const collapse = () => {
    if (items.length === 0) return;
    setItems([{
      description: src?.sourceName || 'Services rendered',
      quantity: 1, unit: 'lot', unit_price: money2(lineSum),
    }]);
    toast.success('Collapsed into a single service line — edit the description to match the PO');
  };

  const save = async () => {
    if (!drId) { toast.error('Pick the delivery receipt this invoice is for'); return; }
    if (!biNumber.trim()) { toast.error('Enter the BI number from the booklet'); return; }
    if (!billedTo.trim()) { toast.error('Billed-to name is required'); return; }
    if (!biDate) { toast.error('An invoice date is required'); return; }
    if (items.length === 0) { toast.error('A billing invoice needs at least one line item'); return; }
    if (items.some(it => String(it.unit_price ?? '').trim() === '')) { toast.error('Every line needs a unit price — copy it from the PO'); return; }
    if (!shown.totalAmountDue.trim()) { toast.error('Total amount due is required — enter the prices so it can be computed, or type it from the client PO'); return; }
    setSaving(true);
    try {
      await api('/billing-invoices', { method: 'POST', body: JSON.stringify({
        biNumber: biNumber.trim(),
        deliveryReceiptId: Number(drId),
        customerId: customerId || null,
        billedTo: billedTo.trim(),
        billedAddress: billedAddress.trim() || null,
        billedTin: billedTin.trim() || null,
        saleType, biDate,
        paymentTerms: paymentTerms.trim() || null,
        dueDate: dueDate || null, dueDate2: dueDate2 || null, dpPercent: dpPercent.trim() || null,
        items: items.map(it => ({
          description: String(it.description || '').trim(),
          quantity: it.quantity, unit: it.unit || '', unit_price: it.unit_price,
        })),
        ...shown,
        lessDiscount: t.lessDiscount,
      }) });
      toast.success(`BI No. ${biNumber.trim()} recorded`);
      onCreated();
    } catch (e: any) {
      toast.error(e.message || 'Could not save the billing invoice');
    } finally { setSaving(false); }
  };

  const liveBi = (src?.existingInvoices || []).filter(x => !x.voidedAt);

  // A computed box. Typing over it marks it "edited" and it then stays as typed through further line
  // edits until the reset icon puts the computed value back.
  const box = (k: BiBox, label: string, required = false) => {
    const edited = k in ovr;
    return (
      <div style={{ marginBottom: '14px' }}>
        <label style={S.label}>
          {label}
          {edited && (
            <span style={{ marginLeft: '6px', fontWeight: 600, fontSize: '10px', color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '999px', padding: '1px 6px', whiteSpace: 'nowrap' }}>
              edited
              <button type="button" title="Reset to the computed value" onClick={() => setOvr(p => { const n = { ...p }; delete n[k]; return n; })}
                style={{ marginLeft: '4px', border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#92400e', verticalAlign: 'middle' }}>
                <RotateCcw size={11} />
              </button>
            </span>
          )}
        </label>
        <TextInput value={shown[k]} onChange={e => setOvr(p => ({ ...p, [k]: e.target.value }))}
          placeholder={required ? '0.00' : '—'} inputMode="decimal" />
      </div>
    );
  };

  return (
    <Modal title="New Billing Invoice" onClose={onClose} wide
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save invoice'}</PrimaryBtn></>}>

      {/* 1 — which delivery is being billed */}
      <Field label="Bill for this delivery receipt *">
        <select value={drId} onChange={e => setDrId(e.target.value)} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
          <option value="">Select a delivery receipt…</option>
          {drs.map(d => (
            <option key={d.id} value={d.id}>
              {`DR ${d.drNumber} — ${d.deliveredTo}${d.sourceName ? ` — ${d.sourceName}` : ''}`}
            </option>
          ))}
        </select>
      </Field>
      {drs.length === 0 && (
        <p style={{ fontSize: '12px', color: '#b45309', marginTop: '-6px' }}>
          No live delivery receipts to bill. Issue a DR first — an invoice is always raised from one.
        </p>
      )}
      {liveBi.length > 0 && (
        <p style={{ fontSize: '12px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <AlertTriangle size={13} /> This delivery is already invoiced on BI No. {liveBi.map(x => x.biNumber).join(', ')}. One invoice per PO is the norm — collect in parts rather than issuing a second.
        </p>
      )}

      {/* 2 — the lines, pre-filled from the DR */}
      <div style={{ marginBottom: '14px' }}>
        <label style={S.label}>Line items — carried over from the delivery receipt; prices typed from the PO</label>
        {pulling ? <div style={{ fontSize: '13px', color: '#8a8a8a', padding: '10px 0' }}>Loading the delivery&rsquo;s lines…</div>
          : !drId ? <div style={{ fontSize: '13px', color: '#8a8a8a', padding: '10px 0' }}>Pick a delivery receipt above and its lines appear here.</div>
          : null}

        {items.length > 0 && (
          <table style={{ ...S.table, marginTop: '4px' }}>
            <thead><tr>
              <th style={S.th}>DESCRIPTION</th>
              <th style={{ ...S.th, width: '70px' }}>QTY</th>
              <th style={{ ...S.th, width: '80px' }}>UNIT</th>
              <th style={{ ...S.th, width: '110px' }}>UNIT PRICE</th>
              <th style={{ ...S.th, width: '110px', textAlign: 'right' }}>AMOUNT</th>
              <th style={{ ...S.th, width: '34px' }}></th>
            </tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td style={S.td}><TextInput value={String(it.description ?? '')} onChange={e => setLine(i, 'description', e.target.value)} /></td>
                  <td style={S.td}><TextInput value={String(it.quantity ?? '')} onChange={e => setLine(i, 'quantity', e.target.value)} /></td>
                  <td style={S.td}><TextInput value={String(it.unit ?? '')} onChange={e => setLine(i, 'unit', e.target.value)} /></td>
                  <td style={S.td}><TextInput value={String(it.unit_price ?? '')} onChange={e => setLine(i, 'unit_price', e.target.value)} inputMode="decimal" placeholder="0.00" /></td>
                  {/* qty x unit price — the one multiply, recomputed server-side on save. */}
                  <td style={{ ...S.td, textAlign: 'right', color: '#5a5a5a' }}>
                    {String(it.unit_price ?? '').trim() === '' ? '—' : peso(num(it.quantity) * num(it.unit_price))}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    <button title="Remove this line" style={{ ...S.rowBtn, color: '#b91c1c' }} onClick={() => removeLine(i)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {drId && !pulling && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
            <button onClick={addLine} style={S.rowBtn}>+ Add a line</button>
            {items.length > 1 && <button onClick={collapse} style={S.rowBtn}>Collapse into one service line</button>}
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#5a5a5a' }}>
              Sum of lines: <b>{peso(lineSum)}</b>
            </span>
          </div>
        )}
        <p style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '6px' }}>
          The totals below are computed from these lines; adjust any box to match the client&rsquo;s PO.
        </p>
      </div>

      {/* 3 — who is billed */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Registered name (billed to) *"><TextInput value={billedTo} onChange={e => setBilledTo(e.target.value)} placeholder="Client name as it should print" /></Field>
        <Field label="TIN"><TextInput value={billedTin} onChange={e => setBilledTin(e.target.value)} placeholder="000-000-000-0000" /></Field>
      </div>
      <Field label="Business address"><TextInput value={billedAddress} onChange={e => setBilledAddress(e.target.value)} /></Field>

      {/* 4 — the typed figures from the PO */}
      <div style={{ border: '1px solid #e5e5e5', borderRadius: '8px', padding: '12px 14px 2px', margin: '6px 0 14px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#000', marginBottom: '2px' }}>Copied from the client&rsquo;s purchase order</div>
        <p style={{ fontSize: '11px', color: '#8a8a8a', margin: '0 0 10px' }}>
          These figures are computed from the items above and can be adjusted to match the PO. Type over any box to set it
          yourself (it is marked &ldquo;edited&rdquo; and the reset icon brings the computed value back); the total follows the boxes as shown.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 14px', marginBottom: '10px' }}>
          <Field label="VAT treatment">
            <select value={treatment} onChange={e => setTreatment(e.target.value as VatTreatment)} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
              <option value="vatable">VATable</option>
              <option value="exempt">VAT-exempt</option>
              <option value="zero">Zero-rated</option>
            </select>
          </Field>
          <Field label="Prices include VAT">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', paddingTop: '6px', opacity: treatment === 'vatable' ? 1 : 0.5 }}>
              <input type="checkbox" checked={pricesIncludeVat} disabled={treatment !== 'vatable'} onChange={e => setPricesIncludeVat(e.target.checked)} />
              {pricesIncludeVat ? 'Yes — VAT-inclusive prices' : 'No — VAT added on top'}
            </label>
          </Field>
          <Field label="Withholding">
            <div style={{ display: 'flex', gap: '6px' }}>
              <select value={withholding} onChange={e => setWithholding(e.target.value as Withholding)} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
                <option value="none">None</option>
                <option value="1">1%</option>
                <option value="2">2%</option>
                <option value="custom">Custom amount</option>
              </select>
              {withholding === 'custom' && <TextInput value={customWht} onChange={e => setCustomWht(e.target.value)} placeholder="0.00" inputMode="decimal" />}
            </div>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 14px' }}>
          {box('vatableSales', 'VATable sales')}
          {box('vatExemptSales', 'VAT-exempt sales')}
          {box('zeroRatedSales', 'Zero-rated sales')}
          {box('lessVat', 'Less: VAT')}
          {box('netOfVat', 'Net of VAT')}
          {box('vatAmount', 'Add: VAT')}
          <Field label="Less: discount">
            <TextInput value={t.lessDiscount} onChange={e => setTot('lessDiscount', e.target.value)} placeholder="—" inputMode="decimal" />
          </Field>
          {box('lessWithholding', 'Less: withholding')}
          {box('totalAmountDue', 'TOTAL AMOUNT DUE *', true)}
        </div>
        {totals.warnings.length > 0 && (
          <div style={{ fontSize: '12px', color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '8px 10px', margin: '0 0 12px', display: 'flex', gap: '6px' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
            <div>{totals.warnings.map(w => <div key={w}>{w}</div>)}<div style={{ color: '#a16207' }}>The figures are saved as shown — this is only a heads-up.</div></div>
          </div>
        )}
      </div>

      {/* 5 — terms, collection dates and the booklet */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Sale type">
          <div style={{ display: 'flex', gap: '18px', paddingTop: '6px' }}>
            {(['charge', 'cash'] as const).map(v => (
              <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', textTransform: 'capitalize' }}>
                <input type="radio" checked={saleType === v} onChange={() => setSaleType(v)} />{v} sale
              </label>
            ))}
          </div>
        </Field>
        <Field label="Payment terms">
          <TextInput value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} list="bi-terms-presets" placeholder="e.g. 30 days" />
          <datalist id="bi-terms-presets">{BI_TERMS_PRESETS.map(p => <option key={p} value={p} />)}</datalist>
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
        <Field label="Due date"><TextInput type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field>
        <Field label="Second due date (split terms)"><TextInput type="date" value={dueDate2} onChange={e => setDueDate2(e.target.value)} /></Field>
        <Field label="Down payment %"><TextInput value={dpPercent} onChange={e => setDpPercent(e.target.value)} placeholder="e.g. 50" inputMode="decimal" /></Field>
      </div>
      <p style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '-6px' }}>
        Leave the due date blank for COD or a plain net-N term and it is worked out from the terms and the invoice date.
        For 50/50, set the down-payment date as the due date, the balance date as the second, and the DP percent.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="BI No. from the booklet *">
          <TextInput value={biNumber} onChange={e => setBiNumber(e.target.value)} placeholder="e.g. 0881" />
        </Field>
        <Field label="Invoice date *"><TextInput type="date" value={biDate} onChange={e => setBiDate(e.target.value)} /></Field>
      </div>
      <p style={{ fontSize: '11px', color: '#8a8a8a', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <FileText size={12} /> The BI number is the one pre-printed on the physical booklet — it is never generated, and each sheet can only be recorded once.
      </p>
    </Modal>
  );
}

// ============================================================================
// 3. RECEIVABLES — the same invoices, read as money owed. Balance and status are computed by the
// server from the payment rows; nothing here is stored, so it cannot drift from the collections.
// ============================================================================
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'partial', label: 'Partly paid' },
  { id: 'paid', label: 'Paid' },
  { id: 'overpaid', label: 'Overpaid' },
] as const;

// `isAdmin` — as above. A view-only caller still gets the whole ledger, the per-invoice detail
// and the payment history; it just cannot log or reverse a collection.
export function Receivables({ api, isAdmin, focusId = null }: { api: Api; isAdmin: boolean; focusId?: number | null }) {
  // The Actions column only exists for a manage caller, so every colSpan follows it.
  const COLS = isAdmin ? 10 : 9;
  const [rows, setRows] = useState<Bi[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<typeof FILTERS[number]['id']>('all');
  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<Bi | null>(null);
  const [paying, setPaying] = useState<Bi | null>(null);
  const [voidPay, setVoidPay] = useState<Payment | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await api<Bi[]>('/billing-invoices') || []); }
    catch (e: any) { toast.error(e.message || 'Failed to load receivables'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Arrived from the Collections Report: open that invoice's payment history and bring it into view.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (focusId === null || focused || loading || !rows.some(r => r.id === focusId)) return;
    setFocused(true);
    setOpen(focusId); setDetail(null);
    api<Bi>(`/billing-invoices/${focusId}`).then(setDetail).catch((e: any) => toast.error(e.message || 'Could not load the payment history'));
    setTimeout(() => document.getElementById(`bi-row-${focusId}`)?.scrollIntoView({ block: 'center' }), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, loading, rows, focused]);

  const openRow = async (bi: Bi) => {
    if (open === bi.id) { setOpen(null); setDetail(null); return; }
    setOpen(bi.id); setDetail(null);
    try { setDetail(await api<Bi>(`/billing-invoices/${bi.id}`)); }
    catch (e: any) { toast.error(e.message || 'Could not load the payment history'); }
  };

  const applyUpdated = (updated: Bi) => {
    setRows(rs => rs.map(r => (r.id === updated.id ? { ...r, ...updated } : r)));
    setDetail(updated);
  };

  const confirmVoidPayment = async () => {
    if (!voidPay) return;
    if (!voidReason.trim()) { toast.error('A reason is required to void a payment'); return; }
    setVoidBusy(true);
    try {
      const updated = await api<Bi>(`/invoice-payments/${voidPay.id}/void`, { method: 'POST', body: JSON.stringify({ reason: voidReason.trim() }) });
      applyUpdated(updated);
      toast.success('Payment voided — the balance is restored');
      setVoidPay(null); setVoidReason('');
    } catch (e: any) { toast.error(e.message || 'Could not void the payment'); } finally { setVoidBusy(false); }
  };

  const live = useMemo(() => rows.filter(r => !r.voidedAt), [rows]);
  const filtered = useMemo(() => {
    if (filter === 'all') return live;
    if (filter === 'overdue') return live.filter(r => r.overdue);
    return live.filter(r => r.status === filter);
  }, [live, filter]);

  const totals = useMemo(() => ({
    due: live.reduce((n, r) => n + num(r.totalAmountDue), 0),
    paid: live.reduce((n, r) => n + num(r.paidTotal), 0),
    // Only POSITIVE balances: an overpaid invoice owes nothing, and letting its negative
    // balance net off someone else's debt would hide both.
    balance: live.reduce((n, r) => n + Math.max(num(r.balance), 0), 0),
    overdue: live.filter(r => r.overdue).length,
    overpaid: live.filter(r => r.status === 'overpaid').length,
  }), [live]);

  return (
    <div style={S.page}>
      <div style={{ marginBottom: '18px' }}>
        <h1 style={S.h1}>Receivables</h1>
        <p style={S.sub}>What each client owes against their billing invoice. Partial collections are normal — log each one as it comes in.</p>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {[['Invoiced', peso(totals.due)], ['Collected', peso(totals.paid)], ['Outstanding', peso(totals.balance)],
          ['Overdue', String(totals.overdue)],
          ...(totals.overpaid > 0 ? [['Overpaid', String(totals.overpaid)]] : [])].map(([k, v]) => (
          <div key={k} style={{ ...S.card, padding: '10px 14px', minWidth: '140px' }}>
            <div style={{ fontSize: '11px', color: '#8a8a8a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{k}</div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: k === 'Overdue' && totals.overdue > 0 ? '#b91c1c' : k === 'Overpaid' ? '#b45309' : '#000' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{ ...S.rowBtn, background: filter === f.id ? '#000' : undefined, color: filter === f.id ? '#fff' : undefined }}>
            {f.label}
          </button>
        ))}
      </div>

      <TableScroll>
        <table style={S.table}>
          <thead><tr>
            <th style={{ ...tightTh, width: '28px' }}></th>
            <th style={tightTh}>Client</th><th style={tightTh}>BI No.</th><th style={tightTh}>Date</th>
            <th style={{ ...tightTh, textAlign: 'right' }}>Total due</th>
            <th style={{ ...tightTh, textAlign: 'right' }}>Paid</th>
            <th style={{ ...tightTh, textAlign: 'right' }}>Balance</th>
            <th style={tightTh}>Due date</th><th style={tightTh}>Status</th>
            {isAdmin && <th style={stickyTh}>Actions</th>}
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={COLS}>Loading…</td></tr>
              : filtered.length === 0 ? (
                <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={COLS}>
                  {live.length === 0 ? 'No invoices yet — nothing outstanding.' : 'Nothing matches that filter.'}
                </td></tr>
              ) : filtered.map(bi => {
                const isOpen = open === bi.id;
                // Overdue is the one thing this screen must not let slide past, so the whole row
                // carries it rather than just the pill.
                const rowStyle = bi.overdue ? { background: '#fef2f2' } : undefined;
                return (
                  <Fragment key={bi.id}>
                    <tr id={`bi-row-${bi.id}`} style={rowStyle}>
                      <td style={{ ...tightTd, cursor: 'pointer' }} onClick={() => openRow(bi)}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td style={{ ...tightTd, fontWeight: 600, color: '#000', maxWidth: '140px' }}>
                        <div style={oneLine} title={bi.billedTo}>{bi.billedTo}</div>
                      </td>
                      <td style={{ ...tightTd, maxWidth: '150px' }}>
                        <div style={{ whiteSpace: 'nowrap' }}>{bi.biNumber}</div>
                        {bi.sourceName ? <div style={{ ...oneLine, fontSize: '11px', color: '#8a8a8a' }} title={bi.sourceName}>{bi.sourceName}</div> : null}
                      </td>
                      <td style={{ ...tightTd, whiteSpace: 'nowrap' }}>{shortDate(bi.biDate)}</td>
                      <td style={{ ...tightTd, textAlign: 'right', whiteSpace: 'nowrap' }}>{peso(num(bi.totalAmountDue))}</td>
                      <td style={{ ...tightTd, textAlign: 'right', whiteSpace: 'nowrap', color: num(bi.paidTotal) > 0 ? '#15803d' : '#8a8a8a' }}>{peso(num(bi.paidTotal))}</td>
                      <td style={{ ...tightTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: bi.overdue ? '#b91c1c' : bi.status === 'overpaid' ? '#b45309' : '#000' }}>{peso(num(bi.balance))}</td>
                      <td style={{ ...tightTd, whiteSpace: 'nowrap', color: bi.overdue ? '#b91c1c' : undefined }}>
                        {shortDate(bi.dueDate) || '—'}
                        {bi.dueDate2 ? (() => {
                          const then = `then ${shortDate(bi.dueDate2)}${bi.dpPercent ? ` (${bi.dpPercent}% DP)` : ''}`;
                          return <div style={{ ...oneLine, fontSize: '11px', color: '#8a8a8a', maxWidth: '92px' }} title={then}>{then}</div>;
                        })() : null}
                      </td>
                      <td style={{ ...tightTd, whiteSpace: 'nowrap' }}>
                        {bi.overdue
                          ? <span title={`${peso(num(bi.amountOverdue))} overdue`}>{pill('Overdue', 'bad')}</span>
                          : statusBadge(bi)}
                      </td>
                      {isAdmin && (
                        <td style={stickyTd(bi.overdue ? '#fef2f2' : '#fff')}>
                          {num(bi.balance) > 0 && (
                            <button title="Record a payment" style={S.rowBtn} onClick={() => setPaying(bi)}>
                              <Coins size={14} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr>
                        <td style={{ ...S.td, background: '#fafafa' }} colSpan={COLS}>
                          {!detail ? <span style={{ color: '#8a8a8a', fontSize: '13px' }}>Loading the payment history…</span> : (
                            <div>
                              <div style={{ fontSize: '12px', color: '#5a5a5a', marginBottom: '8px' }}>
                                DR {detail.drNumber} · {detail.sourceKind} · {detail.sourceName || '—'}
                                {detail.paymentTerms ? ` · terms: ${detail.paymentTerms}` : ''}
                                {detail.overdue ? ` · ${peso(num(detail.amountOverdue))} overdue` : ''}
                                {detail.status === 'overpaid' ? ' · ' : ''}
                                {detail.status === 'overpaid' ? overpaidBadge(detail.overpaidAmount) : null}
                                {detail.status === 'overpaid'
                                  ? <span style={{ color: '#b45309' }}> &mdash; collected more than invoiced; check the payment rows below</span>
                                  : null}
                              </div>
                              {(detail.payments || []).length === 0
                                ? <div style={{ fontSize: '13px', color: '#8a8a8a' }}>No payments logged yet.</div>
                                : (
                                  <table style={S.table}>
                                    <thead><tr>
                                      <th style={S.th}>Paid on</th><th style={{ ...S.th, textAlign: 'right' }}>Amount</th>
                                      <th style={S.th}>OR No.</th><th style={S.th}>Reference</th>
                                      <th style={S.th}>Notes</th><th style={S.th}>Logged by</th>
                                      <th style={{ ...S.th, textAlign: 'right' }}></th>
                                    </tr></thead>
                                    <tbody>
                                      {(detail.payments || []).map(p => (
                                        <tr key={p.id} style={p.voidedAt ? { opacity: 0.55, textDecoration: 'line-through' } : undefined}>
                                          <td style={S.td}>{p.paidOn}</td>
                                          <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{peso(num(p.amount))}</td>
                                          <td style={S.td}>{p.orNumber || '—'}</td>
                                          <td style={S.td}>{p.reference || '—'}</td>
                                          <td style={S.td}>{p.notes || '—'}</td>
                                          <td style={{ ...S.td, fontSize: '11px', color: '#8a8a8a' }}>{p.createdBy || '—'}</td>
                                          <td style={{ ...S.td, textAlign: 'right' }}>
                                            {p.voidedAt
                                              ? <span title={p.voidReason || ''} style={{ fontSize: '11px', color: '#b91c1c' }}>voided</span>
                                              : isAdmin
                                                ? <button title="Void this payment" style={{ ...S.rowBtn, color: '#b91c1c' }}
                                                    onClick={() => { setVoidPay(p); setVoidReason(''); }}><Ban size={13} /></button>
                                                : null}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              {isAdmin && num(detail.balance) > 0 && (
                                <button style={{ ...S.rowBtn, marginTop: '8px' }} onClick={() => setPaying(detail)}>
                                  <Coins size={13} style={{ marginRight: '4px', verticalAlign: '-2px' }} /> Record a payment
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </TableScroll>

      {paying && (
        <RecordPaymentModal api={api} bi={paying}
          onClose={() => setPaying(null)}
          onSaved={(updated) => { applyUpdated(updated); setPaying(null); }} />
      )}

      {voidPay && (
        <Modal title="Void this payment" onClose={() => setVoidPay(null)}
          footer={<>
            <GhostBtn onClick={() => setVoidPay(null)}>Cancel</GhostBtn>
            <PrimaryBtn onClick={confirmVoidPayment} disabled={voidBusy}>{voidBusy ? 'Voiding…' : 'Void payment'}</PrimaryBtn>
          </>}>
          <p style={{ fontSize: '13px', color: '#5a5a5a', marginTop: 0 }}>
            {peso(num(voidPay.amount))} logged on {voidPay.paidOn}. The row is kept and struck through,
            and the balance goes back up — a reversed collection is part of the account&rsquo;s history.
          </p>
          <Field label="Reason *">
            <TextArea value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="e.g. Cheque bounced" />
          </Field>
        </Modal>
      )}
    </div>
  );
}

function RecordPaymentModal({ api, bi, onClose, onSaved }: {
  api: Api; bi: Bi; onClose: () => void; onSaved: (updated: Bi) => void;
}) {
  const balance = num(bi.balance);
  const [amount, setAmount] = useState(money2(balance));
  const [paidOn, setPaidOn] = useState(todayLocal());
  const [orNumber, setOrNumber] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // For a split-terms invoice the down payment is the figure they will actually be handed first.
  const dpAmount = bi.dpPercent ? money2(num(bi.totalAmountDue) * Number(bi.dpPercent) / 100) : null;

  const save = async () => {
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || !(num(amount) > 0)) { toast.error('Enter an amount greater than zero'); return; }
    if (!paidOn) { toast.error('A payment date is required'); return; }
    setSaving(true);
    try {
      const updated = await api<Bi>(`/billing-invoices/${bi.id}/payments`, { method: 'POST', body: JSON.stringify({
        amount: amount.trim(), paidOn,
        orNumber: orNumber.trim() || null, reference: reference.trim() || null, notes: notes.trim() || null,
      }) });
      toast.success(`${peso(num(amount))} logged against BI No. ${bi.biNumber}`);
      onSaved(updated);
    } catch (e: any) { toast.error(e.message || 'Could not log the payment'); } finally { setSaving(false); }
  };

  return (
    <Modal title={`Record a payment — BI No. ${bi.biNumber}`} onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Log payment'}</PrimaryBtn></>}>
      <p style={{ fontSize: '13px', color: '#5a5a5a', marginTop: 0 }}>
        {bi.billedTo} · invoiced {peso(num(bi.totalAmountDue))} · collected {peso(num(bi.paidTotal))} ·
        <b> outstanding {peso(balance)}</b>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Amount *"><TextInput value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" /></Field>
        <Field label="Paid on *"><TextInput type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} /></Field>
      </div>
      {dpAmount && (
        <p style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '-6px' }}>
          Split terms: the {bi.dpPercent}% down payment is {peso(num(dpAmount))}.
          <button style={{ ...S.rowBtn, marginLeft: '6px' }} onClick={() => setAmount(dpAmount)}>Use that</button>
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="OR No."><TextInput value={orNumber} onChange={e => setOrNumber(e.target.value)} placeholder="Official receipt number" /></Field>
        <Field label="Reference"><TextInput value={reference} onChange={e => setReference(e.target.value)} placeholder="Cheque / transfer ref." /></Field>
      </div>
      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything worth remembering about this collection" /></Field>
      <p style={{ fontSize: '11px', color: '#8a8a8a' }}>
        Partial payments are fine — log each collection separately and the balance follows.
      </p>
    </Modal>
  );
}
