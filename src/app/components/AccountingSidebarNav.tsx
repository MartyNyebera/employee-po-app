// ============================================================================
// The Accounting portal's sidebar: grouped, collapsible, with an icon-only minimized strip.
//
// NAVIGATION ONLY. Every item points at a screen that already exists in AccountingPortal; nothing
// here fetches, writes or decides access. An item with no `view` is not built yet and renders
// dimmed with a "Soon" tag and no click handler — there are no placeholder pages behind it, and
// when a screen lands the only change is giving its item a `view`.
//
// The renderer (SidebarNav) is generic over the view ids, so the Administrator dashboard uses the very same
// component with its own groups; AccountingNav below is just SidebarNav bound to the Accounting model.
//
// The model (NAV_TOP / NAV_GROUPS) and the component are deliberately hook-free: AccountingNav is
// a pure function of its props, so the portal owns the state and the behaviour can be exercised
// without a browser. Preferences (minimized, which groups are open) persist per browser in
// localStorage, and every storage access is wrapped — the menu works with storage unavailable
// (private window, blocked site data), it just forgets between visits.
// ============================================================================

import type { ReactNode } from 'react';
import {
  LayoutDashboard, ChevronDown, ChevronRight, ClipboardList, FileText, Plus, PackageMinus, PenTool,
  Briefcase, ArrowLeftRight, Truck, ReceiptText, Users, Building2, CalendarCheck, Calculator, IdCard,
  HandCoins, Coins, ShoppingCart, CreditCard, FileOutput, Wallet, Gift, BookOpen,
} from 'lucide-react';
import { NavBadge } from './NavBadge';

// Every screen the Accounting portal can show. AccountingPortal re-exports this as PortalView.
export type AccountingView =
  | 'new-pr' | 'requests' | 'orders' | 'projects' | 'tradings' | 'facilities' | 'expenses'
  | 'withdrawals' | 'clients' | 'delivery-receipts' | 'billing-invoices' | 'receivables'
  | 'timesheet' | 'payroll' | 'signature' | 'payables' | 'collections' | 'purchases' | 'pcf' | 'thirteenth' | 'gl-accounts' | 'overview';

// Which live count an item wears. The portal supplies the numbers; this file only places them.
export type BadgeKey = 'requests' | 'orders' | 'receivables';

export interface NavItem<V extends string = AccountingView> {
  id: string;
  label: string;
  icon: any;
  // Present = a real screen exists and the item is clickable. Absent = "Soon".
  view?: V;
  // The native tooltip text, exactly as specified for the items that have one.
  hover?: string;
  badge?: string;
}

export interface NavGroup<V extends string = AccountingView> { id: string; label: string; items: NavItem<V>[] }

// The single item above the groups: the Overview screen, which is also the portal's landing page.
export const NAV_TOP: NavItem = { id: 'overview', label: 'OVERVIEW SYSTEM', icon: LayoutDashboard, view: 'overview' };

