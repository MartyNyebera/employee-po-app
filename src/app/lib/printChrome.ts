// ============================================================================
// Shared print chrome — one letterhead + footer for every printed document in the system.
//
// Two things every document now shares, so they only have to be right once:
//
//   • Header (#2): ONLY the company name, plus the document title in a bordered rectangle (#3).
//     The old "KIMOEL TRACKING SYSTEM" line and the address/contact/proprietor lines are gone
//     from the header.
//   • Footer (#2): the address + tel/email. The old redundant "PO xxx | … | KIMOEL …" footer
//     is gone; the contact block that used to sit under the header lives here now.
//
// Multi-page (#4): the header and footer repeat on EVERY printed page. This uses a
// <table> with <thead>/<tfoot> rather than `position: fixed`, because a table-header-group /
// table-footer-group is the one technique browsers both REPEAT on each page AND reserve
// vertical space for — a fixed element repeats visually but overlaps the continuation content
// on page 2+. All document content goes in the single <tbody> cell and flows between them.
// ============================================================================

export const COMPANY = {
  name: 'KIMOEL TRADING & CONSTRUCTION INCORPORATED',
  address: 'PUROK 1, LODLOD, LIPA CITY, BATANGAS',
  contact: 'Tel: (043) - 741 - 2023  ·  Email: kimoel_leotagle@yahoo.com',
};

// Minimal escaper — the chrome only interpolates a caller-supplied title, but escape it anyway
// (a document title can carry a PO/PR number that is safe, but never assume).
const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// The base stylesheet. A document appends its own content CSS (tables, info boxes, signatures…)
// after this — it must NOT redefine @page, body, .print-header/.print-footer/.company-name/
// .document-title, which live here so #2/#3/#4 are a single-source change.
export const PRINT_CHROME_CSS = `
  @page { margin: 0.5in; size: A4; }
  html, body { height: 100%; }
  body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.3; color: black; margin: 0; padding: 0; background: white; }
  /* The whole document is one table so the header/footer groups repeat per page. With html/body
     at full height and the table at height:100%, the single <tbody> row absorbs the slack — which
     drops the repeating <tfoot> to the physical bottom of the page (#5). */
  .print-page { width: 100%; border-collapse: collapse; height: 100%; }
  .print-page > thead { display: table-header-group; }
  .print-page > tfoot { display: table-footer-group; }
  .print-page > thead > tr > td,
  .print-page > tfoot > tr > td { padding: 0; }
  /* The body cell fills the remaining height so an opt-in bottom-pinned block (e.g. the PO
     signatures, #7) can sink to just above the footer. */
  .print-page > tbody > tr > td { padding: 0; height: 100%; }
  /* Extra top/bottom breathing room around the KIMOEL letterhead (#5, deepened per follow-up). */
  .print-header { padding: 28px 0 20px; }
  .print-body { padding: 6px 2px 10px; height: 100%; box-sizing: border-box; }
  /* Opt-in: a body that wraps itself in .print-fill becomes a full-height flex column, so a
     child given margin-top:auto (the PO signature block) is pushed to the page bottom (#7). */
  .print-fill { display: flex; flex-direction: column; min-height: 100%; }
  .print-foot { padding: 6px 0 2px; }
  .company-name { text-align: center; font-size: 15pt; font-weight: bold; margin-bottom: 8px; }
  /* #3 — the document title in a bordered rectangle, on EVERY document (not just orders). */
  .document-title { text-align: center; font-size: 14pt; font-weight: bold; border: 2px solid black; padding: 6px 10px; margin: 0 auto; }
  .print-foot-inner { text-align: center; font-size: 8.5pt; color: #222; border-top: 1px solid #000; padding-top: 5px; }
  .print-foot-inner .addr { font-weight: bold; }
`;

// An empty docTitle renders the company name ALONE (no bordered rectangle) — used when a
// document wants to place its own title elsewhere in the body (e.g. the PR prints "PURCHASE
// REQUEST" beneath the meta block, #4). Every order/receipt still passes a real title.
export function printHeaderHtml(docTitle: string): string {
  return `<div class="print-header">
    <div class="company-name">${esc(COMPANY.name)}</div>
    ${docTitle ? `<div class="document-title">${esc(docTitle)}</div>` : ''}
  </div>`;
}

export function printFooterHtml(): string {
  return `<div class="print-foot"><div class="print-foot-inner">
    <div class="addr">${esc(COMPANY.address)}</div>
    <div>${esc(COMPANY.contact)}</div>
  </div></div>`;
}

// Assemble a complete printable document. `css` is the document's own content styles; `body`
// is the inner HTML that flows between the repeating header and footer.
export function renderPrintDocument(opts: { title: string; docTitle: string; css?: string; body: string }): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>${PRINT_CHROME_CSS}${opts.css || ''}</style></head>
<body>
  <table class="print-page">
    <thead><tr><td>${printHeaderHtml(opts.docTitle)}</td></tr></thead>
    <tfoot><tr><td>${printFooterHtml()}</td></tr></tfoot>
    <tbody><tr><td><div class="print-body">${opts.body}</div></td></tr></tbody>
  </table>
</body></html>`;
}
