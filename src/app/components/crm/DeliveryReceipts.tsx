// ============================================================================
// Delivery Receipts — the CLIENT-FACING BIR delivery receipt.
//
// One DR is issued against one trading deal or one project, and its line items are PULLED from
// the purchase request(s) linked to that target, so nobody retypes a delivery note. The number is
// the one pre-printed on the physical BIR booklet and is typed in by hand: the paper is the legal
// document, and this screen records which sheet was used for what.
//
// Distinct from the internal logistics `deliveries` record (Logistics portal), which tracks a
// dispatch against a sales order and is untouched by this.
//
// Accounting + admin. The server gate (requireRole on every /delivery-receipts route) is the
// real one; this screen only decides what renders.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Ban, FileText, Search } from 'lucide-react';
import { toast } from 'sonner';
import { printBirDeliveryReceipt } from '../../lib/deliveryReceiptPrint';
import { S, Modal, Field, TextInput, TextArea, PrimaryBtn, GhostBtn, pill } from './crmKit';

type Api = <T = any>(path: string, init?: RequestInit) => Promise<T>;

interface DrLine { quantity: number | string; unit?: string | null; description: string; sourcePr?: string | null }

interface Dr {
  id: number; serialNo?: string | null; drNumber: string;
  tradingId?: string | null; projectId?: string | null;
  sourceKind: 'trading' | 'project'; sourceName?: string | null;
  customerId?: string | null;
  deliveredTo: string; deliveredAddress?: string | null; deliveredTin?: string | null;
  drDate: string; terms?: string | null; crNo?: string | null; refSalesInvoiceNo?: string | null;
  items: DrLine[];
  createdBy?: string | null; createdAt?: string | null;
  voidedAt?: string | null; voidedBy?: string | null; voidReason?: string | null;
}

interface Target { id: string; name: string; client?: string | null }
interface Customer { id: string; name: string; tin?: string | null; billingAddress?: string | null; defaultPaymentTerms?: string | null }

// A DR date is a calendar date. Built from the local Y-M-D parts rather than toISOString(),
// which would hand back yesterday for any Manila time before 08:00.
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