// Labels are the specified ones, verbatim. Items after the specified ones in a group are screens
// that already existed and are kept reachable in the nearest-fitting group.
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'procurements', label: 'PROCUREMENTS', items: [
      { id: 'pr-request', label: 'PR REQUEST', icon: ClipboardList, view: 'requests', badge: 'requests' },
      { id: 'po-request', label: 'PO REQUEST', icon: FileText, view: 'orders', badge: 'orders' },
      { id: 'new-pr', label: 'NEW PURCHASE REQUEST', icon: Plus, view: 'new-pr' },
      { id: 'withdrawals', label: 'WITHDRAWALS REQUEST', icon: PackageMinus, view: 'withdrawals' },
      // Signs the PR/PO prints, so it lives with them.
      { id: 'signature', label: 'MY SIGNATURE', icon: PenTool, view: 'signature' },
    ],
  },
  {
    id: 'sales', label: 'SALES DISTRIBUTIONS', items: [
      { id: 'contract-services', label: 'CONTRACT SERVICES', icon: Briefcase, view: 'projects' },
      { id: 'contract-trading', label: 'CONTRACT TRADING', icon: ArrowLeftRight, view: 'tradings' },
      { id: 'delivery-receipt', label: 'DELIVERY RECEIPT', icon: Truck, view: 'delivery-receipts' },
      { id: 'customers-billing', label: "CUSTOMER'S BILLING", icon: ReceiptText, view: 'billing-invoices' },
      { id: 'clients', label: 'CLIENTS', icon: Users, view: 'clients' },
      { id: 'facilities', label: 'FACILITIES', icon: Building2, view: 'facilities' },
    ],
  },
  {
    id: 'hr', label: 'HUMAN RESOURCES', items: [
      { id: 'attendance-sheet', label: 'ATTENDANCE SHEET', icon: CalendarCheck, view: 'timesheet' },
      { id: 'payroll-payout', label: 'PAYROLL PAY-OUT', icon: Calculator, view: 'payroll' },
      { id: 'thirteenth-month', label: '13TH MONTH PAY', icon: Gift, view: 'thirteenth', hover: 'Basic earned ÷ 12, post to payroll' },
      // The roster endpoints are admin-only on the server, so Accounting cannot load it. Not widened.
      { id: 'employee-profiles', label: 'EMPLOYEE PROFILES', icon: IdCard },
    ],
  },
  {
    id: 'accounting', label: 'ACCOUNTING', items: [
      { id: 'collections-report', label: 'COLLECTIONS REPORT', icon: HandCoins, view: 'collections', hover: 'Payments received on billing invoices' },
      { id: 'receivable-report', label: 'RECEIVABLE REPORT', icon: Coins, view: 'receivables',
        hover: 'Billing invoice − collection', badge: 'receivables' },
      { id: 'purchases', label: 'PURCHASES', icon: ShoppingCart, view: 'purchases', hover: 'Summary of PO requests' },
      { id: 'payable-report', label: 'PAYABLE REPORT', icon: CreditCard, view: 'payables', hover: 'Purchases − payments' },
      // The voucher list IS the old Expenses History screen, extended: a voucher is the same record,
      // and now can also pay POs. One screen for everything that went out, so no second nav entry.
      { id: 'disbursement-report', label: 'DISBURSEMENT REPORT', icon: FileOutput, view: 'expenses', hover: 'Manual voucher' },
      { id: 'pcf', label: 'PCF', icon: Wallet, view: 'pcf', hover: 'Petty cash fund' },
      { id: 'gl-accounts', label: 'GL ACCOUNTS', icon: BookOpen, view: 'gl-accounts', hover: 'Accounts an expense line can be coded to' },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = [NAV_TOP, ...NAV_GROUPS.flatMap(g => g.items)];

// ---------------------------------------------------------------- preferences

export interface NavPrefs {
  minimized: boolean;
  // groupId -> open. A group with no entry has no saved preference and falls back to "open iff it
  // holds the active screen".
  groups: Record<string, boolean>;
}

export const NAV_PREFS_KEY = 'kimoel.accounting.nav.v1';
const EMPTY_PREFS: NavPrefs = { minimized: false, groups: {} };

// Generic over the groups and the storage key, so each portal remembers its own menu.
export function loadNavPrefsFor(key: string, groups: NavGroup<any>[]): NavPrefs {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...EMPTY_PREFS, groups: {} };
    const p = JSON.parse(raw);
    const saved: Record<string, boolean> = {};
    for (const g of groups) if (p && p.groups && typeof p.groups[g.id] === 'boolean') saved[g.id] = p.groups[g.id];
    return { minimized: !!(p && p.minimized === true), groups: saved };
  } catch {
    // Storage blocked, absent, or holding something unparseable: start from defaults.
    return { ...EMPTY_PREFS, groups: {} };
  }
}

