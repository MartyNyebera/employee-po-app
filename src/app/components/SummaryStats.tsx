// A minimal, on-palette summary strip shared by the admin list tabs (Purchase Orders, Sales
// Orders, Purchase Requests, Withdrawal Requests, Inventory). Deliberately NOT a card grid — no
// per-stat borders, backgrounds, or shadows — just a light row of numbers with labels, so it
// reads as a quiet summary above the table rather than a heavy dashboard. `accent` tints the
// number gold (#d1b01b) to flag the "needs attention" bucket.

export interface SummaryItem { label: string; value: number | string; accent?: boolean }

export function SummaryStats({ items }: { items: SummaryItem[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', padding: '0 4px 20px', borderBottom: '1px solid #e6e6e6', marginBottom: '20px' }}>
      {items.map((it, i) => (
        <div key={i}>
          <div style={{ fontSize: '24px', fontWeight: 700, lineHeight: 1.1, color: it.accent ? '#d1b01b' : '#000000', fontFamily: 'Poppins, sans-serif' }}>{it.value}</div>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#8a8a8a', marginTop: '2px', fontFamily: 'Poppins, sans-serif' }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}
