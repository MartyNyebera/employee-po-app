// ============================================================================
// Payslip printing (Phase 4c). Renders printable payslips for a computed, LOCKED pay period in
// the exact Kimoel format. Same HTML-string print pattern as lib/orderPrint.ts: open a window
// synchronously (so the popup blocker allows it), write a self-contained document, print on load.
//
// EVERY value is read from the person's already-computed payroll_lines row — nothing is
// recomputed here. `holiday_pay` is a single combined column, so the Reg./Special split is read
// from the stored per-day breakdown (summing amounts already computed by the 4b engine), not
// recalculated. Admin and Accounting both print (payslips are their job); no data is changed.
// ============================================================================

// The subset of a payroll_lines row (as returned by GET /payroll/periods/:id/lines) the payslip
// needs. Kept loose on purpose so this module isn't coupled to the screen's Line type.
export interface PayslipLine {
  person_id: number;
  full_name: string;
  position?: string | null;
  department?: string | null;
  employment_type?: string;
  days_present: number;
  base_pay: number | string;
  ot_hours: number | string;
  ot_pay: number | string;
  sunday_pay: number | string;
  holiday_pay: number | string;
  late_undertime_deduction: number | string;
  sss_ee: number | string;
  philhealth_ee: number | string;
  pagibig_ee: number | string;
  withholding: number | string;
  bale: number | string;
  gross: number | string;
  net: number | string;
  breakdown?: { reference?: any; totals?: any; days?: Array<{ holiday?: string | null; amount?: number }> } | null;
}
export interface PayslipPeriod { id: number; start_date: string; end_date: string; }

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Plain 2-decimal peso amount with thousands separators (grids read cleaner without the ₱ sign;
// the bottom GROSS/NET band adds ₱ for emphasis).
const money = (n: unknown) => (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const peso = (n: unknown) => `₱${money(n)}`;

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
// "JULY 16-31, 2026" for a same-month window; spans months/years gracefully.
function payPeriodLabel(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  if (sy === ey && sm === em) return `${MONTHS[sm - 1]} ${sd}-${ed}, ${sy}`;
  if (sy === ey) return `${MONTHS[sm - 1]} ${sd} – ${MONTHS[em - 1]} ${ed}, ${sy}`;
  return `${MONTHS[sm - 1]} ${sd}, ${sy} – ${MONTHS[em - 1]} ${ed}, ${ey}`;
}

// Slip size is chosen to FILL the whole A4 with 2 columns × 2 rows = 4 per page. A4 is 210×297mm;
// with a 5mm @page margin the usable area is 200×287mm. Two 96mm slips + a 2mm inter-column gap
// span 196mm (fills the width); two 136mm slips + a 3mm inter-row gap span 275mm (fills the height).
// At 136mm tall a third row cannot fit, so the layout is locked to exactly 4 per A4 — no stray 5th
// slip. Every font size, cell padding, table row height and section gap is scaled up (~1.4–1.5×
// fonts, ~3× table row padding) from the old cramped slip so the much bigger box is genuinely more
// readable and roomy, not a large box with tiny text: letterhead, the Employee/Position/Pay-Period/
// ID row, the earnings table, the deductions column, the GROSS/Less/NET band and the Received By
// line all grow to use the reclaimed space.
//
// Batch layout: slips are inline-block tiles inside a font-size:0 container (which kills the
// inter-tile whitespace), so they flow left-to-right and wrap — 2 across × 2 down (4) on an A4
// page — then continue onto further A4 pages. break-inside:avoid keeps any one slip from being
// split across a page boundary; the faint dashed border is a cut guide.
const SLIP_W = '96mm', SLIP_H = '136mm';
const PAYSLIP_CSS = `
  @page { size: A4; margin: 5mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* font-size:0 removes the whitespace gaps between inline-block tiles. */
  .batch { font-size: 0; }
  /* The slip is a fixed-height flex COLUMN: content flows from the top and the signature block is
     pushed to the bottom with margin-top:auto, so Prepared/Received By are always anchored at the
     bottom edge and never clipped — however tall the content runs (e.g. a long name that wraps the
     meta row). inline-flex keeps the tiles flowing 2-across in the batch, like inline-block did. */
  .slip {
    display: inline-flex; flex-direction: column; vertical-align: top;
    width: ${SLIP_W}; height: ${SLIP_H};
    padding: 3mm 3.5mm; margin: 0 2mm 3mm 0;
    border: 0.2mm dashed #b0b0b0; overflow: hidden;
    break-inside: avoid; page-break-inside: avoid;
    font-size: 7.5pt; line-height: 1.32;
  }
  .ph { text-align: center; margin-bottom: 1.2mm; }
  .co { font-size: 12pt; font-weight: bold; line-height: 1.08; }
  .ln { font-size: 6.5pt; line-height: 1.35; }
  table { border-collapse: collapse; width: 100%; }
  .meta td { font-size: 7pt; padding: 0.6mm 0.8mm; vertical-align: bottom; }
  .meta .k { font-weight: bold; white-space: nowrap; width: 1%; padding-right: 1.5mm; }
  .meta .v { border-bottom: 0.2mm solid #999; }
  .cols { display: flex; gap: 3.5mm; margin-top: 2mm; align-items: flex-start; }
  .cols > div { flex: 1; min-width: 0; }
  .sect { font-size: 7pt; font-weight: bold; letter-spacing: .2px; text-transform: uppercase; margin-bottom: 1mm; }
  .grid th, .grid td { border: 0.2mm solid #000; padding: 1mm 0.8mm; font-size: 6.8pt; line-height: 1.3; }
  .grid th { background: #ececec; font-weight: bold; text-align: center; }
  .grid .lbl { text-align: left; white-space: nowrap; }
  .grid .num { text-align: right; font-variant-numeric: tabular-nums; }
  .grid .tot td { font-weight: bold; background: #f6f6f6; }
  .totband { margin-top: 2mm; border: 0.2mm solid #000; }
  .totband .row { display: flex; justify-content: space-between; padding: 1mm 2mm; font-size: 8pt; }
  .totband .row + .row { border-top: 0.2mm solid #ccc; }
  .totband .k { font-weight: bold; letter-spacing: .2px; }
  .totband .v { font-variant-numeric: tabular-nums; }
  .totband .net { font-weight: bold; font-size: 10pt; background: #eee; }
  /* margin-top:auto anchors the two signature lines (Prepared By | Received By) to the bottom. */
  .sign { display: flex; gap: 5mm; margin-top: auto; padding-top: 2mm; }
  .sign > div { flex: 1; text-align: center; font-size: 7pt; }
  .sign .line { border-top: 0.2mm solid #000; margin-top: 7mm; padding-top: 1mm; }
  .foot { text-align: center; font-size: 5.5pt; color: #444; margin-top: 1.5mm; font-style: italic; }
`;

function slipHtml(period: PayslipPeriod, l: PayslipLine): string {
  const ref = (l.breakdown && l.breakdown.reference) || {};
  const hourly = Number(ref.hourly) || 0;
  const mults = (ref.multipliers) || {};
  const otMult = Number(mults.ot) || 1.25;
  const otRate = hourly * otMult;
  const dailyRate = Number(ref.daily_basis) || Number(ref.rate) || 0;
  // Premium hourly rates for the Sunday/holiday earnings rows — shown even when nobody worked one
  // that period (Qty/Amount 0), just like Reg. day always shows its rate. Same per-hour basis as
  // Reg. OT (hourly × multiplier), read from the stored settings so it matches the computed amounts.
  // DISPLAY ONLY — no pay math changes; the Amount columns are the already-computed values.
  const sunMult = Number(mults.sunday) || 1.30;
  const regHolMult = Number(mults.regular_holiday) || 2.0;
  const spcHolMult = Number(mults.special_holiday) || 1.30;
  const sundayRate = hourly * sunMult;
  const regHolRate = hourly * regHolMult;
  const specHolRate = hourly * spcHolMult;

  // Reg. day quantity includes half days (missing-OUT days count as 0.5), so Qty × Rate = base_pay.
  const halfDays = Number(l.breakdown && l.breakdown.totals && l.breakdown.totals.half_days) || 0;
  const regQty = (Number(l.days_present) || 0) + 0.5 * halfDays;
  const regQtyStr = Number.isInteger(regQty) ? String(regQty) : regQty.toFixed(1);

  // Reg./Special holiday split from the stored per-day breakdown (already-computed amounts).
  let regHol = 0, specHol = 0;
  for (const d of (l.breakdown && l.breakdown.days) || []) {
    if (d.holiday === 'regular') regHol += Number(d.amount) || 0;
    else if (d.holiday === 'special') specHol += Number(d.amount) || 0;
  }

  const undertime = Number(l.late_undertime_deduction) || 0;
  const totalDed = (Number(l.sss_ee) || 0) + (Number(l.philhealth_ee) || 0) + (Number(l.pagibig_ee) || 0)
    + (Number(l.withholding) || 0) + undertime + (Number(l.bale) || 0);

  return `
  <div class="slip">
    <div class="ph">
      <div class="co">KIMOEL TRADING &amp; CONSTRUCTION INCORPORATED</div>
      <div class="ln">PUROK 1 , LODLOD , LIPA CITY , BATANGAS</div>
      <div class="ln">Tel. No. (043)-741-2023</div>
      <div class="ln">Email: kimoel_leotagle@yahoo.com</div>
    </div>
    <table class="meta" style="margin-top:1mm"><tbody>
      <tr>
        <td class="k">Employee:</td><td class="v">${esc(l.full_name)}</td>
        <td class="k">Pay Period:</td><td class="v">${esc(payPeriodLabel(period.start_date, period.end_date))}</td>
      </tr>
      <tr>
        <td class="k">Position:</td><td class="v">${esc(l.position || '')}</td>
        <td class="k">ID Number:</td><td class="v">${esc(l.person_id)}</td>
      </tr>
    </tbody></table>

    <div class="cols">
      <div>
        <div class="sect">Earnings</div>
        <table class="grid"><tbody>
          <tr><th class="lbl" style="text-align:left">Earnings</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
          <tr><td class="lbl">Reg. day</td><td class="num">${esc(regQtyStr)}</td><td class="num">${money(dailyRate)}</td><td class="num">${money(l.base_pay)}</td></tr>
          <tr><td class="lbl">Reg. OT</td><td class="num">${esc(l.ot_hours)}</td><td class="num">${money(otRate)}</td><td class="num">${money(l.ot_pay)}</td></tr>
          <tr><td class="lbl">Sunday</td><td class="num"></td><td class="num">${money(sundayRate)}</td><td class="num">${money(l.sunday_pay)}</td></tr>
          <tr><td class="lbl">Reg. Hol.</td><td class="num"></td><td class="num">${money(regHolRate)}</td><td class="num">${money(regHol)}</td></tr>
          <tr><td class="lbl">Special Hol.</td><td class="num"></td><td class="num">${money(specHolRate)}</td><td class="num">${money(specHol)}</td></tr>
          <tr class="tot"><td class="lbl">Total Earnings</td><td class="num"></td><td class="num"></td><td class="num">${money(l.gross)}</td></tr>
        </tbody></table>
      </div>
      <div>
        <div class="sect">Deductions</div>
        <table class="grid"><tbody>
          <tr><th class="lbl" style="text-align:left">Deductions</th><th>Amount</th></tr>
          <tr><td class="lbl">SSS - EE</td><td class="num">${money(l.sss_ee)}</td></tr>
          <tr><td class="lbl">Philhealth - EE</td><td class="num">${money(l.philhealth_ee)}</td></tr>
          <tr><td class="lbl">Pagibig - EE</td><td class="num">${money(l.pagibig_ee)}</td></tr>
          <tr><td class="lbl">Withholding</td><td class="num">${money(l.withholding)}</td></tr>
          <tr><td class="lbl">Undertime</td><td class="num">${money(undertime)}</td></tr>
          <tr><td class="lbl">BALE</td><td class="num">${money(l.bale)}</td></tr>
          <tr class="tot"><td class="lbl">Total Deduction</td><td class="num">${money(totalDed)}</td></tr>
        </tbody></table>
      </div>
    </div>

    <div class="totband">
      <div class="row"><span class="k">GROSS</span><span class="v">${peso(l.gross)}</span></div>
      <div class="row"><span class="k">Less Deductions</span><span class="v">${peso(totalDed)}</span></div>
      <div class="row net"><span class="k">NET PAY</span><span class="v">${peso(l.net)}</span></div>
    </div>

    <div class="sign">
      <div><div class="line">Prepared By</div></div>
      <div><div class="line">Received By</div></div>
    </div>
    <div class="foot">Computer generated payslip — ${esc(payPeriodLabel(period.start_date, period.end_date))}</div>
  </div>`;
}

function renderDocument(title: string, slips: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${PAYSLIP_CSS}</style></head><body><div class="batch">${slips}</div></body></html>`;
}

function openAndPrint(title: string, slips: string): { ok: boolean; error?: string } {
  const w = window.open('', '_blank');
  if (!w) return { ok: false, error: 'Please allow popups to print payslips' };
  const html = renderDocument(title, slips);
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // onload fires unreliably on a document.write'd window; print() here works because the content
  // is already written. Do not close the window — it can kill the print dialog before the user acts.
  w.onload = () => { w.print(); };
  return { ok: true };
}

// One payslip for one person.
export function printPayslip(period: PayslipPeriod, line: PayslipLine): { ok: boolean; error?: string } {
  return openAndPrint(`Payslip — ${line.full_name}`, slipHtml(period, line));
}

// All payslips for the period, 2-up per A4 page for a batch print.
export function printPayslips(period: PayslipPeriod, lines: PayslipLine[]): { ok: boolean; error?: string } {
  if (!lines.length) return { ok: false, error: 'No payroll lines to print' };
  return openAndPrint(`Payslips — ${payPeriodLabel(period.start_date, period.end_date)}`, lines.map(l => slipHtml(period, l)).join(''));
}
