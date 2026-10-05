// ============================================================================
// The three figures people READ off a payroll line — Gross, Deductions, Net — reconciled so they
// always tie. Used by the payroll summary table, the Excel export and the payslip band, so those
// three surfaces cannot drift apart.
//
// The implementation moved to shared/payrollLines.js so the Node server can import the SAME
// derivation the browser uses — the Excel export of the payslip breakdown has to agree with the
// printed payslip to the centavo, and a .ts module under src/ cannot be imported by the server.
// That file carries the full explanation of the rounding defect and the fix. This module stays as
// the typed front door: every existing import of payrollBand keeps working unchanged.
// ============================================================================
import { payrollBand as bandJs } from '../../../shared/payrollLines.js';

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
   * itemizedTotal − deductions − uncollected: the pure rounding residual against the engine's
   * total, normally 0 and at most a centavo or two. Exposed so the audit view can account for it
   * instead of leaving it to be discovered by someone adding up a column.
   */
  rounding: number;
}

export function payrollBand(l: BandSource): PayrollBand {
  return bandJs(l) as PayrollBand;
}