export function DeliveryReceipts({ api }: { api: Api }) {
  const [rows, setRows] = useState<Dr[]>([]);
  const [tradings, setTradings] = useState<Target[]>([]);
  const [projects, setProjects] = useState<Target[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  // The DR being voided, and the reason being typed. A modal rather than window.prompt, matching
  // how voiding an expense already works — and the server requires a reason, so it is asked for
  // up front instead of letting the save come back 400.
  const [voiding, setVoiding] = useState<Dr | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [drs, t, p, c] = await Promise.all([
        api<Dr[]>('/delivery-receipts'),
        api<Target[]>('/tradings').catch(() => []),
        api<Target[]>('/projects').catch(() => []),
        api<Customer[]>('/customers').catch(() => []),
      ]);
      setRows(drs || []); setTradings(t || []); setProjects(p || []); setCustomers(c || []);
    } catch (e: any) { toast.error(e.message || 'Failed to load delivery receipts'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.drNumber.toLowerCase().includes(q) ||
      r.deliveredTo.toLowerCase().includes(q) ||
      (r.sourceName || '').toLowerCase().includes(q));
  }, [rows, search]);

  const confirmVoid = async () => {
    if (!voiding) return;
    if (!voidReason.trim()) { toast.error('A reason is required to void a delivery receipt'); return; }
    setVoidBusy(true);
    try {
      const updated = await api<Dr>(`/delivery-receipts/${voiding.id}/void`, { method: 'POST', body: JSON.stringify({ reason: voidReason.trim() }) });
      setRows(rs => rs.map(r => (r.id === voiding.id ? updated : r)));
      toast.success(`DR No. ${voiding.drNumber} voided`);
      setVoiding(null); setVoidReason('');
    } catch (e: any) { toast.error(e.message || 'Could not void'); } finally { setVoidBusy(false); }
  };

  const onPrint = (dr: Dr) => {
    const r = printBirDeliveryReceipt({
      drNumber: dr.drNumber, drDate: dayOnly(dr.drDate), deliveredTo: dr.deliveredTo,
      deliveredAddress: dr.deliveredAddress, deliveredTin: dr.deliveredTin,
      terms: dr.terms, crNo: dr.crNo, refSalesInvoiceNo: dr.refSalesInvoiceNo,
      items: dr.items || [], voidedAt: dr.voidedAt,
    });
    if (!r.ok) toast.error(r.error || 'Could not open the print window');
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={S.h1}>Delivery Receipts</h1>
          <p style={S.sub}>Issued against a trading deal or project. Line items come from its purchase requests; the number comes from the booklet.</p>
        </div>
        <button style={{ ...S.addBtn, color: '#000000' }} onClick={() => setCreating(true)}>
          <Plus size={16} style={{ marginRight: '6px' }} /> New Delivery Receipt
        </button>
      </div>

      <div style={{ position: 'relative', maxWidth: '340px', marginBottom: '20px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: '#8a8a8a' }} />
        <input placeholder="Search DR no., client, deal…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, paddingLeft: '36px' }} />
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>DR No.</th><th style={S.th}>Date</th><th style={S.th}>Delivered to</th>
            <th style={S.th}>For</th><th style={S.th}>Items</th><th style={S.th}>Status</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={7}>Loading…</td></tr>
              : filtered.length === 0 ? (
                <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={7}>
                  {rows.length === 0 ? 'No delivery receipts issued yet.' : 'No delivery receipts match that search.'}
                </td></tr>
              ) : filtered.map(dr => (
                <tr key={dr.id} style={dr.voidedAt ? { opacity: 0.6 } : undefined}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>
                    {dr.drNumber}
                    {dr.serialNo ? <div style={{ fontSize: '11px', color: '#8a8a8a', fontWeight: 400 }}>{dr.serialNo}</div> : null}
                  </td>
                  <td style={S.td}>{dayOnly(dr.drDate) || '—'}</td>
                  <td style={S.td}>
                    {dr.deliveredTo}
                    {dr.deliveredTin ? <div style={{ fontSize: '11px', color: '#8a8a8a' }}>TIN {dr.deliveredTin}</div> : null}
                  </td>
                  <td style={{ ...S.td, maxWidth: '230px' }}>
                    <span style={{ fontSize: '11px', color: '#8a8a8a', textTransform: 'uppercase' }}>{dr.sourceKind}</span>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dr.sourceName || '—'}</div>
                  </td>
                  <td style={S.td}>{(dr.items || []).length}</td>
                  <td style={S.td}>
                    {dr.voidedAt
                      ? <span title={dr.voidReason ? `Reason: ${dr.voidReason}` : undefined}>{pill('Voided', 'bad')}</span>
                      : pill('Issued', 'good')}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button title="Print" style={S.rowBtn} onClick={() => onPrint(dr)}><Printer size={14} /></button>
                    {!dr.voidedAt && (
                      <button title="Void (the record is kept)" style={{ ...S.rowBtn, color: '#b91c1c' }}
                        onClick={() => { setVoiding(dr); setVoidReason(''); }}><Ban size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateDrModal api={api} tradings={tradings} projects={projects} customers={customers}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }} />
      )}

      {voiding && (
        <Modal title={`Void DR No. ${voiding.drNumber}`} onClose={() => setVoiding(null)}
          footer={<>
            <GhostBtn onClick={() => setVoiding(null)}>Cancel</GhostBtn>
            <PrimaryBtn onClick={confirmVoid} disabled={voidBusy}>{voidBusy ? 'Voiding…' : 'Void this DR'}</PrimaryBtn>
          </>}>
          <p style={{ fontSize: '13px', color: '#5a5a5a', marginTop: 0 }}>
            The record is kept, never deleted, and prints stamped <b>VOID</b>. The booklet number is
            <b> not</b> freed for reuse — that sheet is spent.
          </p>
          <Field label="Reason *">
            <TextArea value={voidReason} onChange={e => setVoidReason(e.target.value)}
              placeholder="e.g. Spoiled while writing — wrong client" />
          </Field>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// Create. The order of the form follows the order of the work: pick what was delivered against,
// let the system pull the lines, say who it went to, then write the booklet number on it.
// ============================================================================
function CreateDrModal({ api, tradings, projects, customers, onClose, onCreated }: {
  api: Api; tradings: Target[]; projects: Target[]; customers: Customer[];
  onClose: () => void; onCreated: () => void;
}) {
  const [kind, setKind] = useState<'trading' | 'project'>('trading');
  const [sourceId, setSourceId] = useState('');
  const [items, setItems] = useState<DrLine[]>([]);
  const [pulling, setPulling] = useState(false);
  const [pulled, setPulled] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [deliveredTo, setDeliveredTo] = useState('');
  const [deliveredAddress, setDeliveredAddress] = useState('');
  const [deliveredTin, setDeliveredTin] = useState('');
  const [terms, setTerms] = useState('');
  const [drNumber, setDrNumber] = useState('');
  const [drDate, setDrDate] = useState(todayLocal());
  const [crNo, setCrNo] = useState('');
  const [refSi, setRefSi] = useState('');
  const [saving, setSaving] = useState(false);

  const targets = kind === 'trading' ? tradings : projects;

  // Pull the line items whenever the source changes. This is the whole point of the screen, so it
  // happens automatically rather than behind a button.
  useEffect(() => {
    if (!sourceId) { setItems([]); setPulled(false); return; }
    let cancelled = false;
    setPulling(true); setPulled(false);
    const qs = kind === 'trading' ? `tradingId=${encodeURIComponent(sourceId)}` : `projectId=${encodeURIComponent(sourceId)}`;
    api<DrLine[]>(`/delivery-receipts/source-items?${qs}`)
      .then(list => { if (!cancelled) { setItems(list || []); setPulled(true); } })
      .catch(e => { if (!cancelled) { setItems([]); setPulled(true); toast.error(e.message || 'Could not load the line items'); } })
      .finally(() => { if (!cancelled) setPulling(false); });
    // Seed the delivered-to from whatever the deal records as its client, so the common case is
    // already filled. Only when the field is still untouched — never overwrite typing.
    const t = targets.find(x => x.id === sourceId);
    if (t && t.client) setDeliveredTo(prev => (prev.trim() ? prev : String(t.client)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, kind]);

  // Choosing a customer fills the three invoice fields from the client record. Done on selection
  // rather than on save so the accountant SEES what will print and can correct it.
  const pickCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find(x => x.id === id);
    if (!c) return;
    setDeliveredTo(c.name || '');
    setDeliveredAddress(c.billingAddress || '');
    setDeliveredTin(c.tin || '');
    if (c.defaultPaymentTerms) setTerms(c.defaultPaymentTerms);
  };

  const setLine = (i: number, k: keyof DrLine, v: string) =>
    setItems(list => list.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const removeLine = (i: number) => setItems(list => list.filter((_, j) => j !== i));
  const addLine = () => setItems(list => [...list, { quantity: '', unit: '', description: '' }]);

  const save = async () => {
    if (!sourceId) { toast.error(`Pick the ${kind === 'trading' ? 'trading deal' : 'project'} this delivery is for`); return; }
    if (!drNumber.trim()) { toast.error('Enter the DR number from the booklet'); return; }
    if (!deliveredTo.trim()) { toast.error('Delivered-to name is required'); return; }
    if (!drDate) { toast.error('A delivery date is required'); return; }
    if (items.length === 0) { toast.error('A delivery receipt needs at least one line item'); return; }
    setSaving(true);
    try {
      await api('/delivery-receipts', { method: 'POST', body: JSON.stringify({
        drNumber: drNumber.trim(),
        tradingId: kind === 'trading' ? sourceId : null,
        projectId: kind === 'project' ? sourceId : null,
        customerId: customerId || null,
        deliveredTo: deliveredTo.trim(),
        deliveredAddress: deliveredAddress.trim() || null,
        deliveredTin: deliveredTin.trim() || null,
        drDate, terms: terms.trim() || null,
        crNo: crNo.trim() || null, refSalesInvoiceNo: refSi.trim() || null,
        items,
      }) });
      toast.success(`DR No. ${drNumber.trim()} recorded`);
      onCreated();
    } catch (e: any) {
      // The duplicate-number case comes back as a plain sentence from the server; show it as-is
      // because it tells the person exactly which sheet is already recorded.
      toast.error(e.message || 'Could not save the delivery receipt');
    } finally { setSaving(false); }
  };

  const radio = (v: 'trading' | 'project', label: string) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
      <input type="radio" checked={kind === v} onChange={() => { setKind(v); setSourceId(''); setItems([]); setPulled(false); }} />
      {label}
    </label>
  );

  return (
    <Modal title="New Delivery Receipt" onClose={onClose} wide
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save DR'}</PrimaryBtn></>}>

      {/* 1 — what was delivered against */}
      <Field label="This delivery is for">
        <div style={{ display: 'flex', gap: '18px', marginBottom: '8px' }}>{radio('trading', 'A trading deal')}{radio('project', 'A project')}</div>
        <select value={sourceId} onChange={e => setSourceId(e.target.value)} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
          <option value="">{`Select a ${kind === 'trading' ? 'trading deal' : 'project'}…`}</option>
          {targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>

      {/* 2 — the pulled lines */}
      <div style={{ marginBottom: '14px' }}>
        <label style={S.label}>Line items — pulled from this {kind === 'trading' ? 'deal' : 'project'}&rsquo;s purchase requests</label>
        {pulling ? <div style={{ fontSize: '13px', color: '#8a8a8a', padding: '10px 0' }}>Pulling line items…</div>
          : !sourceId ? <div style={{ fontSize: '13px', color: '#8a8a8a', padding: '10px 0' }}>Pick a {kind === 'trading' ? 'deal' : 'project'} above and its items appear here.</div>
          : items.length === 0 && pulled ? (
            <div style={{ fontSize: '13px', color: '#b45309', padding: '10px 0' }}>
              No purchase-request items are linked to this {kind === 'trading' ? 'deal' : 'project'}. Add the lines by hand below.
            </div>
          ) : null}

        {items.length > 0 && (
          <table style={{ ...S.table, marginTop: '4px' }}>
            <thead><tr>
              <th style={{ ...S.th, width: '80px' }}>QTY</th><th style={{ ...S.th, width: '90px' }}>UNIT</th>
              <th style={S.th}>DESCRIPTION</th><th style={{ ...S.th, width: '96px' }}>From</th><th style={{ ...S.th, width: '34px' }}></th>
            </tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td style={S.td}><TextInput value={String(it.quantity ?? '')} onChange={e => setLine(i, 'quantity', e.target.value)} /></td>
                  <td style={S.td}><TextInput value={String(it.unit ?? '')} onChange={e => setLine(i, 'unit', e.target.value)} /></td>
                  <td style={S.td}><TextInput value={it.description} onChange={e => setLine(i, 'description', e.target.value)} /></td>
                  {/* Which PR each line came from. Shown so a merged list is traceable; never printed on the DR. */}
                  <td style={{ ...S.td, fontSize: '11px', color: '#8a8a8a' }}>{it.sourcePr || 'manual'}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    <button title="Remove this line" style={{ ...S.rowBtn, color: '#b91c1c' }} onClick={() => removeLine(i)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sourceId && (
          <button onClick={addLine} style={{ ...S.rowBtn, marginTop: '6px' }}>+ Add a line</button>
        )}
        <p style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '6px' }}>
          Editable before saving. A delivery receipt carries no prices — quantity, unit and description only.
        </p>
      </div>

      {/* 3 — who it went to */}
      <Field label="Client on file (optional — fills the three fields below)">
        <select value={customerId} onChange={e => pickCustomer(e.target.value)} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
          <option value="">Not linked to a client record…</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.tin ? ` — TIN ${c.tin}` : ' — no TIN on file'}</option>)}
        </select>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Delivered to *"><TextInput value={deliveredTo} onChange={e => setDeliveredTo(e.target.value)} placeholder="Client name as it should print" /></Field>
        <Field label="TIN"><TextInput value={deliveredTin} onChange={e => setDeliveredTin(e.target.value)} placeholder="000-000-000-0000" /></Field>
      </div>
      <Field label="Address"><TextInput value={deliveredAddress} onChange={e => setDeliveredAddress(e.target.value)} placeholder="As it should appear on the receipt" /></Field>

      {/* 4 — the booklet */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="DR No. from the booklet *">
          <TextInput value={drNumber} onChange={e => setDrNumber(e.target.value)} placeholder="e.g. 4521" />
        </Field>
        <Field label="Date *"><TextInput type="date" value={drDate} onChange={e => setDrDate(e.target.value)} /></Field>
        <Field label="Terms"><TextInput value={terms} onChange={e => setTerms(e.target.value)} placeholder="e.g. 30 days" /></Field>
        <Field label="C.R. No."><TextInput value={crNo} onChange={e => setCrNo(e.target.value)} /></Field>
      </div>
      <Field label="Ref. Sales Invoice No."><TextInput value={refSi} onChange={e => setRefSi(e.target.value)} /></Field>
      <p style={{ fontSize: '11px', color: '#8a8a8a', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <FileText size={12} /> The DR number is the one pre-printed on the physical booklet — it is never generated, and each sheet can only be recorded once.
      </p>
    </Modal>
  );
}
