// ============================================================================
// Every figure a payslip PRINTS, derived in ONE place.
//
// WHY THIS FILE IS PLAIN .js AND LIVES OUTSIDE src/ AND server/
// Two things have to agree to the centavo: the printed payslip (frontend, src/app/lib/
// payslipPrint.ts) and the Excel export of the same breakdown (server, server/index.js). A .ts
// module under src/ cannot be imported by the Node server, and a module under server/ has no
// business being pulled into the browser bundle. So the derivation lives here, in plain ESM
// JavaScript with no dependencies, and both sides import it. If this file is wrong, both are
// wrong together and the tests catch it — which is the point. Duplicating it was the alternative,
// and a duplicate drifts silently the first time somebody adds an earnings line.
//
// NOTHING HERE RECOMPUTES PAY. Every amount is read from the already-computed payroll_lines row
// (and its stored `breakdown`). The engine's figures are the source; this only decides how they
// are SPLIT INTO ROWS and how the displayed deduction is reconciled.
// ============================================================================

// Whole centavos throughout: integer arithmetic cannot reintroduce the float hair that caused the
// band to disagree with itself in the first place.
const cent = (v) => Math.round((Number(v) || 0) * 100);
const num = (v) => Number(v) || 0;

// ============================================================================
// THE BAND — Gross, Deductions, Net, reconciled so they always tie.
//
// computePayroll builds gross, the deduction total and net from UNROUNDED values and then rounds
// each of the three independently:
//     gross = base + ot + sunday + holiday          -> round2 and stored
//     ded   = late/UT + break + sss + ... + bale    -> round2 and stored in the breakdown
//     net   = max(0, gross - ded)                   -> round2 and stored
// round2(a) - round2(b) is not always round2(a - b), so the printed band could read
// Gross - Deductions = 8,827.70 against a NET of 8,827.71. Joan's break dock (break_minutes x a
// per-MINUTE rate, so sub-centavo) is what produced that on the live data.
//
// THE FIX: net is correct and is what gets PAID, so net is never recomputed. The DISPLAYED
// deduction is derived as gross - net: the amount actually withheld. The band then ties by
// construction, in whole centavos, for every row and for all time.
// ============================================================================
export function payrollBand(l) {
  const gross = cent(l && l.gross);
  const net = cent(l && l.net);
  const applied = gross - net;
  const bd = (l && l.breakdown) || {};
  // Owed but not collected because net was floored at zero. Written off by the owner's decision —
  // not collected, not carried forward. INTERNAL ONLY: the audit/verify view may show it,
  // employee-facing surfaces (payslip, summary table, Excel export) must not.
  const uncollected = cent(bd.pay && bd.pay.deduction_shortfall);
  // Falls back to the derived figure on a row computed before the breakdown carried a total, so
  // `rounding` reads 0 rather than inventing a discrepancy out of a missing field.
  const itemized = bd.deductions && bd.deductions.total != null ? cent(bd.deductions.total) : applied + uncollected;
  return {
    gross: gross / 100,
    deductions: applied / 100,
    net: net / 100,
    uncollected: uncollected / 100,
    itemizedTotal: itemized / 100,
    // itemizedTotal - deductions - uncollected: the pure rounding residual against the ENGINE's
    // total, normally 0 and at most a centavo or two. The audit view accounts for it rather than
    // leaving it to be discovered by someone adding up a column.
    rounding: (itemized - applied - uncollected) / 100,
  };
}

