// ============================================================================
// The arithmetic and shaping behind the Disbursement Voucher form, kept out of the component so it
// can be tested without a browser.
//
// A voucher pays two kinds of thing: SUPPLIER INVOICES (a PO payment line) and EXPENSES (a line
// charged to a project, trading deal or facility). Its total is the sum of both, and it must
// balance to the centavo before it can be saved. All money here is whole CENTAVOS as integers —
// summing 0.1-style floats and comparing against a total is exactly how a split silently ends up a
// centavo out, which is why this system has never done it.
//
// The server and the database enforce the same rule independently (API validation, then a deferred
// trigger at COMMIT). This is the first of three layers: it exists so Save stays disabled until the
// form is right, and so the error can be explained before the round trip.
// ============================================================================

export type PaymentMode = '' | 'cash' | 'check' | 'bank_transfer' | 'petty_cash';
export type TargetKind = 'project' | 'trading' | 'facility';

export const PAYMENT_MODE_LABEL: Record<Exclude<PaymentMode, ''>, string> = {
  cash: 'Cash', check: 'Check', bank_transfer: 'Bank transfer', petty_cash: 'Petty cash',
};

export interface ExpenseLineDraft { key: number; target: string; amount: string }
export interface PoLineDraft { key: number; purchaseOrderId: string; amount: string }

export interface VoucherDraft {
  amount: string;
  expenseDate: string;
  description: string;
  payee: string;
  referenceNo: string;
  paymentMode: PaymentMode;
  checkNo: string;
  bank: string;
  checkDate: string;
  expenseLines: ExpenseLineDraft[];
  poLines: PoLineDraft[];
}

/** '1,250.50' -> 125050. null when it is not a peso amount with at most 2 decimals. */
export const toCentavos = (v: string | number | null | undefined): number | null => {
  const t = String(v ?? '').replace(/,/g, '').trim();
  return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : null;
};

export const fromCentavos = (c: number): string => (c / 100).toFixed(2);

/** The Manila calendar date, so a voucher dated "today" is never yesterday's. */
export const manilaToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

// The <select> value encodes both kind and id ("project:PRJ-123") so one dropdown can offer all
// three target types without a second "what kind is it" control.
export const encodeTarget = (kind: TargetKind, id: string) => `${kind}:${id}`;
export const decodeTarget = (v: string): { kind: TargetKind; id: string } | null => {
  const i = v.indexOf(':');
  if (i < 0) return null;
  const kind = v.slice(0, i) as TargetKind;
  const id = v.slice(i + 1);
  return id && (kind === 'project' || kind === 'trading' || kind === 'facility') ? { kind, id } : null;
};

export interface VoucherTotals {
  /** What was paid, as typed. null until it is a valid amount. */
  totalCentavos: number | null;
  poCentavos: number;
  expenseCentavos: number;
  linesCentavos: number;
  /** total - lines. Positive = still to allocate, negative = over-allocated. */
  remaining: number;
  /** At least one line carries an amount. */
  hasLines: boolean;
  /** The total is valid and the lines equal it exactly. This is what enables Save. */
  balanced: boolean;
}

export function voucherTotals(d: VoucherDraft): VoucherTotals {
  const totalCentavos = toCentavos(d.amount);
  const poCentavos = d.poLines.reduce((t, r) => t + (toCentavos(r.amount) ?? 0), 0);
  const expenseCentavos = d.expenseLines.reduce((t, r) => t + (toCentavos(r.amount) ?? 0), 0);
  const linesCentavos = poCentavos + expenseCentavos;
  return {
    totalCentavos, poCentavos, expenseCentavos, linesCentavos,
    remaining: (totalCentavos ?? 0) - linesCentavos,
    hasLines: linesCentavos > 0,
    balanced: totalCentavos !== null && totalCentavos > 0 && linesCentavos === totalCentavos,
  };
}

/** What is left to put on one line, given every OTHER line — the "Rest" button. '' if nothing is. */
export function restForLine(d: VoucherDraft, kind: 'po' | 'expense', key: number): string {
  const total = toCentavos(d.amount) ?? 0;
  const others =
    d.poLines.filter(r => !(kind === 'po' && r.key === key)).reduce((t, r) => t + (toCentavos(r.amount) ?? 0), 0) +
    d.expenseLines.filter(r => !(kind === 'expense' && r.key === key)).reduce((t, r) => t + (toCentavos(r.amount) ?? 0), 0);
  const rest = total - others;
  return rest > 0 ? fromCentavos(rest) : '';
}

/**
 * The amount a PO line starts at: what is still owed on it. Blank when nothing is (a fully paid PO
 * gets no default - paying it again is allowed, but it should be a deliberate keystroke).
 */
export function defaultPoAmount(balance: string | number | null | undefined): string {
  const c = toCentavos(balance);
  return c !== null && c > 0 ? fromCentavos(c) : '';
}

/** The voucher total that makes the form balance, once there are lines. '' if there is nothing to sum. */
export function totalFromLines(d: VoucherDraft): string {
  const t = voucherTotals(d);
  return t.linesCentavos > 0 ? fromCentavos(t.linesCentavos) : '';
}

export interface PayableLite {
  id: string; poNumber: string; supplier: string | null; balance: string; poTotal: string;
  status: string; overdue: boolean; unpayable?: boolean;
  // What the order was bought for (resolved server-side); shown in the picker and searchable.
  allocationName?: string | null; allocationType?: string | null;
}

