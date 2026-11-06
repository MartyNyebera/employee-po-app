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
  price_basis?: unknown; price_per_load?: unknown;
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

// ---------------------------------------------------------------------------------------------
// PRICE BASIS. A cubic line is priced either PER LOAD (the supplier charges per Mini Dam / truck) or
// PER CU.M. A per-load line has amount = No. of loads x price per load, exactly; its quantity stays the
// Total cubic (so receiving and inventory do not change) and its per-cu.m. unit cost is DERIVED
// (amount / total cubic) for costing only -- the amount is authoritative and never recomputed from it.
// A line saved before the price basis existed has no price_basis and stays "per cu.m.".
// ---------------------------------------------------------------------------------------------
export type PriceBasis = 'load' | 'cum';
export const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
const nonNeg = (v: unknown): number | null => {
  const s = String(v ?? '').trim(); const n = Number(s);
  return s !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};

/** 'load' only when the line says so explicitly; every older cubic line is 'cum'. */
export const priceBasisOf = (it: CubicLike | null | undefined): PriceBasis => (it && it.price_basis === 'load' ? 'load' : 'cum');

/** A cubic line whose price basis is per load (a DR carries the basis but no price, so this does not need one). */
export const isLoadBasis = (it: CubicLike | null | undefined): boolean => !!it && hasCubicBreakdown(it) && it.price_basis === 'load';

/** A cubic line priced per load, with a consistent breakdown and a usable price per load. */
export function isPerLoad(it: CubicLike | null | undefined): boolean {
  return !!it && hasCubicBreakdown(it) && it.price_basis === 'load' && nonNeg(it.price_per_load) !== null;
}

/** Exact line amount for a per-load line: No. of loads x price per load, to the centavo; null otherwise. */
export function perLoadAmount(loads: unknown, pricePerLoad: unknown): number | null {
  const l = pos(loads), p = nonNeg(pricePerLoad);
  return l === null || p === null ? null : round2(l * p);
}

/** Derived per-cu.m. unit cost of a per-load line (costing only; the amount stays authoritative). */
export const derivedUnitCost = (amount: number, totalCubic: number): number => (totalCubic > 0 ? round6(amount / totalCubic) : 0);

/** Quantity for a print/export: the original untouched; a per-load cubic line prints its loads (1), a per-cu.m. one 2 decimals (5.20). */
export function lineQty<T>(it: CubicLike | null | undefined, original: T): T | string {
  if (isLoadBasis(it)) return String(Number(it!.loads));
  return hasCubicBreakdown(it) ? Number(it!.quantity).toFixed(2) : original;
}

/** Unit for a print/export: 'load' / 'loads' on a per-load cubic line, otherwise the original. */
export function lineUnit<T>(it: CubicLike | null | undefined, original: T): T | string {
  return isLoadBasis(it) ? (Number(it!.loads) === 1 ? 'load' : 'loads') : original;
}

/** Unit price for a print/export: the price per load on a per-load cubic line, otherwise the original. */
export function linePrice<T>(it: CubicLike | null | undefined, original: T, override?: unknown): T | number {
  return isPerLoad(it) ? Number(override != null && override !== '' ? override : it!.price_per_load) : original;
}

/** The stored cubic keys to carry onto the next document (PR -> PO -> DR -> BI); {} for any other line. */
export function cubicKeys(it: CubicLike | null | undefined): {
  loads?: number; cubicPerLoad?: number; loadType?: string | null; price_basis?: PriceBasis; price_per_load?: number;
} {
  if (!it || !hasCubicBreakdown(it)) return {};
  const out: ReturnType<typeof cubicKeys> = { loads: Number(it.loads), cubicPerLoad: Number(it.cubicPerLoad), loadType: String(it.loadType ?? '').trim() || null };
  if (it.price_basis === 'load' || it.price_basis === 'cum') out.price_basis = it.price_basis;
  if (isPerLoad(it)) out.price_per_load = Number(it.price_per_load);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Form helpers: the forms keep their numbers as strings, so these take and return strings.
// ---------------------------------------------------------------------------------------------
export interface CubicFormLine {
  unit: string; loads?: string; cubicPerLoad?: string; loadType?: string;
  priceBasis?: PriceBasis; pricePerLoad?: string; unitCost: string;
}

/** Quantity (= total cubic), amount and unit cost of a cubic form line, by its price basis (new lines default to per load). */
export function recalcCubicLine(l: CubicFormLine): { quantity: string; amount: number; unitCost: string } {
  const t = cubicTotal(l.loads, l.cubicPerLoad);
  const quantity = t === null ? '' : String(t);
  if ((l.priceBasis ?? 'load') === 'load') {
    const amount = perLoadAmount(l.loads, l.pricePerLoad) ?? 0;
    const have = String(l.pricePerLoad ?? '').trim() !== '';
    return { quantity, amount, unitCost: t !== null && have ? String(derivedUnitCost(amount, t)) : '' };
  }
  return { quantity, amount: (Number(quantity) || 0) * (Number(l.unitCost) || 0), unitCost: l.unitCost };
}

/** The cubic keys a form line sends (nothing until loads and cubic per load are both entered). */
export function cubicPayload(l: CubicFormLine): Record<string, unknown> {
  if (!isCubicUnit(l.unit) || cubicTotal(l.loads, l.cubicPerLoad) === null) return {};
  const basis = l.priceBasis ?? 'load';
  return {
    loads: Number(l.loads), cubicPerLoad: Number(l.cubicPerLoad), loadType: (l.loadType || '').trim() || null,
    price_basis: basis, ...(basis === 'load' ? { price_per_load: Number(l.pricePerLoad) || 0 } : {}),
  };
}
