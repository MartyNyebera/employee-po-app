// ============================================================================
// The Accounting portal's sidebar: grouped, collapsible, with an icon-only minimized strip.
//
// NAVIGATION ONLY. Every item points at a screen that already exists in AccountingPortal; nothing
// here fetches, writes or decides access. An item with no `view` is not built yet and renders
// dimmed with a "Soon" tag and no click handler — there are no placeholder pages behind it, and
// when a screen lands the only change is giving its item a `view`.
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
  | 'timesheet' | 'payroll' | 'signature' | 'payables' | 'collections' | 'purchases' | 'pcf' | 'thirteenth' | 'gl-accounts';

// Which live count an item wears. The portal supplies the numbers; this file only places them.
export type BadgeKey = 'requests' | 'orders' | 'receivables';

export interface NavItem {
  id: string;
  label: string;
  icon: any;
  // Present = a real screen exists and the item is clickable. Absent = "Soon".
  view?: AccountingView;
  // The native tooltip text, exactly as specified for the items that have one.
  hover?: string;
  badge?: BadgeKey;
}

export interface NavGroup { id: string; label: string; items: NavItem[] }

// The single item above the groups. Accounting has no overview screen today (its landing page is
// Purchase Requests), so this is dimmed rather than pointed at something that is not an overview.
export const NAV_TOP: NavItem = { id: 'overview', label: 'OVERVIEW SYSTEM', icon: LayoutDashboard };

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

export function loadNavPrefs(): NavPrefs {
  try {
    const raw = localStorage.getItem(NAV_PREFS_KEY);
    if (!raw) return { ...EMPTY_PREFS, groups: {} };
    const p = JSON.parse(raw);
    const groups: Record<string, boolean> = {};
    for (const g of NAV_GROUPS) if (p && p.groups && typeof p.groups[g.id] === 'boolean') groups[g.id] = p.groups[g.id];
    return { minimized: !!(p && p.minimized === true), groups };
  } catch {
    // Storage blocked, absent, or holding something unparseable: start from defaults.
    return { ...EMPTY_PREFS, groups: {} };
  }
}

export function saveNavPrefs(prefs: NavPrefs): void {
  try { localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(prefs)); } catch { /* keep working in memory */ }
}

export function groupForView(view: AccountingView): string | null {
  for (const g of NAV_GROUPS) if (g.items.some(i => i.view === view)) return g.id;
  return null;
}

export function isGroupOpen(prefs: NavPrefs, groupId: string, activeView: AccountingView): boolean {
  const saved = prefs.groups[groupId];
  return typeof saved === 'boolean' ? saved : groupForView(activeView) === groupId;
}

// State transitions, kept pure so the portal only has to hold the result and the behaviour can be
// tested without a browser.
export function toggleGroup(prefs: NavPrefs, groupId: string, activeView: AccountingView): NavPrefs {
  return { ...prefs, groups: { ...prefs.groups, [groupId]: !isGroupOpen(prefs, groupId, activeView) } };
}

// Landing in a screen opens the group that holds it, so the active screen is never hidden inside a
// collapsed one. Returns the SAME object when nothing changes, so a state setter that receives it
// does not re-render.
export function revealGroupFor(prefs: NavPrefs, view: AccountingView): NavPrefs {
  const gid = groupForView(view);
  if (!gid || prefs.groups[gid] === true) return prefs;
  return { ...prefs, groups: { ...prefs.groups, [gid]: true } };
}

export function setMinimized(prefs: NavPrefs, minimized: boolean): NavPrefs {
  return prefs.minimized === minimized ? prefs : { ...prefs, minimized };
}

// The native tooltip. Expanded, only items with specified hover text (and the dimmed ones) get
// one; minimized, the label is not visible so the name has to be in the tooltip.
export function itemTitle(it: NavItem, minimized: boolean): string | undefined {
  const soon = !it.view;
  if (minimized) return [it.label, it.hover, soon ? 'Soon' : null].filter(Boolean).join(' — ');
  if (it.hover) return it.hover;
  return soon ? 'Coming soon' : undefined;
}

// ---------------------------------------------------------------- component

export interface AccountingNavProps {
  activeView: AccountingView;
  minimized: boolean;
  prefs: NavPrefs;
  badges: Partial<Record<BadgeKey, number>>;
  onNavigate: (view: AccountingView) => void;
  onToggleGroup: (groupId: string) => void;
}

export function AccountingNav({ activeView, minimized, prefs, badges, onNavigate, onToggleGroup }: AccountingNavProps) {
  const countOf = (it: NavItem) => (it.badge ? (badges[it.badge] ?? 0) : 0);

  const renderItem = (it: NavItem, nested: boolean): ReactNode => {
    const Icon = it.icon;
    const title = itemTitle(it, minimized);
    const pad = minimized ? 'justify-center px-3 py-2.5' : nested ? 'pl-4 pr-3 py-2' : 'px-3 py-2.5';
    const base = `relative w-full flex items-center gap-3 rounded-lg text-[13px] font-medium transition-colors ${pad}`;

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
      <nav aria-label="Accounting" data-minimized="true" className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {renderItem(NAV_TOP, false)}
        {NAV_GROUPS.map(g => (
          <div key={g.id} data-group={g.id}>
            <div className="my-2 border-t border-gray-200" />
            {g.items.map(it => renderItem(it, false))}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Accounting" data-minimized="false" className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
      {renderItem(NAV_TOP, false)}
      {NAV_GROUPS.map(g => {
        const open = isGroupOpen(prefs, g.id, activeView);
        // A collapsed group still has to show that something inside it wants attention.
        const hidden = g.items.reduce((n, it) => n + countOf(it), 0);
        return (
          <div key={g.id} data-group={g.id}>
            <button type="button" data-group-toggle={g.id} aria-expanded={open} onClick={() => onToggleGroup(g.id)}
              className="w-full flex items-center gap-2 px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-gray-400 hover:text-gray-600 transition-colors">
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
