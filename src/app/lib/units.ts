// ============================================================================
// THE unit list. Every dropdown that offers a unit builds its options from here, so a new unit is
// added in ONE place (UNIT_CATALOG below) and then named in whichever screen lists it.
//
//   value  what is stored on the line / inventory row
//   label  the friendly text (inventory dropdowns show this: "Kilograms")
//   plain  the text the older request/sales/warehouse dropdowns show ("kg"); equals `value` for every
//          unit that existed before the catalog, so those screens read exactly as they always did
//
// Each screen keeps its own subset (UNITS_* below): a screen whose list was intentionally shorter —
// Sales — stays shorter. The Warehouse name rules (inventoryUnits.ts) still narrow that screen's list
// per item and sit on top of UNITS_WAREHOUSE.
//
// CUBIC LINES. The unit cu.m. ("Cubic meter") is the one unit with a structured quantity: No. of loads
// x Cubic per load = Total cubic, and the Total cubic IS the line's `quantity` — so price per cubic
// meter, amount, receiving, inventory and spend all work unchanged. The three extra keys are stored
// on the line next to it: loads, cubicPerLoad, loadType (all optional; absent on every other line).
// ============================================================================

export interface UnitDef { value: string; label: string; plain: string }

const def = (value: string, label: string, plain: string = value): UnitDef => ({ value, label, plain });

export const UNIT_CATALOG: UnitDef[] = [
  def('pcs', 'Pieces'),
  def('pieces', 'Pieces'),
  def('bags', 'Bags'),
  def('kg', 'Kilograms'),
  def('liters', 'Liters'),
  def('gallons', 'Gallons'),
  def('meters', 'Meters'),
  def('boxes', 'Boxes'),
  def('box', 'Box'),
  def('sets', 'Sets'),
  def('Lot', 'Lot'),
  def('units', 'Units'),
  def('roll', 'Roll/s', 'Roll/s'),
  def('cu.m.', 'Cubic meter', 'Cubic meter'),
];

const BY_VALUE = new Map(UNIT_CATALOG.map(u => [u.value, u]));
const pick = (values: string[]): UnitDef[] => values.map(v => BY_VALUE.get(v)!);

// Each screen's current options, plus Roll/s and Cubic meter.
export const UNITS_REQUEST   = pick(['pcs', 'bags', 'kg', 'liters', 'gallons', 'meters', 'boxes', 'sets', 'Lot', 'units', 'roll', 'cu.m.']);       // PR form, Requests page
export const UNITS_SALES     = pick(['pcs', 'sets', 'units', 'Lot', 'kg', 'gallons', 'meters', 'boxes', 'roll', 'cu.m.']);                         // intentionally shorter
export const UNITS_WAREHOUSE = pick(['pcs', 'pieces', 'bags', 'kg', 'liters', 'gallons', 'meters', 'boxes', 'sets', 'Lot', 'units', 'roll', 'cu.m.']);
export const UNITS_INVENTORY = pick(['pcs', 'box', 'kg', 'liters', 'gallons', 'meters', 'sets', 'units', 'roll', 'cu.m.']);                         // inventory add/edit (friendly labels)
export const UNITS_EMPLOYEE  = pick(['pcs', 'kg', 'liters', 'gallons', 'meters', 'boxes', 'sets', 'roll', 'cu.m.']);                                 // employee item request
// Suggestions for the free-text unit boxes (PO, PR edit, DR, BI): everything, in catalog order.
export const UNITS_ALL = UNIT_CATALOG;

// ---------------------------------------------------------------------------------------------
// Cubic lines
// ---------------------------------------------------------------------------------------------
export const CUBIC_UNIT = 'cu.m.';
export const isCubicUnit = (unit: unknown) => String(unit ?? '').trim().toLowerCase() === CUBIC_UNIT;

export interface CubicLike {
  unit?: unknown; quantity?: unknown; loads?: unknown; cubicPerLoad?: unknown; loadType?: unknown;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pos = (v: unknown): number | null => {
  const n = Number(String(v ?? '').trim());
  return String(v ?? '').trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/** Total cubic = loads x cubic per load, rounded to 2 decimals; null until both are positive numbers. */
export function cubicTotal(loads: unknown, cubicPerLoad: unknown): number | null {
  const l = pos(loads), c = pos(cubicPerLoad);
  return l === null || c === null ? null : round2(l * c);
}

/** True when this line is a cubic line whose stored breakdown still agrees with its quantity. */
export function hasCubicBreakdown(it: CubicLike | null | undefined): boolean {
  if (!it || !isCubicUnit(it.unit)) return false;
  const total = cubicTotal(it.loads, it.cubicPerLoad);
  const q = Number(it.quantity);
  return total !== null && Number.isFinite(q) && Math.abs(q - total) < 0.005;
}

/** "2 loads × 2.6 cu.m. (Mini dam)", or null when the line has no (consistent) breakdown. */
export function cubicBreakdownText(it: CubicLike | null | undefined): string | null {
  if (!it || !hasCubicBreakdown(it)) return null;
  const l = Number(it.loads), c = Number(it.cubicPerLoad);
  const type = String(it.loadType ?? '').trim();
  return `${l} ${l === 1 ? 'load' : 'loads'} × ${c} ${CUBIC_UNIT}${type ? ` (${type})` : ''}`;
}

/** Description for a print/export: the original text untouched, plus the breakdown on a cubic line. */
export function lineDescription<T extends string>(it: CubicLike | null | undefined, original: T): T | string {
  const b = cubicBreakdownText(it);
  return b ? `${original}, ${b}` : original;
}

/** Quantity for a print/export: the original value untouched, except a cubic line prints 2 decimals (5.20). */
export function lineQty<T>(it: CubicLike | null | undefined, original: T): T | string {
  return hasCubicBreakdown(it) ? Number(it!.quantity).toFixed(2) : original;
}

/** The three stored cubic keys to carry onto the next document (PR -> PO -> DR -> BI); {} for any other line. */
export function cubicKeys(it: CubicLike | null | undefined): { loads?: number; cubicPerLoad?: number; loadType?: string | null } {
  if (!it || !hasCubicBreakdown(it)) return {};
  return { loads: Number(it.loads), cubicPerLoad: Number(it.cubicPerLoad), loadType: String(it.loadType ?? '').trim() || null };
}
