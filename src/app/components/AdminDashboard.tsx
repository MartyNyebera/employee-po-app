import { useState, useEffect, lazy, Suspense } from 'react';
import { getStoredAuth, fetchApi } from '../api/client';
import { useAutoLogout } from '../hooks/useAutoLogout';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { Button } from './ui/button';
import { LogOut, Home, FileText, Receipt, Menu, X, Check, XCircle, Clock, ShoppingCart, Package, User, UserCheck, MessageSquare, Users, Factory, UserCog, Briefcase, ClipboardCheck, PackageMinus, ChevronRight, ChevronDown, Warehouse, Activity, Calculator, Truck, PenTool, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SuppliersList } from './crm/SuppliersList';
import { CustomersList } from './crm/CustomersList';
import { InquiriesList } from './crm/InquiriesList';
import { StaffAccountsList } from './crm/StaffAccountsList';
import { EmployeeAccountsList } from './crm/EmployeeAccountsList';
import { PortalAccountsList } from './crm/PortalAccountsList';
import { ProjectsList } from './crm/ProjectsList';
import { PurchaseRequestsReview } from './crm/PurchaseRequestsReview';
import { AdminSignature } from './crm/AdminSignature';
import { WithdrawalRequestsReview } from './crm/WithdrawalRequestsReview';
import { canView, canManage, type Role } from '../config/permissions';
import ErrorBoundary from './ErrorBoundary';
import { PageErrorFallback } from './PageErrorFallback';
import { AssetDetails } from './AssetDetails';
import { PurchaseOrdersList } from './PurchaseOrdersList';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { NavBadge } from './NavBadge';
import { AttentionCard } from './AttentionCard';

// Heavy pages (charts, maps, and large data tables) are code-split and loaded only
// when their tab is opened — this keeps the initial app-shell bundle small.
const BusinessOverview = lazy(() => import('./BusinessOverview-InlineStyles').then(m => ({ default: m.BusinessOverview })));
const MaterialRequests = lazy(() => import('./MaterialRequests-Professional').then(m => ({ default: m.MaterialRequests })));
const SalesOrdersList = lazy(() => import('./SalesOrdersList-Professional').then(m => ({ default: m.SalesOrdersList })));
const TransactionsList = lazy(() => import('./TransactionsList-Professional').then(m => ({ default: m.TransactionsList })));
const PurchaseOrderList = lazy(() => import('./PurchaseOrderList-Professional-Fixed').then(m => ({ default: m.PurchaseOrderList })));
const InventoryList = lazy(() => import('./InventoryList-Professional').then(m => ({ default: m.InventoryList })));
import { toast } from 'sonner';

interface AdminDashboardProps {
  userName: string;
  isSuperAdmin?: boolean;
  role?: Role;
  onLogout: () => void;
}

type View = 'home' | 'orders' | 'transactions' | 'material-requests' | 'employee-accounts' | 'purchasing-accounts' | 'warehouse-accounts' | 'accounting-accounts' | 'sales-accounts' | 'logistics-accounts' | 'projects' | 'purchase-requests' | 'withdrawal-requests' | 'purchase-orders' | 'inventory' | 'miscellaneous' | 'request-form' | 'suppliers' | 'customers' | 'inquiries' | 'staff' | 'signature';

