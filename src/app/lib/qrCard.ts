// Printable employee QR ID card. Encodes ONLY the person's qr_token (an opaque UUID) —
// never their name or a sequential id — so the printed code maps to exactly one person
// without leaking anything guessable. Uses the `qrcode` library to render the code to a
// PNG data-URL and prints a small card-sized layout in a pop-up window.
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

// Generate the QR and open a print window for one person's ID card.
export async function printQrCard(person: QrCardPerson): Promise<void> {
  // errorCorrectionLevel 'M' + a rendered width well above the on-card display size keeps
  // the code crisp and scannable after the browser downscales it for print.
  const dataUrl = await QRCode.toDataURL(person.qr_token, {
    margin: 1,
    width: 512,
    errorCorrectionLevel: 'M',
  });

  const w = window.open('', '_blank');
  if (!w) throw new Error('Pop-up blocked — allow pop-ups to print the QR card.');

  const meta = [person.position, person.department].filter(Boolean).map(esc).join(' &middot; ');
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>QR Card — ${esc(person.full_name)}</title>
<style>
  @page { margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 24px; background: #fff; color: #000; display: flex; justify-content: center; }
  .card { width: 300px; border: 2px solid #000; border-radius: 14px; padding: 22px; text-align: center; box-sizing: border-box; }
  .co { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 14px; }
  img { width: 260px; height: 260px; }
  .name { font-size: 20px; font-weight: 700; margin: 14px 0 2px; }
  .meta { font-size: 12px; color: #333; min-height: 15px; }
  .hint { font-size: 10px; color: #666; margin-top: 12px; }
</style></head>
<body>
  <div class="card">
    <div class="co">${esc(COMPANY.name)}</div>
    <img src="${dataUrl}" alt="QR code" onload="window.focus();window.print();" />
    <div class="name">${esc(person.full_name)}</div>
    <div class="meta">${meta}</div>
    <div class="hint">Scan at the time station to clock in / out</div>
  </div>
</body></html>`;
  w.document.write(html);
  w.document.close();
}