export function saveNavPrefsTo(key: string, prefs: NavPrefs): void {
  try { localStorage.setItem(key, JSON.stringify(prefs)); } catch { /* keep working in memory */ }
}

export function groupForViewIn<V extends string>(groups: NavGroup<V>[], view: V): string | null {
  for (const g of groups) if (g.items.some(i => i.view === view)) return g.id;
  return null;
}

export function isGroupOpenIn<V extends string>(groups: NavGroup<V>[], prefs: NavPrefs, groupId: string, activeView: V): boolean {
  const saved = prefs.groups[groupId];
  return typeof saved === 'boolean' ? saved : groupForViewIn(groups, activeView) === groupId;
}

// State transitions, kept pure so the portal only has to hold the result and the behaviour can be
// tested without a browser.
export function toggleGroupIn<V extends string>(groups: NavGroup<V>[], prefs: NavPrefs, groupId: string, activeView: V): NavPrefs {
  return { ...prefs, groups: { ...prefs.groups, [groupId]: !isGroupOpenIn(groups, prefs, groupId, activeView) } };
}

// Landing in a screen opens the group that holds it, so the active screen is never hidden inside a
// collapsed one. Returns the SAME object when nothing changes, so a state setter that receives it
// does not re-render.
export function revealGroupForIn<V extends string>(groups: NavGroup<V>[], prefs: NavPrefs, view: V): NavPrefs {
  const gid = groupForViewIn(groups, view);
  if (!gid || prefs.groups[gid] === true) return prefs;
  return { ...prefs, groups: { ...prefs.groups, [gid]: true } };
}

// The Accounting portal's bindings of the above (names and behaviour unchanged).
export const loadNavPrefs = (): NavPrefs => loadNavPrefsFor(NAV_PREFS_KEY, NAV_GROUPS);
export const saveNavPrefs = (prefs: NavPrefs): void => saveNavPrefsTo(NAV_PREFS_KEY, prefs);
export const groupForView = (view: AccountingView): string | null => groupForViewIn(NAV_GROUPS, view);
export const isGroupOpen = (prefs: NavPrefs, groupId: string, activeView: AccountingView): boolean => isGroupOpenIn(NAV_GROUPS, prefs, groupId, activeView);
export const toggleGroup = (prefs: NavPrefs, groupId: string, activeView: AccountingView): NavPrefs => toggleGroupIn(NAV_GROUPS, prefs, groupId, activeView);
export const revealGroupFor = (prefs: NavPrefs, view: AccountingView): NavPrefs => revealGroupForIn(NAV_GROUPS, prefs, view);

export function setMinimized(prefs: NavPrefs, minimized: boolean): NavPrefs {
  return prefs.minimized === minimized ? prefs : { ...prefs, minimized };
}

// The native tooltip. Expanded, only items with specified hover text (and the dimmed ones) get
// one; minimized, the label is not visible so the name has to be in the tooltip.
export function itemTitle(it: NavItem<any>, minimized: boolean): string | undefined {
  const soon = !it.view;
  if (minimized) return [it.label, it.hover, soon ? 'Soon' : null].filter(Boolean).join(' — ');
  if (it.hover) return it.hover;
  return soon ? 'Coming soon' : undefined;
}

// ---------------------------------------------------------------- component

export interface SidebarNavProps<V extends string> {
  /** Items above the groups (Accounting has one, the Administrator has two). */
  tops: NavItem<V>[];
  groups: NavGroup<V>[];
  ariaLabel: string;
  activeView: V;
  minimized: boolean;
  prefs: NavPrefs;
  /** Live counts by badge key; an item wears the count named by its `badge`. */
  badges: Partial<Record<string, number>>;
  onNavigate: (view: V) => void;
  onToggleGroup: (groupId: string) => void;
}