/**
 * Pickable POs for a search box. Matches the PO number or supplier, hides POs already on this
 * voucher (the server refuses the same PO twice), and puts what needs paying first: overdue, then
 * anything with a balance, then the rest. Capped so the dropdown stays a dropdown.
 */
export function filterPayables(list: PayableLite[], query: string, excludeIds: string[], limit = 8): PayableLite[] {
  const q = query.trim().toLowerCase();
  const taken = new Set(excludeIds);
  const rank = (p: PayableLite) => (p.overdue ? 0 : Number(p.balance) > 0 ? 1 : 2);
  return list
    .filter(p => !p.unpayable && !taken.has(p.id))
    .filter(p => !q || `${p.poNumber} ${p.supplier || ''} ${p.allocationName || ''}`.toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b) || a.poNumber.localeCompare(b.poNumber))
    .slice(0, limit);
}

/** A starting description for a voucher that only pays POs, so the required field is not a chore. */
export function suggestDescription(poLines: PoLineDraft[], byId: Map<string, PayableLite>): string {
  const picked = poLines.map(l => byId.get(l.purchaseOrderId)).filter((p): p is PayableLite => !!p);
  if (picked.length === 0) return '';
  const nos = picked.map(p => p.poNumber).join(', ');
  const suppliers = [...new Set(picked.map(p => p.supplier).filter(Boolean))] as string[];
  return `Payment of ${picked.length === 1 ? 'PO' : 'POs'} ${nos}${suppliers.length ? ` — ${suppliers.join(', ')}` : ''}`.slice(0, 500);
}

export type BuildResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

const peso = (c: number) => `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Turns the form into the request body, or says what is wrong in the words a person would use.
 *
 * With no PO lines and no payment details the body has EXACTLY the keys the old Log Expense form
 * sent, so an expense-only voucher is the same request it always was.
 */
export function buildVoucherPayload(d: VoucherDraft): BuildResult {
  const t = voucherTotals(d);
  if (t.totalCentavos === null || t.totalCentavos <= 0) return { ok: false, error: 'Enter the amount paid, e.g. 1250.50' };
  if (!d.description.trim()) return { ok: false, error: 'Description is required' };
  if (!d.expenseDate) return { ok: false, error: 'Choose the expense date' };

  const hasPo = d.poLines.length > 0;
  const poPayments: { purchaseOrderId: string; amount: string }[] = [];
  const seen = new Set<string>();
  for (const [i, r] of d.poLines.entries()) {
    if (!r.purchaseOrderId) return { ok: false, error: `PO line ${i + 1}: choose a purchase order` };
    if (seen.has(r.purchaseOrderId)) return { ok: false, error: `PO line ${i + 1}: that purchase order is already on this voucher` };
    seen.add(r.purchaseOrderId);
    const c = toCentavos(r.amount);
    if (c === null || c <= 0) return { ok: false, error: `PO line ${i + 1}: enter an amount` };
    poPayments.push({ purchaseOrderId: r.purchaseOrderId, amount: r.amount.replace(/,/g, '').trim() });
  }

  // A blank expense row is ignored once a PO is being paid (the form starts with one empty row), but
  // with no PO lines every row is held to the old rule, so an expense-only voucher is checked as before.
  const isBlank = (r: ExpenseLineDraft) => r.target === '' && r.amount.trim() === '';
  const expenseRows = hasPo ? d.expenseLines.filter(r => !isBlank(r)) : d.expenseLines;
  const allocations: Record<string, string>[] = [];
  for (const [i, r] of expenseRows.entries()) {
    const target = decodeTarget(r.target);
    if (!target) return { ok: false, error: `Line ${i + 1}: choose what to charge` };
    const c = toCentavos(r.amount);
    if (c === null || c <= 0) return { ok: false, error: `Line ${i + 1}: enter an amount` };
    allocations.push({ [`${target.kind}Id`]: target.id, amount: r.amount.replace(/,/g, '').trim() });
  }

  const poC = poPayments.reduce((n, p) => n + (toCentavos(p.amount) ?? 0), 0);
  const exC = allocations.reduce((n, a) => n + (toCentavos(a.amount) ?? 0), 0);
  if (poC + exC !== t.totalCentavos) {
    return { ok: false, error: `Lines ${peso(poC + exC)} of ${peso(t.totalCentavos)} — they must match exactly` };
  }

  if (d.paymentMode === 'check' && !d.checkNo.trim()) return { ok: false, error: 'A check payment needs the check number' };

  const payload: Record<string, unknown> = {
    amount: d.amount.replace(/,/g, '').trim(),
    expenseDate: d.expenseDate,
    description: d.description.trim(),
    payee: d.payee.trim(),
    referenceNo: d.referenceNo.trim(),
    allocations,
  };
  if (hasPo) payload.poPayments = poPayments;
  if (d.paymentMode) {
    payload.paymentMode = d.paymentMode;
    if (d.paymentMode === 'check') {
      payload.checkNo = d.checkNo.trim();
      if (d.bank.trim()) payload.bank = d.bank.trim();
      if (d.checkDate) payload.checkDate = d.checkDate;
    }
  }
  return { ok: true, payload };
}
