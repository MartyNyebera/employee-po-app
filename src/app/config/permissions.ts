// Single source of truth for role-based module visibility on the admin side.
// Mirrors server/auth.js effectiveRole + the permissions matrix in the plan.
//   manage = full CRUD · view = read-only · none = hidden (sidebar entry + content)
//
// "owner" is the effective role of a super admin; a regular admin is "admin".

// 'office_admin' is the combined bookkeeper + purchasing role for the common case
// where one person does both jobs. It is composed programmatically below (NOT typed by
// hand) so any future change to bookkeeper or purchasing access flows through automatically.
export type Role = 'owner' | 'admin' | 'bookkeeper' | 'purchasing' | 'office_admin' | 'employee' | 'driver';
export type Access = 'manage' | 'view' | 'none';

// Strength ordering so the combined role gets the *stronger* of the two source accesses.
const ACCESS_RANK: Record<Access, number> = { none: 0, view: 1, manage: 2 };
const strongestAccess = (a: Access = 'none', b: Access = 'none'): Access =>
  ACCESS_RANK[a] >= ACCESS_RANK[b] ? a : b;

// Base matrix. office_admin is intentionally absent here — it is derived from
// bookkeeper ∪ purchasing in MODULE_ACCESS below. bookkeeper and purchasing remain
// first-class roles so the combined job can be split back apart later.
const BASE_ACCESS: Record<string, Partial<Record<Role, Access>>> = {
  // Money / sales
  home:             { owner: 'manage', admin: 'manage', bookkeeper: 'view',   purchasing: 'none'   },
  orders:           { owner: 'manage', admin: 'manage', bookkeeper: 'view',   purchasing: 'none'   },
  'purchase-orders':{ owner: 'manage', admin: 'manage', bookkeeper: 'view',   purchasing: 'manage' },
  miscellaneous:    { owner: 'manage', admin: 'manage', bookkeeper: 'manage', purchasing: 'none'   },
  customers:        { owner: 'manage', admin: 'manage', bookkeeper: 'view',   purchasing: 'none'   },
  // Supply
  suppliers:        { owner: 'manage', admin: 'manage', bookkeeper: 'none',   purchasing: 'manage' },
  inquiries:        { owner: 'manage', admin: 'manage', bookkeeper: 'none',   purchasing: 'manage' },
  inventory:        { owner: 'manage', admin: 'manage', bookkeeper: 'view',   purchasing: 'manage' },
  'request-form':   { owner: 'manage', admin: 'manage', bookkeeper: 'none',   purchasing: 'manage' },
  // Fleet / ops — owner + admin only
  fleet:                { owner: 'manage', admin: 'manage' },
  pms:                  { owner: 'manage', admin: 'manage' },
  gps:                  { owner: 'manage', admin: 'manage' },
  deliveries:           { owner: 'manage', admin: 'manage' },
  'delivery-management':{ owner: 'manage', admin: 'manage' },
  drivers:              { owner: 'manage', admin: 'manage' },
  'driver-vehicles':    { owner: 'manage', admin: 'manage' },
  transactions:         { owner: 'manage', admin: 'manage' },
  'employee-approvals': { owner: 'manage', admin: 'manage' },
  'driver-approvals':   { owner: 'manage', admin: 'manage' },
  // Owner only
  requests:         { owner: 'manage' },
  staff:            { owner: 'manage' },
};

// Final matrix = BASE_ACCESS with office_admin injected as bookkeeper ∪ purchasing per
// module. Where both source roles have no access (e.g. the owner-only `staff` screen
// and all fleet/ops modules), office_admin is simply not added, so it
// can never see Staff Accounts or the Driver/fleet screens.
export const MODULE_ACCESS: Record<string, Partial<Record<Role, Access>>> =
  Object.fromEntries(
    Object.entries(BASE_ACCESS).map(([module, access]) => {
      const combined = strongestAccess(access.bookkeeper, access.purchasing);
      return [module, combined === 'none' ? access : { ...access, office_admin: combined }];
    })
  );

export function moduleAccess(role: Role | null | undefined, module: string): Access {
  if (!role) return 'none';
  const m = MODULE_ACCESS[module];
  return (m && (m[role] as Access)) || 'none';
}

export function canView(role: Role | null | undefined, module: string): boolean {
  return moduleAccess(role, module) !== 'none';
}

export function canManage(role: Role | null | undefined, module: string): boolean {
  return moduleAccess(role, module) === 'manage';
}
