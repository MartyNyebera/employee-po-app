// Shared building blocks for the CRM / pipeline admin pages (Suppliers, Customers,
// Inquiries/Quotations, Product Lines, Work Schedule, Staff Accounts). Matches the
// inline-style look of the existing "*-Professional" pages.
import { ReactNode } from 'react';
import { X } from 'lucide-react';

export const peso = (n: number | null | undefined) =>
  n === null || n === undefined || isNaN(Number(n))
    ? '—'
    : '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const S = {
  page: { padding: '32px', backgroundColor: '#ececec', minHeight: '100%' } as React.CSSProperties,
  h1: { fontSize: '28px', fontWeight: 700, color: '#000000', margin: 0 } as React.CSSProperties,
  sub: { fontSize: '14px', color: '#5a5a5a', marginTop: '4px' } as React.CSSProperties,
  // White on brand gold — the requested brand style for the "+ Account" buttons (matches the
  // dashboard Export button); below AA contrast, but intentional.
  // fontFamily: 'inherit' on every control below is load-bearing, not decoration: <button>,
  // <input> and <select> do NOT inherit the body's Poppins (theme.css) — browsers force their
  // own control font. Without it a 12px button renders visibly larger than 12px Poppins text
  // beside it, because the fallback face has a bigger x-height at the same pixel size.
  // inline-flex + nowrap + flex-shrink:0 keep "+ Account" on ONE line: the button is a flex item
  // beside a long heading, so without these it gets squeezed and the label wraps under the icon.
  addBtn: { display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', flexShrink: 0, padding: '10px 18px', backgroundColor: '#d1b01b', color: '#ffffff', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit' } as React.CSSProperties,
  input: { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#fff', fontFamily: 'inherit' } as React.CSSProperties,
  label: { display: 'block', fontSize: '12px', fontWeight: 600, color: '#262626', marginBottom: '6px' } as React.CSSProperties,
  card: { backgroundColor: '#fff', border: '1px solid #d6d6d6', borderRadius: '14px', overflow: 'hidden' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const },
  // Neutral grey band distinguishes the header from the white table body.
  th: { padding: '14px 16px', textAlign: 'left' as const, fontSize: '11px', fontWeight: 700, color: '#262626', textTransform: 'uppercase' as const, letterSpacing: '0.04em', borderBottom: '1px solid #d6d6d6', backgroundColor: '#ececec' },
  td: { padding: '14px 16px', fontSize: '14px', color: '#262626', borderBottom: '1px solid #e6e6e6' } as React.CSSProperties,
  rowBtn: { padding: '6px 10px', borderRadius: '6px', border: '1px solid #d6d6d6', backgroundColor: '#fff', color: '#262626', cursor: 'pointer', fontSize: '12px', fontWeight: 600, marginLeft: '6px', fontFamily: 'inherit' } as React.CSSProperties,
};

export function badge(text: string, color: string, bg: string) {
  return (
    <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, color, backgroundColor: bg, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// On-palette status coding. Three tones only — the palette has no green/amber, so
// good/pending/bad collapse onto gold / neutral-gray / red. `statusToneFor` maps every domain
// status word onto a tone; `tonePill` renders the standard pill; `toneText` is the plain gold/
// gray/red text used inside the minimal list rows (no pill).
export type Tone = 'good' | 'pending' | 'bad';

export const TONE: Record<Tone, { text: string; bg: string; border: string }> = {
  good:    { text: '#7a6a0c', bg: '#ececec', border: '#e3ca63' },
  pending: { text: '#5a5a5a', bg: '#f4f4f4', border: '#d6d6d6' },
  bad:     { text: '#b91c1c', bg: '#f4f4f4', border: '#d6d6d6' },
};

const GOOD = new Set(['approved', 'active', 'paid', 'completed', 'complete', 'won', 'in-stock', 'received', 'delivered', 'on-file', 'excellent']);
const BAD = new Set(['rejected', 'disapproved', 'inactive', 'lost', 'cancelled', 'canceled', 'out-of-stock', 'high', 'poor', 'overdue']);

export function statusToneFor(status: string): Tone {
  const s = (status || '').toLowerCase();
  if (GOOD.has(s)) return 'good';
  if (BAD.has(s)) return 'bad';
  return 'pending'; // pending / reviewed / verified / ordered / in-progress / awaiting / low-stock / normal / lead / new …
}

export function toneText(status: string): string {
  return TONE[statusToneFor(status)].text;
}

// A pill with an EXPLICIT tone — for badges whose label doesn't map cleanly through
// statusToneFor (e.g. "Excellent"/"Owner"/domain words). Same shape as tonePill.
export function pill(label: string, tone: Tone) {
  const t = TONE[tone];
  return (
    <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, color: t.text, backgroundColor: t.bg, border: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

// A pill coloured by the status' tone. `label` defaults to a Title-cased status.
export function tonePill(status: string, label?: string) {
  const t = TONE[statusToneFor(status)];
  const text = label ?? (status ? status.charAt(0).toUpperCase() + status.slice(1) : status);
  return (
    <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, color: t.text, backgroundColor: t.bg, border: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: wide ? '760px' : '560px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #d6d6d6' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#000000', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5a5a' }}><X size={20} /></button>
        </div>
        <div style={{ padding: '24px', overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ display: 'flex', gap: '12px', padding: '16px 24px', borderTop: '1px solid #d6d6d6' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...S.input, ...(props.style || {}) }} />;
}

export function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
      <option value="">{placeholder || 'Select…'}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ ...S.input, minHeight: '70px', resize: 'vertical', ...(props.style || {}) }} />;
}

export function PrimaryBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: 'none', background: '#d1b01b', color: '#000000', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', opacity: rest.disabled ? 0.6 : 1 }}>{children}</button>;
}

export function GhostBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #d6d6d6', background: '#fff', color: '#262626', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>{children}</button>;
}
