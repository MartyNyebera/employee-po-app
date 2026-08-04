// ============================================================================
// Inventory unit rules — the Unit dropdown depends on the item name (type).
//
// A case-insensitive SUBSTRING match is done on the item NAME against each rule's `match` keyword
// (so "s1", "S1", and "S1 Coupler" all match the "s1" rule). The first matching rule wins and its
// `units` become the only choices for that item's Unit field. When no rule matches, the caller keeps
// its current behavior (free-text unit / existing default dropdown) and does not restrict anything.
//
// To extend: add a rule below — no other code changes needed. Used by the Admin Add/Edit Inventory
// modals and the Warehouse add-item form.
// ============================================================================
export const UNIT_RULES: { match: string; units: string[] }[] = [
  { match: 's1', units: ['ELF', 'MD', 'DT'] },
  { match: 'vibro', units: ['ELF', 'MD', 'DT'] },
  { match: 'giy', units: ['KG'] },
  { match: 'diesel', units: ['LOT'] },
];

// Returns the allowed units for a name (first case-insensitive substring match), or null when no
// rule matches — in which case the caller should leave its Unit field exactly as it was.
export function allowedUnitsForName(name: string | null | undefined): string[] | null {
  const n = (name || '').toLowerCase();
  for (const rule of UNIT_RULES) {
    if (rule.match && n.includes(rule.match)) return rule.units;
  }
  return null;
}
