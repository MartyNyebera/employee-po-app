// Shared pieces for the unit list and for cubic (cu.m.) lines. See lib/units.ts.

import { UNITS_ALL, cubicTotal } from '../lib/units';

export const UNIT_DATALIST_ID = 'kimoel-unit-options';

/** Suggestions for a free-text unit box: <input list={UNIT_DATALIST_ID} /> plus one <UnitDatalist /> on the page. */
export function UnitDatalist() {
  return (
    <datalist id={UNIT_DATALIST_ID}>
      {UNITS_ALL.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
    </datalist>
  );
}

export interface CubicValues { loads: string; cubicPerLoad: string; loadType: string }

/**
 * The two inputs a cubic line has instead of one quantity (No. of loads, Cubic per load), the optional
 * Load type, and the read-only Total cubic. The caller owns the state and copies `total` into the line's
 * quantity whenever either number changes.
 */
export function CubicLoadFields({ values, onChange, readOnly = false, className = '' }: {
  values: CubicValues; onChange: (patch: Partial<CubicValues>) => void; readOnly?: boolean; className?: string;
}) {
  const total = cubicTotal(values.loads, values.cubicPerLoad);
  const box = 'w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 items-end ${className}`} data-cubic-fields>
      <label className="block text-[11px] text-gray-500">No. of loads
        <input type="number" min="0" step="1" value={values.loads} disabled={readOnly} data-cubic-loads
          onChange={e => onChange({ loads: e.target.value })} placeholder="e.g. 2" className={box} />
      </label>
      <label className="block text-[11px] text-gray-500">Cubic per load
        <input type="number" min="0" step="0.01" value={values.cubicPerLoad} disabled={readOnly} data-cubic-per
          onChange={e => onChange({ cubicPerLoad: e.target.value })} placeholder="e.g. 2.6" className={box} />
      </label>
      <label className="block text-[11px] text-gray-500">Load type <span className="text-gray-400">(optional)</span>
        <input type="text" maxLength={60} value={values.loadType} disabled={readOnly} data-cubic-type
          onChange={e => onChange({ loadType: e.target.value })} placeholder="e.g. Mini dam" className={box} />
      </label>
      <div className="text-[11px] text-gray-500">Total cubic
        <div className="px-2 py-1.5 text-sm font-semibold text-gray-900 bg-gray-50 border border-gray-200 rounded-md" data-cubic-total>
          {total === null ? '—' : `${total.toFixed(2)} cu.m.`}
        </div>
      </div>
    </div>
  );
}