// ============================================================================
// EARNINGS — the payslip's earnings grid, row for row.
//
// `holiday_pay` is ONE stored column covering three different things, so the split is read back
// out of the stored per-day breakdown (summing amounts the engine already computed):
//   * holiday_worked, non-special -> Reg. Hol.      paid per HOUR at hourly x regular_holiday
//   * holiday_worked, special     -> Special Hol.   paid per HOUR at hourly x special_holiday
//   * holiday_not_worked, paid    -> Holiday pay    one whole DAY at the daily rate
// The third is a different shape from the other two. Folding it in would make Qty x Rate
// nonsense, so it is its own row — and keeping it out of the first two is exactly why that row
// must exist, or the money vanishes and Total Earnings stops tying to GROSS.
//
// Rates are shown even when nobody worked one that period (Qty/Amount 0), just as the Reg. day
// row always shows its rate. DISPLAY ONLY: the Amount fields are the engine's own values.
// ============================================================================
export function payslipEarnings(l) {
  const bd = (l && l.breakdown) || {};
  const ref = bd.reference || {};
  const mults = ref.multipliers || {};
  const hourly = num(ref.hourly);
  const dailyRate = num(ref.daily_basis) || num(ref.rate);

  // Reg. day quantity includes half days (a missing-OUT day counts as 0.5), so Qty x Rate =
  // base_pay. Same number the on-screen Days cell shows.
  const regQty = num(l && l.days_present) + 0.5 * num(bd.totals && bd.totals.half_days);

  let regHolAmount = 0, specHolAmount = 0, sundayHours = 0, regHolHours = 0, specHolHours = 0;
  let holOffDays = 0, holOffAmount = 0;
  for (const d of bd.days || []) {
    const amt = num(d.amount), hrs = num(d.net_hours);
    if (d.kind === 'sunday_worked') sundayHours += hrs;
    else if (d.kind === 'holiday_worked') {
      if (d.holiday === 'special') { specHolAmount += amt; specHolHours += hrs; }
      else { regHolAmount += amt; regHolHours += hrs; }
    } else if (d.kind === 'holiday_not_worked' && amt > 0) { holOffDays += 1; holOffAmount += amt; }
  }

  const out = {
    dailyRate,
    regQty, regAmount: num(l && l.base_pay),
    otHours: num(l && l.ot_hours), otRate: hourly * (num(mults.ot) || 1.25), otAmount: num(l && l.ot_pay),
    sundayHours, sundayRate: hourly * (num(mults.sunday) || 1.30), sundayAmount: num(l && l.sunday_pay),
    regHolHours, regHolRate: hourly * (num(mults.regular_holiday) || 2.0), regHolAmount,
    specHolHours, specHolRate: hourly * (num(mults.special_holiday) || 1.30), specHolAmount,
    holOffDays, holOffRate: dailyRate, holOffAmount,
    // The engine's stored gross — what Total Earnings prints.
    total: num(l && l.gross),
  };
  // ...and the same residual the deduction grid has, for the same reason. base_pay, ot_pay and
  // sunday_pay are each STORED already rounded to centavos, while gross was rounded from the
  // unrounded parts — so the six amounts above can add up to a centavo either side of it
  // (Marlon, period 25: 5,669.91 + 659.52 + 472.62 + 675.66 = 7,477.71 against a stored gross of
  // 7,477.72). `adjustment` closes exactly that gap and is 0 when none is needed, so the printed
  // earnings column always reaches the printed Total Earnings.
  //
  // Invariant, always, in whole centavos:  sum(the six amounts) + adjustment === total
  const shownEarn = cent(out.regAmount) + cent(out.otAmount) + cent(out.sundayAmount)
    + cent(out.regHolAmount) + cent(out.specHolAmount) + cent(out.holOffAmount);
  out.adjustment = (cent(out.total) - shownEarn) / 100;
  return out;
}

// ============================================================================
// DEDUCTIONS — the payslip's deduction grid, row for row, reconciled to what was WITHHELD.
//
// `items` are listed in withholding priority, highest first: statutory contributions and tax
// before the company's own lines (penalties, cash advance). The unpaid personal-break dock
// (attendance_days.break_minutes x a per-minute rate) is a REAL deduction the engine subtracts
// from net but has NO payroll_lines column — it exists only inside the stored breakdown. Summing
// the columns therefore under-states deductions, which is why it is itemised here.
//
// The grid has to add up to what was actually withheld (band.deductions), and there are two
// different reasons it might not:
//
//  * A WRITTEN-OFF SHORTFALL (band.uncollected > 0). Obligations genuinely exceeded the pay, the
//    engine floored net at 0, and the owner has written the remainder off: not collected, not
//    carried forward, and shown on nothing the employee sees. The items are therefore CAPPED at
//    the pay available, spent from the top of the priority list — so the shortfall lands on the
//    company's own lines rather than understating an SSS or PhilHealth figure, and the stored
//    columns (what gets remitted) are untouched.
//
//  * A SUB-CENTAVO ROUNDING RESIDUAL. Each component is rounded to centavos for display, so the
//    column as PRINTED can differ from both the engine total and the paid figure by a centavo
//    (Marlon's period 7 column printed 3,302.09 against 3,302.08 withheld, because his break
//    dock is 19.6849). `adjustment` closes exactly that gap and is 0 when none is needed.
//
// Invariant, always, in whole centavos:  sum(items) + adjustment === total
// ============================================================================
export function payslipDeductions(l, band) {
  const b = band || payrollBand(l);
  const bd = (l && l.breakdown) || {};
  const ded = bd.deductions || {};
  const total = b.deductions;

  const raw = [
    { key: 'sss', label: 'SSS - EE', amount: num(l && l.sss_ee) },
    { key: 'philhealth', label: 'Philhealth - EE', amount: num(l && l.philhealth_ee) },
    { key: 'pagibig', label: 'Pagibig - EE', amount: num(l && l.pagibig_ee) },
    { key: 'withholding', label: 'Withholding', amount: num(l && l.withholding) },
    { key: 'undertime', label: 'Undertime', amount: num(l && l.late_undertime_deduction) },
    { key: 'break', label: 'Personal break', amount: num(ded.break) },
    { key: 'bale', label: 'BALE', amount: num(l && l.bale) },
  ];

  const capped = b.uncollected > 0;
  let left = cent(total);
  const items = raw.map((it) => {
    if (!capped) return it;
    const take = Math.max(0, Math.min(cent(it.amount), left));
    left -= take;
    return { ...it, amount: take / 100, cappedFrom: take / 100 !== it.amount ? it.amount : null };
  });

  // Derived from the amounts AS DISPLAYED, not from the engine's stored total, so the printed
  // column always adds up. Signed the way it is shown and added: a positive column that overshoots
  // the withheld figure yields a negative adjustment.
  const shown = items.reduce((a, it) => a + cent(it.amount), 0);
  const adjustment = (cent(total) - shown) / 100;

  return { items, adjustment, total, capped };
}
