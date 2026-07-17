import { useEffect, useState } from 'react';

// A promise-based confirmation dialog to replace the browser's confirm() everywhere.
//
// Why a global singleton rather than a per-component <ConfirmDialog>: there are seven
// independent portal React trees plus the admin dashboard, all under one Router. A single
// <ConfirmHost/> mounted once at the app root (beside <Toaster/>) serves every one of them,
// and `confirmDialog(...)` can be called from any handler — including plain async functions —
// exactly like the `confirm()` it replaces:
//
//   if (!(await confirmDialog({ title: 'Reject PR-0007?', message: '…', tone: 'danger' }))) return;
//
// The host renders its own overlay + card (not the admin crmKit Modal), so it looks identical
// in every portal regardless of the `.admin-portal` scoping or a portal's own styling.

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // 'danger' → red primary button (reject / delete / cancel).
  // 'default' → gold primary button (approve / add / confirm).
  tone?: 'danger' | 'default';
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

// Module-level store. One subscriber (the host); listeners are notified whenever the pending
// request changes. Kept deliberately tiny — no context, no external dep.
let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  // If a dialog is somehow already open, resolve it false first so we never strand a promise.
  if (current) { current.resolve(false); current = null; }
  return new Promise<boolean>((resolve) => {
    current = { ...opts, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  if (!current) return;
  const { resolve } = current;
  current = null;
  emit();
  resolve(ok);
}

export function ConfirmHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  // Esc = cancel, Enter = confirm — only while a dialog is open.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); settle(false); }
      else if (e.key === 'Enter') { e.preventDefault(); settle(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);

  if (!current) return null;
  const { title, message, confirmLabel, cancelLabel, tone = 'default' } = current;
  const danger = tone === 'danger';

  return (
    <div
      onClick={() => settle(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        fontFamily: 'Poppins, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%', maxWidth: '420px', background: '#fff', borderRadius: '14px',
          border: '1px solid #d6d6d6', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ padding: '20px 22px 8px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#000' }}>{title}</h3>
          {message && <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#3d3d3d', lineHeight: 1.5 }}>{message}</p>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 22px 20px' }}>
          <button
            onClick={() => settle(false)}
            style={{
              padding: '8px 16px', fontSize: '14px', fontWeight: 500, borderRadius: '8px',
              border: '1px solid #d6d6d6', background: '#fff', color: '#262626', cursor: 'pointer',
            }}
          >
            {cancelLabel || 'Cancel'}
          </button>
          <button
            onClick={() => settle(true)}
            autoFocus
            style={{
              padding: '8px 16px', fontSize: '14px', fontWeight: 600, borderRadius: '8px',
              border: 'none', cursor: 'pointer', color: '#fff',
              background: danger ? '#dc2626' : '#d1b01b',
            }}
          >
            {confirmLabel || (danger ? 'Confirm' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
