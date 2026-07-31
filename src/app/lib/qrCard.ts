// Printable employee QR ID card. Encodes ONLY the person's qr_token (an opaque UUID) —
// never their name or a sequential id — so the printed code maps to exactly one person
// without leaking anything guessable. Uses the `qrcode` library to render the code to a
// PNG data-URL and prints a card-sized layout in a pop-up window.
//
// Layout is sized in real millimetres at CR80 / credit-card scale (85.6mm × 54mm) with an
// @page A4 sheet, so it prints physically correct instead of screen-pixel-sized. Cards tile
// in a 2-column grid down the A4 page, each with a faint cut border, so a batch of employees
// can be printed and cut out efficiently. Token/scan behaviour is unchanged — layout only.
import QRCode from 'qrcode';
import { COMPANY } from './printChrome';

export interface QrCardPerson {
  full_name: string;
  department?: string | null;
  position?: string | null;
  qr_token: string;
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// CR80 credit-card size = 85.6mm × 54mm. QR ~28mm square. All layout in mm / pt so the
// physical print is correct regardless of screen DPI. On A4 (210mm), two 85.6mm cards + a
// 6mm gutter fit the printable width; ~5 rows fit the height → up to 10 cards per page.
const CARD_STYLES = `
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #eceff1; }
  .toolbar { display: flex; align-items: center; gap: 14px; padding: 12px 18px; background: #fff; border-bottom: 1px solid #ddd; font-size: 13px; color: #444; }
  .toolbar button { padding: 8px 18px; border: none; border-radius: 6px; background: #111; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }
  .sheet { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6mm; padding: 10mm; }
  .card {
    width: 85.6mm; height: 54mm; background: #fff;
    border: 0.3mm solid #9aa0a6;           /* faint cut line */
    border-radius: 3mm; padding: 4mm;
    display: flex; align-items: center; gap: 4mm;
    break-inside: avoid; page-break-inside: avoid;
  }
  .qr { width: 28mm; height: 28mm; flex-shrink: 0; display: block; }
  .info { flex: 1 1 auto; min-width: 0; height: 100%; display: flex; flex-direction: column; }
  .co { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #222; }
  .name { font-size: 12pt; font-weight: 700; line-height: 1.15; margin-top: 2mm; word-break: break-word; }
  .pos { font-size: 8.5pt; color: #333; line-height: 1.2; margin-top: 1mm; word-break: break-word; }
  .hint { font-size: 6.5pt; color: #777; margin-top: auto; }
  @media print {
    body { background: #fff; }
    .no-print { display: none !important; }
    .sheet { padding: 0; gap: 6mm; }
  }
`;

function cardHtml(person: QrCardPerson, dataUrl: string): string {
  const pos = [person.position, person.department].filter(Boolean).map(esc).join(' &middot; ');
  return `<div class="card">
    <img class="qr" src="${dataUrl}" alt="QR code" />
    <div class="info">
      <div class="co">${esc(COMPANY.name)}</div>
      <div class="name">${esc(person.full_name)}</div>
      <div class="pos">${pos || '&nbsp;'}</div>
      <div class="hint">Scan at the time station to clock in / out</div>
    </div>
  </div>`;
}

// Render QR ID cards for one or more people onto an A4 sheet and open the print dialog.
export async function printQrCards(persons: QrCardPerson[]): Promise<void> {
  if (!persons.length) return;
  // errorCorrectionLevel 'M' + a source width well above the 28mm display size keeps the code
  // crisp and scannable after the browser downscales it for print.
  const cards = await Promise.all(
    persons.map(async (p) =>
      cardHtml(p, await QRCode.toDataURL(p.qr_token, { margin: 1, width: 512, errorCorrectionLevel: 'M' }))
    )
  );

  const w = window.open('', '_blank');
  if (!w) throw new Error('Pop-up blocked — allow pop-ups to print the QR card.');

  const count = persons.length;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>QR ID Cards${count === 1 ? ' — ' + esc(persons[0].full_name) : ' (' + count + ')'}</title>
<style>${CARD_STYLES}</style></head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Print</button>
    <span>${count} card${count === 1 ? '' : 's'} · CR80 (85.6 × 54 mm) on A4 — cut along the faint borders.</span>
  </div>
  <div class="sheet">${cards.join('')}</div>
  <script>
    (function () {
      var imgs = Array.prototype.slice.call(document.images);
      var left = imgs.length;
      function done() { if (--left <= 0) { window.focus(); window.print(); } }
      if (!left) { window.focus(); window.print(); return; }
      imgs.forEach(function (im) { if (im.complete) done(); else { im.onload = done; im.onerror = done; } });
    })();
  </script>
</body></html>`;
  w.document.write(html);
  w.document.close();
}

// Single-card convenience — same layout, one card centred on the page.
export async function printQrCard(person: QrCardPerson): Promise<void> {
  return printQrCards([person]);
}
