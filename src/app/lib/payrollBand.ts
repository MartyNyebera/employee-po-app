// ============================================================================
// The three figures people READ off a payroll line — Gross, Deductions, Net — reconciled so
// they always tie. Single source of truth for the payroll summary table, the Excel export and
// the payslip band, so those three surfaces cannot drift apart.
//
// THE PROBLEM THIS SOLVES
// computePayroll builds gross, the deduction total and net from UNROUNDED values and then
// rounds each of the three independently:
//     gross = base + ot + sunday + holiday          -> round2 and stored
//     ded   = late/UT + break + sss + ... + bale     -> round2 and stored in the breakdown
//     net   = max(0, gross - ded)                    -> round2 and stored
// round2(a) - round2(b) is not always round2(a - b), so the printed band could read
// Gross − Deductions = 8,827.70 against a NET of 8,827.71. Joan's break dock (break_minutes ×
// a per-MINUTE rate, so sub-centavo) is what produced that on the live data.
//
// THE FIX
// Net is correct and is what gets PAID, so net is never recomputed here. Instead the DISPLAYED
// deduction is derived as gross − net: the amount actually withheld. The band then ties by
// construction, in whole centavos, for every row and for all time.
//
// Two consequences, both deliberate:
//
//  1. Where deductions exceeded gross, computePayroll floors net at 0 and records the remainder
//     as pay.deduction_shortfall. For such a row gross − net is what was actually TAKEN (e.g.
//     ₱615.00 of a ₱693.93 obligation) and `uncollected` is the rest.
//
//     The owner has decided those remainders are WRITTEN OFF: not collected, not carried
//     forward. So `uncollected` is an INTERNAL figure only — it belongs in the Verify
//     breakdown, where admin and accounting reconcile what the engine owed against what the
//     payroll actually took. It must NOT be rendered on the payslip, the summary table or the
//     Excel export: an employee is never shown a sum they supposedly still owe. Those surfaces
//     show deductions = gross − net, which for a floored row is simply all of their pay.
//
//  2. For a plain rounding residual (Joan) the displayed deduction moves by one centavo —
//     ₱438.61 to ₱438.60 — while the itemised components still sum to ₱438.61. That is why the
//     per-person Verify breakdown keeps showing the engine's itemised total and reconciles the
//     difference explicitly: the itemisation is the audit view, this is the reading view.
// ============================================================================

/** Just the fields this needs; both PayrollReview's Line and payslipPrint's shape satisfy it. */
export interface BandSource {
  gross: number | string | null | undefined;
  net: number | string | null | undefined;
  breakdown?: {
    pay?: { deduction_shortfall?: number | string | null } | null;
    deductions?: { total?: number | string | null } | null;
  } | null;
}

export interface PayrollBand {
  /** Stored gross, unchanged. */
  gross: number;
  /** gross − net: what was actually withheld. Guaranteed so that gross − deductions === net. */
  deductions: number;
  /** Stored net, unchanged — this is what gets paid and is never re-derived. */
  net: number;
  /**
   * Owed but not collected because net was floored at zero — written off, never carried
   * forward. INTERNAL ONLY: the audit/verify view may show it, employee-facing surfaces
   * (payslip, summary table, Excel export) must not. 0 for a normal row.
   */
  uncollected: number;
  /** The engine's own itemised deduction total — what the components add up to. */
  itemizedTotal: number;
  /**
   * itemizedTotal − deductions − uncollected: the pure rounding residual, normally 0 and at most
   * a centavo or two. Exposed so the audit view can account for it instead of leaving it to be
   * discovered by someone adding up a column.
   */
  rounding: number;
}

// Whole centavos throughout: integer arithmetic cannot reintroduce the float hair that caused
// the problem in the first place.
const cent = (v: number | string | null | undefined) => Math.round((Number(v) || 0) * 100);

export function payrollBand(l: BandSource): PayrollBand {
  const gross = cent(l?.gross);
  const net = cent(l?.net);
  const applied = gross - net;
  const uncollected = cent(l?.breakdown?.pay?.deduction_shortfall);
  // Falls back to the derived figure on a row computed before the breakdown carried a total,
  // so `rounding` reads 0 rather than inventing a discrepancy out of a missing field.
  const itemized = l?.breakdown?.deductions?.total != null
    ? cent(l.breakdown.deductions.total)
    : applied + uncollected;
  return {
    gross: gross / 100,
    deductions: applied / 100,
    net: net / 100,
    uncollected: uncollected / 100,
    itemizedTotal: itemized / 100,
    rounding: (itemized - applied - uncollected) / 100,
  };
}