// Sidebar entries, in display order. An entry is either a leaf (navigates to a view) or a
// group (a collapsible dropdown holding leaves). Visibility + write access come from MODULE_ACCESS.
type NavLeaf = { view: View; label: string; icon: any; module: string };
type NavGroup = { group: string; label: string; icon: any; children: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;
const isGroup = (e: NavEntry): e is NavGroup => 'children' in e;

// Attention badge for a sidebar item. Two shapes:
//   expanded rail → a red count pill pushed to the row's end (ml-auto);
//   collapsed rail → a small corner dot on the icon-only button (the button is `relative`).
// Renders nothing at 0. Class is `crm-nav-badge` — deliberately NOT containing the substrings
// primary/secondary/outline, which professional-design-complete.css matches on and would
// hijack (the same trap that once broke the nav pill). It's a <span>, so the blanket
// `.admin-portal button` rule never touches it.
// NavBadge now lives in components/NavBadge.tsx — one bubble style system-wide (#16).

// Ordered by importance/workflow: Dashboard → operational flows (Orders, Requests) →
// reference/master data → administrative account management last.
const NAV_ENTRIES: NavEntry[] = [
  { view: 'home', label: 'Dashboard', icon: Home, module: 'home' },
  { group: 'orders', label: 'Orders', icon: FileText, children: [
    { view: 'orders', label: 'Sales Orders', icon: FileText, module: 'orders' },
    { view: 'purchase-orders', label: 'Purchase Orders', icon: Package, module: 'purchase-orders' },
  ] },
  { group: 'requests', label: 'Requests', icon: ClipboardCheck, children: [
    { view: 'purchase-requests', label: 'Purchase Requests', icon: ClipboardCheck, module: 'purchase-requests' },
    { view: 'withdrawal-requests', label: 'Withdrawal Requests', icon: PackageMinus, module: 'withdrawal-requests' },
  ] },
  { group: 'monitoring', label: 'Monitoring', icon: Activity, children: [
    { view: 'customers', label: 'Clients', icon: Users, module: 'customers' },
    { view: 'suppliers', label: 'Suppliers', icon: Factory, module: 'suppliers' },
    { view: 'projects', label: 'Projects', icon: Briefcase, module: 'projects' },
    { view: 'inquiries', label: 'Quotation', icon: MessageSquare, module: 'inquiries' },
  ] },
  { view: 'inventory', label: 'Inventory Management', icon: Package, module: 'inventory' },
  { group: 'accounts', label: 'Accounts', icon: UserCog, children: [
    // Labels only — `view` and `module` ids are the contract with permissions.ts and the
    // canView guard below, which passes currentView where a module key is expected.
    { view: 'employee-accounts', label: 'Production Accounts', icon: Users, module: 'employee-accounts' },
    { view: 'purchasing-accounts', label: 'Purchasing Accounts', icon: UserCog, module: 'purchasing-accounts' },
    { view: 'warehouse-accounts', label: 'Warehouse Accounts', icon: Warehouse, module: 'warehouse-accounts' },
    { view: 'accounting-accounts', label: 'Accounting Accounts', icon: Calculator, module: 'accounting-accounts' },
    { view: 'sales-accounts', label: 'Sales Accounts', icon: ShoppingCart, module: 'sales-accounts' },
    { view: 'logistics-accounts', label: 'Logistics Accounts', icon: Truck, module: 'logistics-accounts' },
    { view: 'staff', label: 'Administrator Accounts', icon: UserCog, module: 'staff' },
  ] },
  { view: 'signature', label: 'My Signature', icon: PenTool, module: 'signature' },
];

export function AdminDashboard({ userName, isSuperAdmin, role: roleProp, onLogout }: AdminDashboardProps) {
  // Enable auto-logout when app is closed
  useAutoLogout();
  useDocumentTitle('Administrator');

  // Effective role drives module visibility. Super admin = owner; default to admin for safety.
  const role: Role = isSuperAdmin ? 'owner' : (roleProp || 'admin');

  // Build the visible sidebar tree: leaves the role can see, and groups keeping only their
  // visible children. A group with no visible children is dropped entirely (no empty header).
  const visibleNav: NavEntry[] = NAV_ENTRIES
    .map(entry => isGroup(entry)
      ? { ...entry, children: entry.children.filter(c => canView(role, c.module)) }
      : entry)
    .filter(entry => isGroup(entry) ? entry.children.length > 0 : canView(role, entry.module));

  // First view the role is allowed to see, scanning leaves and group children in order.
  const firstAllowedView: View = (() => {
    for (const entry of visibleNav) {
      if (isGroup(entry)) { if (entry.children[0]) return entry.children[0].view; }
      else return entry.view;
    }
    return 'home';
  })();

  const [currentView, setCurrentView] = useState<View>(firstAllowedView);
  // Which dropdown groups are manually expanded/collapsed. Undefined = follow the default
  // (open the group that owns the active view). Keyed by group id.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // Listen for navigation events from child components
  useEffect(() => {
    const handleNavigation = (event: CustomEvent) => {
      const { view } = event.detail;
      setCurrentView(view as View);
    };

    window.addEventListener('navigateToView', handleNavigation as EventListener);
    return () => window.removeEventListener('navigateToView', handleNavigation as EventListener);
  }, []);
  const [menuOpen, setMenuOpen] = useState(true);
  // Separate from menuOpen: that is the desktop collapse (w-64 ↔ w-20), this is the mobile
  // drawer being shown at all. The admin had no mobile drawer before.
  const [mobileOpen, setMobileOpen] = useState(false);
  // The email for the sidebar profile block. Not a prop — the fleet_auth session already
  // holds it (the same store fetchApi reads the token from), so threading one through App
  // and back would add a prop for data already in scope.
  const userEmail = getStoredAuth()?.user?.email ?? '';

  // Attention counts for the sidebar badges — what the admin must action NEXT. Live COUNTs
  // from the server (GET /api/admin/queue-counts), fetched on mount and kept fresh by the
  // same visibility-gated poll the lists use, so a badge appears/clears without a manual
  // refresh. A failed poll leaves the last-known counts untouched (never zeroes the badges).
  const [counts, setCounts] = useState({ purchaseRequests: 0, purchaseOrders: 0, withdrawals: 0 });
  const loadCounts = async () => {
    try { setCounts(await fetchApi('/admin/queue-counts')); } catch { /* keep last-known */ }
  };
  useEffect(() => { loadCounts(); }, []);
  // Also refresh the counts each time the admin leaves a queue view (they likely just cleared
  // something), on top of the 20s poll and the tab-focus refetch inside the hook.
  useEffect(() => { loadCounts(); }, [currentView]);
  useLiveRefresh(loadCounts);

  // The badge count for a given nav view (0 = no badge).
  const badgeForView = (view: View): number => {
    if (view === 'purchase-requests') return counts.purchaseRequests;
    if (view === 'purchase-orders') return counts.purchaseOrders;
    if (view === 'withdrawal-requests') return counts.withdrawals;
    return 0;
  };
  // A collapsed group hides its children, so its header carries the sum of their badges.
  const badgeForGroup = (group: string): number => {
    if (group === 'orders') return counts.purchaseOrders;
    if (group === 'requests') return counts.purchaseRequests + counts.withdrawals;
    return 0;
  };

  // [removed] Admin Requests tab, its render branch, and the effect that fetched
  // adminRequests — the data was never passed to the component (it fetched its own), so the
  // request was pure duplication. AdminRequests-Professional.tsx is now unreferenced.

  const renderContent = () => {
    // Role guard: never render a module this role can't see (e.g. via stale state).
    if (!canView(role, currentView)) {
      return <div style={{ padding: '40px', color: '#5a5a5a' }}>You don't have access to this section.</div>;
    }

    // New CRM / pipeline / planning modules
    if (currentView === 'suppliers') return <SuppliersList isAdmin={canManage(role, 'suppliers')} />;
    if (currentView === 'customers') return <CustomersList isAdmin={canManage(role, 'customers')} />;
    if (currentView === 'inquiries') return <InquiriesList isAdmin={canManage(role, 'inquiries')} />;
    if (currentView === 'staff') return <StaffAccountsList />;
    if (currentView === 'signature') return <AdminSignature />;

    if (currentView === 'home') {
      return <BusinessOverview isAdmin={canManage(role, 'home')} />;
    }

    if (currentView === 'orders') {
      return <SalesOrdersList isAdmin={canManage(role, 'orders')} />;
    }
    
    if (currentView === 'transactions') {
      return <TransactionsList isAdmin={true} />;
    }

    if (currentView === 'purchase-orders') {
      return <PurchaseOrderList isAdmin={canManage(role, 'purchase-orders')} />;
    }

    if (currentView === 'inventory') {
      return <InventoryList isAdmin={canManage(role, 'inventory')} />;
    }

    if (currentView === 'material-requests') {
      return <MaterialRequests />;
    }

    if (currentView === 'employee-accounts') {
      return <EmployeeAccountsList isAdmin={canManage(role, 'employee-accounts')} />;
    }

    // The five portal account types share one component — they differ only in wording and
    // the API path they hit.
    if (currentView === 'purchasing-accounts') {
      return <PortalAccountsList isAdmin={canManage(role, 'purchasing-accounts')} path="purchasing" label="Purchasing" portalPath="/purchasing"
        blurb="to assign suppliers to verified purchase requests and raise purchase orders." />;
    }

    if (currentView === 'warehouse-accounts') {
      return <PortalAccountsList isAdmin={canManage(role, 'warehouse-accounts')} path="warehouse" label="Warehouse" portalPath="/warehouse"
        blurb="to add inventory items and keep stock levels up to date." />;
    }

    if (currentView === 'accounting-accounts') {
      return <PortalAccountsList isAdmin={canManage(role, 'accounting-accounts')} path="accounting" label="Accounting" portalPath="/accounting"
        blurb="to review purchase requests and manage projects." />;
    }

    if (currentView === 'sales-accounts') {
      return <PortalAccountsList isAdmin={canManage(role, 'sales-accounts')} path="sales" label="Sales" portalPath="/sales"
        blurb="to raise and print sales orders." />;
    }

    if (currentView === 'logistics-accounts') {
      return <PortalAccountsList isAdmin={canManage(role, 'logistics-accounts')} path="logistics" label="Logistics" portalPath="/logistics"
        blurb="to dispatch approved sales orders and record deliveries." />;
    }

    if (currentView === 'projects') {
      return <ProjectsList isAdmin={canManage(role, 'projects')} />;
    }

    if (currentView === 'purchase-requests') {
      return <PurchaseRequestsReview />;
    }

    if (currentView === 'withdrawal-requests') {
      return <WithdrawalRequestsReview isAdmin={canManage(role, 'withdrawal-requests')} />;
    }

    return <div>View not found</div>;
  };

  // Renders a single navigable leaf button. `nested` = it lives inside an expanded group,
  // so its label indents slightly to read as a child of the group header.
  // The portals' nav item: a SOLID accent pill when active, muted grey at rest. bg-blue-600 is
  // the brand gold (--color-blue-600: #d1b01b in tailwind.css) — same class the portals use, so
  // the two stay in step. crm-nav-btn is the escape hatch: `.admin-portal button` forces
  // border-radius and transition with !important, which inline styles cannot beat.
  //
  // 🔴 NO `focus:outline-none` HERE. professional-design-complete.css has
  // `.admin-portal button[class*="outline"]` — a SUBSTRING match on the whole class attribute,
  // meant for a `btn-outline` class. `focus:outline-none` contains "outline", so it matched,
  // and that rule forces `background: transparent`, a border and 10px/16px padding — which is
  // why this pill rendered as a bordered ghost instead of solid gold. The utility is redundant
  // anyway: `.admin-portal button` already sets `outline: none !important`.
  const renderLeaf = (item: NavLeaf, nested: boolean) => {
    const Icon = item.icon;
    const active = currentView === item.view;
    const count = badgeForView(item.view);
    return (
      <button
        key={item.view}
        onClick={() => { setCurrentView(item.view); setMobileOpen(false); }}
        title={item.label}
        className={`crm-nav-btn relative w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
          nested ? 'px-3 py-2' : 'px-3 py-2.5'
        } ${!menuOpen ? 'justify-center' : ''} ${
          active ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        {menuOpen && <span className="truncate">{item.label}</span>}
        <NavBadge count={count} collapsed={!menuOpen} />
      </button>
    );
  };

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <div className="admin-portal h-screen bg-slate-50 flex overflow-hidden">
      {/* #8 — dismissible attention card, fed by the same queue-counts the badges use. */}
      <AttentionCard items={[
        { label: 'Purchase requests to verify', count: counts.purchaseRequests, onView: () => setCurrentView('purchase-requests') },
        { label: 'Purchase orders to approve', count: counts.purchaseOrders, onView: () => setCurrentView('purchase-orders') },
        { label: 'Withdrawals to approve', count: counts.withdrawals, onView: () => setCurrentView('withdrawal-requests') },
      ]} />
      {/* Sidebar. Matches the portal shell: a fixed drawer under lg, an in-flow rail above it.
          The admin previously had no mobile behaviour at all — the sidebar simply ate the
          screen on a phone, with no way to dismiss it. */}
      <div className={`bg-white border-r border-gray-200 flex-shrink-0 z-30 flex flex-col transition-all duration-300 ${menuOpen ? 'w-64' : 'w-20'} ${mobileOpen ? 'fixed inset-y-0 left-0' : 'hidden lg:flex'}`}>
        {/* Header: expand/collapse toggle + portal title, with the logo below */}
        <div className="border-b border-gray-200">
          <div className={`flex items-center gap-2 px-3 py-3 ${!menuOpen ? 'justify-center' : ''}`}>
            {/* Purpose-built sidebar icons: the panel glyph shows which way it will move.
                text-gray-500 (#5A5A5A) matches the resting nav tabs below. */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              title={menuOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              {menuOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
            {/* font-semibold (600), not font-black: Poppins is only loaded at 300-700, so 900
                would fall back to 700 or be synthetically emboldened. */}
            {menuOpen && <span className="text-sm font-semibold tracking-wide text-gray-500">Administrator</span>}
          </div>
          {/* Logo stays visible when collapsed, just scaled down to fit the icon rail. */}
          <div className={`flex justify-center ${!menuOpen ? 'px-2 pt-2 pb-3' : 'px-5 pt-4 pb-4'}`}>
            <img src="/kimoel-logo.png" alt="KIMOEL"
              className={`${!menuOpen ? 'h-10' : 'h-32'} w-auto object-contain transition-all duration-200`} />
          </div>
        </div>

        {/* Navigation — py-4 px-3 space-y-0.5, matching the portals exactly. */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {visibleNav.map((entry) => {
            // Leaf item — navigates directly to a view.
            if (!isGroup(entry)) return renderLeaf(entry, false);

            // Group — collapsible dropdown of leaves.
            const holdsActive = entry.children.some(c => c.view === currentView);
            const expanded = openGroups[entry.group] ?? holdsActive;
            const GroupIcon = entry.icon;
            const toggle = () => {
              if (!menuOpen) { setMenuOpen(true); setOpenGroups(p => ({ ...p, [entry.group]: true })); return; }
              setOpenGroups(p => ({ ...p, [entry.group]: !expanded }));
            };
            return (
              <div key={entry.group}>
                {/* A group header never gets the solid pill — that belongs to the one item you
                    are actually on. Collapsed-while-holding-the-active-child just tints gold,
                    so the pill stays unique on screen. */}
                <button
                  onClick={toggle}
                  title={entry.label}
                  className={`crm-nav-btn relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    !menuOpen ? 'justify-center' : ''
                  } ${holdsActive ? 'text-brand-gold hover:bg-gray-100' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                >
                  <GroupIcon className="w-4 h-4 flex-shrink-0" />
                  {menuOpen && (
                    <>
                      <span className="flex-1 text-left truncate">{entry.label}</span>
                      {/* When the group is expanded its children show their own badges, so the
                          header rollup is redundant — only show it while collapsed. */}
                      <NavBadge count={expanded ? 0 : badgeForGroup(entry.group)} collapsed={false} />
                      {expanded
                        ? <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />
                        : <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400" />}
                    </>
                  )}
                  {/* Collapsed rail: children and label are hidden, so a corner dot on the
                      group icon is the only place the rollup can show. */}
                  {!menuOpen && <NavBadge count={badgeForGroup(entry.group)} collapsed />}
                </button>
                {menuOpen && expanded && (
                  <div className="mt-1 space-y-1" style={{ marginLeft: '12px', paddingLeft: '12px', borderLeft: '1px solid #ececec' }}>
                    {entry.children.map(child => renderLeaf(child, true))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User Menu — border-t px-3 py-3 space-y-1, matching the portals exactly. */}
        <div className="border-t border-gray-200 px-3 py-3 space-y-1">
          {/* The portals' profile block: a gold avatar circle holding the User glyph (not an
              initial — Production shows the icon), the name, and the email beneath. */}
          <div className={`flex items-center gap-3 px-3 py-2 ${!menuOpen ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            {menuOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
                {userEmail && <p className="text-xs text-gray-400 truncate">{userEmail}</p>}
              </div>
            )}
          </div>

          {/* "Sign out", matching the portals — and the red hover, which is the one place red
              belongs here: it is the only irreversible thing in the sidebar. */}
          <button
            onClick={onLogout}
            title="Sign out"
            className={`crm-nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors ${!menuOpen ? 'justify-center' : ''}`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {menuOpen && <span>Sign out</span>}
          </button>
        </div>
      </div>

      {/* Backdrop for the mobile drawer — the sidebar is fixed on small screens, so without
          this the content behind it stays interactive underneath the overlay. */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main Content */}
      {/* min-w-0 so a wide table inside a view scrolls itself rather than stretching the
          flex row and pushing the sidebar off-screen. */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header — matching every portal: same height, border, muted size and long-form
            format, with the mobile drawer toggle on the left. */}
        <header className="flex-shrink-0 flex items-center justify-between bg-white border-b border-gray-200 px-4 lg:px-6 h-14">
          {/* This div was empty — the portals put the drawer toggle here, and the admin had
              nothing, which is why its sidebar was unreachable on a phone. */}
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100">
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
          <span className="text-xs text-gray-400 hidden sm:block">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          <Suspense fallback={
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
            </div>
          }>
            {renderContent()}
          </Suspense>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
