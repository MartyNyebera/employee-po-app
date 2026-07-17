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
  // Black on brand gold — white on #d1b01b fails contrast.
  // fontFamily: 'inherit' on every control below is load-bearing, not decoration: <button>,
  // <input> and <select> do NOT inherit the body's Poppins (theme.css) — browsers force their
  // own control font. Without it a 12px button renders visibly larger than 12px Poppins text
  // beside it, because the fallback face has a bigger x-height at the same pixel size.
  addBtn: { padding: '10px 18px', backgroundColor: '#d1b01b', color: '#000000', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit' } as React.CSSProperties,
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
