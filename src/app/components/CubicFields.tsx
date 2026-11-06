// Shared pieces for the unit list and for cubic (cu.m.) lines. See lib/units.ts.

import { UNITS_ALL, cubicTotal, type PriceBasis } from '../lib/units';

export const UNIT_DATALIST_ID = 'kimoel-unit-options';

/** Suggestions for a free-text unit box: <input list={UNIT_DATALIST_ID} /> plus one <UnitDatalist /> on the page. */
export function UnitDatalist() {
  return (
    <datalist id={UNIT_DATALIST_ID}>
      {UNITS_ALL.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
    </datalist>
  );
}

/** "Price per load" (default) or "Price per cu.m." -- how the supplier charges a cubic line. */
export function PriceBasisSelect({ value, onChange, disabled = false, className = '' }: {
  value: PriceBasis; onChange: (v: PriceBasis) => void; disabled?: boolean; className?: string;
}) {
  return (
    <select value={value} disabled={disabled} data-price-basis onChange={e => onChange(e.target.value as PriceBasis)}
      className={className || 'w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'}>
      <option value="load">Price per load</option>
      <option value="cum">Price per cu.m.</option>
    </select>
  );
}

export interface CubicValues { loads: string; cubicPerLoad: string; loadType: string; priceBasis: PriceBasis; pricePerLoad: string }

/**
 * The inputs a cubic line has instead of one quantity (No. of loads, Cubic per load), the optional Load type, the
 * read-only Total cubic, and the price basis. On "Price per load" the price box is labeled "Price per load" and lives
 * here; on "Price per cu.m." the caller's normal unit-cost box is the price. The caller owns the state and recomputes
 * the line (units.recalcCubicLine) whenever anything here changes.
 */
export function CubicLoadFields({ values, onChange, readOnly = false, showPrice = true, className = '' }: {
  values: CubicValues; onChange: (patch: Partial<CubicValues>) => void; readOnly?: boolean; showPrice?: boolean; className?: string;
}) {
  const total = cubicTotal(values.loads, values.cubicPerLoad);
  const box = 'w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div className={`space-y-2 ${className}`} data-cubic-fields>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <label className="block text-[11px] text-gray-500">Price basis
          <PriceBasisSelect value={values.priceBasis} disabled={readOnly} onChange={v => onChange({ priceBasis: v })} />
        </label>
        {showPrice && values.priceBasis === 'load' && (
          <label className="block text-[11px] text-gray-500">Price per load
            <input type="number" min="0" step="0.01" value={values.pricePerLoad} disabled={readOnly} data-price-per-load
              onChange={e => onChange({ pricePerLoad: e.target.value })} placeholder="0.00" className={box} />
          </label>
        )}
      </div>
    </div>
  );
}
