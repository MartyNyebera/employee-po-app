// What a purchase order was bought FOR (its project, trading deal or facility), as the server
// resolved it from the order's purchase request. Display-only: the server sends allocationType /
// allocationName / allocationKey on each order and payable; nothing here decides what an allocation is.
import type { CSSProperties } from 'react';

export type AllocType = 'project' | 'trading' | 'facility' | 'trading-general' | 'personal';

export interface Allocated {
  allocationType?: AllocType | null;
  allocationName?: string | null;
  allocationId?: string | null;
  allocationKey?: string | null;
}

export const ALLOC_LABEL: Record<AllocType, string> = {
  project: 'Project', trading: 'Trading', facility: 'Facility', 'trading-general': 'Trading-general', personal: 'Personal',
};
const TYPE_FILTERS: AllocType[] = ['project', 'trading', 'facility', 'trading-general', 'personal'];

// Inline styles so it reads the same inside the Tailwind portals and the inline-styled admin pages.
const tagStyle: CSSProperties = {
  display: 'inline-block', padding: '1px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 600,
  letterSpacing: '0.02em', color: '#5a5a5a', backgroundColor: '#f4f4f4', border: '1px solid #d6d6d6',
  whiteSpace: 'nowrap', verticalAlign: 'middle',
};

/** Name plus a small type tag. An order with no purchase request behind it shows a dash. */
export function AllocationTag({ a, maxWidth, stacked }: { a: Allocated; maxWidth?: number; stacked?: boolean }) {
  if (!a.allocationType || !a.allocationName) return <span style={{ color: '#8a8a8a' }}>—</span>;
  const name = (
    <span title={a.allocationName} style={maxWidth ? { display: 'inline-block', maxWidth, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' } : undefined}>
      {a.allocationName}
    </span>
  );
  const tag = <span style={tagStyle}>{ALLOC_LABEL[a.allocationType]}</span>;
  return stacked
    ? <span style={{ display: 'block' }}><span style={{ display: 'block' }}>{name}</span>{tag}</span>
    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%' }}>{name}{tag}</span>;
}

/** Plain text for places that can't take markup (a native <option>, a title). */
export const allocationText = (a: Allocated) =>
  a.allocationType && a.allocationName ? `${a.allocationName} · ${ALLOC_LABEL[a.allocationType]}` : '—';

/** '' = everything; 'type:project' = every order of that type; otherwise an allocationKey (one named target). */
export function matchesAllocation(a: Allocated, filter: string): boolean {
  if (!filter) return true;
  if (filter.startsWith('type:')) return a.allocationType === filter.slice(5);
  return a.allocationKey === filter;
}

/** The filter dropdown: the types, then each project / deal / facility that actually has an order. */
export function AllocationFilter({ rows, value, onChange, className, style }: {
  rows: Allocated[]; value: string; onChange: (v: string) => void; className?: string; style?: CSSProperties;
}) {
  const named = new Map<string, { name: string; type: AllocType }>();
  for (const r of rows) {
    if (r.allocationKey && r.allocationId && r.allocationType && r.allocationName) named.set(r.allocationKey, { name: r.allocationName, type: r.allocationType });
  }
  const group = (t: AllocType, label: string) => {
    const items = [...named.entries()].filter(([, v]) => v.type === t).sort((a, b) => a[1].name.localeCompare(b[1].name));
    return items.length ? <optgroup key={t} label={label}>{items.map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</optgroup> : null;
  };
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className} style={style} title="Filter by what the order was bought for">
      <option value="">All allocations</option>
      <optgroup label="By type">
        {TYPE_FILTERS.map(t => <option key={t} value={`type:${t}`}>{ALLOC_LABEL[t]}</option>)}
      </optgroup>
      {group('project', 'Projects')}
      {group('trading', 'Trading deals')}
      {group('facility', 'Facilities')}
    </select>
  );
}