// crm-nav-item / crm-nav-group are inert in the Accounting portal. In the Administrator dashboard a blanket
// `.admin-portal button` rule pins every button to 14px/500 with !important, and these two classes (see
// professional-design-complete.css) put the menu's own 13px / 11px sizes back, so both portals look alike.
export function SidebarNav<V extends string>({ tops, groups, ariaLabel, activeView, minimized, prefs, badges, onNavigate, onToggleGroup }: SidebarNavProps<V>) {
  const countOf = (it: NavItem<V>) => (it.badge ? (badges[it.badge] ?? 0) : 0);

  const renderItem = (it: NavItem<V>, nested: boolean): ReactNode => {
    const Icon = it.icon;
    const title = itemTitle(it, minimized);
    const pad = minimized ? 'justify-center px-3 py-2.5' : nested ? 'pl-4 pr-3 py-2' : 'px-3 py-2.5';
    const base = `crm-nav-item relative w-full flex items-center gap-3 rounded-lg text-[13px] font-medium transition-colors ${pad}`;

    // Not built yet: a plain div. No handler, not focusable, not a button — there is nothing to click.
    if (!it.view) {
      return (
        <div key={it.id} data-nav={it.id} data-soon="true" aria-disabled="true" title={title}
          className={`${base} text-gray-400 opacity-60 cursor-not-allowed select-none`}>
          <Icon className="w-4 h-4 flex-shrink-0" />
          {!minimized && (
            <>
              <span className="flex-1 min-w-0 truncate whitespace-nowrap">{it.label}</span>
              <span className="flex-shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide bg-gray-200 text-gray-500">Soon</span>
            </>
          )}
        </div>
      );
    }

    const view = it.view;
    const active = activeView === view;
    return (
      <button key={it.id} type="button" data-nav={it.id} data-view={view} title={title}
        aria-current={active ? 'page' : undefined}
        onClick={() => onNavigate(view)}
        className={`${base} ${active ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        {!minimized && <span className="flex-1 min-w-0 truncate text-left whitespace-nowrap">{it.label}</span>}
        <NavBadge count={countOf(it)} collapsed={minimized} />
      </button>
    );
  };

  // Minimized: one flat strip of icons. Group collapse is ignored here on purpose — a collapsed
  // group would otherwise make its screens unreachable from the strip. Thin rules separate groups.
  if (minimized) {
    return (
      <nav aria-label={ariaLabel} data-minimized="true" className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {tops.map(t => renderItem(t, false))}
        {groups.map(g => (
          <div key={g.id} data-group={g.id}>
            <div className="my-2 border-t border-gray-200" />
            {g.items.map(it => renderItem(it, false))}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label={ariaLabel} data-minimized="false" className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
      {tops.map(t => renderItem(t, false))}
      {groups.map(g => {
        const open = isGroupOpenIn(groups, prefs, g.id, activeView);
        // A collapsed group still has to show that something inside it wants attention.
        const hidden = g.items.reduce((n, it) => n + countOf(it), 0);
        return (
          <div key={g.id} data-group={g.id}>
            <button type="button" data-group-toggle={g.id} aria-expanded={open} onClick={() => onToggleGroup(g.id)}
              className="crm-nav-group w-full flex items-center gap-2 px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-gray-400 hover:text-gray-600 transition-colors">
              {open ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="flex-1 min-w-0 truncate text-left">{g.label}</span>
              {!open && <NavBadge count={hidden} />}
            </button>
            {open && <div className="space-y-0.5">{g.items.map(it => renderItem(it, true))}</div>}
          </div>
        );
      })}
    </nav>
  );
}

export interface AccountingNavProps {
  activeView: AccountingView;
  minimized: boolean;
  prefs: NavPrefs;
  badges: Partial<Record<BadgeKey, number>>;
  onNavigate: (view: AccountingView) => void;
  onToggleGroup: (groupId: string) => void;
}

export function AccountingNav(props: AccountingNavProps) {
  return <SidebarNav<AccountingView> tops={[NAV_TOP]} groups={NAV_GROUPS} ariaLabel="Accounting" {...props} />;
}
