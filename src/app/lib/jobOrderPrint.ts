// ============================================================================
// The Job Order form — printed from the Production portal (/production). Unlike every other
// document in the system, this one carries NO data: it's a BLANK template the crew fills in by
// hand. Same Kimoel letterhead/footer/title chrome as the receipts and the PR (printChrome.ts);
// this module only owns the empty-form styles (labelled write-on lines, a description box, and
// two signature blocks).
// ============================================================================

import { renderPrintDocument } from './printChrome';

export function printBlankJobOrder(): { ok: boolean; error?: string } {
  const w = window.open('', '_blank');
  if (!w) return { ok: false, error: 'Please allow popups to print the job order' };

  const css = `
  .jo-field { margin-top: 14px; font-size: 11pt; }
  .jo-field .jo-label { font-weight: bold; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
  /* An empty line to write on — a bottom rule with height reserved above it. */
  .jo-line { border-bottom: 1px solid #000; height: 22px; margin-top: 2px; }
  .jo-hint { font-size: 8pt; color: #555; font-style: italic; margin-top: 2px; }
  /* Two short lines share a row (Start / Finish). */
  .jo-row { display: flex; gap: 32px; }
  .jo-row .jo-field { flex: 1; min-width: 0; }
  /* The larger write-in area for the job description. */
  .jo-box { border: 1px solid #000; height: 150px; margin-top: 4px; }
  .signs { display: flex; gap: 40px; margin-top: 48px; break-inside: avoid; }
  .sign { flex: 1; min-width: 0; text-align: center; }
  .sign-line { border-top: 1px solid #000; padding-top: 4px; font-size: 9.5pt; }
  .sign-role { font-weight: bold; font-size: 9.5pt; }
  .sign-sub { font-size: 8pt; color: #333; }
`;

  const body = `
  <div class="jo-field">
    <div class="jo-label">Job Order #</div>
    <div class="jo-line"></div>
    <div class="jo-hint">Use the PO number if this job is tied to a Purchase Order, otherwise write “Walk-In”.</div>
  </div>

  <div class="jo-field">
    <div class="jo-label">Client Name</div>
    <div class="jo-line"></div>
  </div>

  <div class="jo-field">
    <div class="jo-label">Client Address</div>
    <div class="jo-line"></div>
  </div>

  <div class="jo-field">
    <div class="jo-label">TIN Number</div>
    <div class="jo-line"></div>
  </div>

  <div class="jo-field">
    <div class="jo-label">Job Description</div>
    <div class="jo-box"></div>
  </div>

  <div class="jo-field">
    <div class="jo-label">Person in Charge</div>
    <div class="jo-line"></div>
  </div>

  <div class="jo-row">
    <div class="jo-field">
      <div class="jo-label">Start</div>
      <div class="jo-line"></div>
    </div>
    <div class="jo-field">
      <div class="jo-label">Finish</div>
      <div class="jo-line"></div>
    </div>
  </div>

  <div class="signs">
    <div class="sign">
      <div style="height:44px"></div>
      <div class="sign-line"><span class="sign-role">Prepared By</span></div>
      <div class="sign-sub">Signature over printed name</div>
    </div>
    <div class="sign">
      <div style="height:44px"></div>
      <div class="sign-line"><span class="sign-role">Received By</span></div>
      <div class="sign-sub">Signature over printed name</div>
    </div>
  </div>`;

  const html = renderPrintDocument({
    title: 'Job Order',
    docTitle: 'JOB ORDER',
    css,
    body,
  });

  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => { w.print(); };
  return { ok: true };
}
