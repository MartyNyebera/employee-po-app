import { useState, useEffect, lazy, Suspense } from 'react';
import { getStoredAuth, fetchApi } from '../api/client';
import { useAutoLogout } from '../hooks/useAutoLogout';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { Button } from './ui/button';
import { LogOut, Home, FileText, Receipt, Menu, X, Check, XCircle, Clock, ShoppingCart, Package, User, UserCheck, MessageSquare, Users, Factory, UserCog, Briefcase, ClipboardCheck, PackageMinus, Warehouse, Calculator, Truck, PenTool, PanelLeftClose, PanelLeftOpen, IdCard, ScanLine, CalendarCheck, SlidersHorizontal, CalendarDays, ReceiptText, Coins, LayoutDashboard, HandCoins, CreditCard, FileOutput, Wallet, Gift, BookOpen } from 'lucide-react';
import { SuppliersList } from './crm/SuppliersList';
import { CustomersList } from './crm/CustomersList';
import { DeliveryReceipts } from './crm/DeliveryReceipts';
import { BillingInvoices, Receivables } from './crm/BillingInvoices';
import { InquiriesList } from './crm/InquiriesList';
import { StaffAccountsList } from './crm/StaffAccountsList';
import { EmployeeAccountsList } from './crm/EmployeeAccountsList';
import { PortalAccountsList } from './crm/PortalAccountsList';
import { ProjectsList } from './crm/ProjectsList';
import { RosterList } from './crm/RosterList';
import { StationsList } from './crm/StationsList';
import { TimesheetReview } from './crm/TimesheetReview';
import { PayrollSettings } from './crm/PayrollSettings';
import { HolidaysList } from './crm/HolidaysList';
import { PayrollReview } from './crm/PayrollReview';
import { PurchaseRequestsReview } from './crm/PurchaseRequestsReview';
import { AdminSignature } from './crm/AdminSignature';
import { WithdrawalRequestsReview } from './crm/WithdrawalRequestsReview';
import { DeliveryDiscrepancies } from './crm/DeliveryDiscrepancies';
import { canView, canManage, type Role } from '../config/permissions';
import ErrorBoundary from './ErrorBoundary';
import { PageErrorFallback } from './PageErrorFallback';
import { AssetDetails } from './AssetDetails';
import { PurchaseOrdersList } from './PurchaseOrdersList';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import {
  SidebarNav, loadNavPrefsFor, saveNavPrefsTo, toggleGroupIn, revealGroupForIn, setMinimized, type NavItem, type NavGroup, type NavPrefs,
} from './AccountingSidebarNav';
import { AccountingOverview, type OverviewLink } from './AccountingOverview';
import { CollectionsReport } from './CollectionsReport';
import { PurchasesReport } from './PurchasesReport';
import { PayableReport } from './PayableReport';
import { GlAccountsScreen } from './GlAccountsScreen';
import { ThirteenthMonth } from './crm/ThirteenthMonth';
import { AdminDisbursement, AdminPcf } from './AdminAccountingScreens';
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

type View = 'home' | 'orders' | 'transactions' | 'material-requests' | 'employee-accounts' | 'purchasing-accounts' | 'warehouse-accounts' | 'accounting-accounts' | 'sales-accounts' | 'logistics-accounts' | 'projects' | 'purchase-requests' | 'withdrawal-requests' | 'purchase-orders' | 'discrepancies' | 'inventory' | 'miscellaneous' | 'request-form' | 'suppliers' | 'customers' | 'delivery-receipts' | 'billing-invoices' | 'receivables' | 'inquiries' | 'staff' | 'signature' | 'roster' | 'stations' | 'timesheet' | 'payroll-settings' | 'holidays' | 'payroll'
  // Accounting screens, mounted here with the admin fetcher (view id = permissions.ts module id).
  | 'overview' | 'collections' | 'purchases-report' | 'payables' | 'expenses' | 'pcf' | 'gl-accounts' | 'thirteenth';

// Sidebar model: the same grouped design as the Accounting portal (components/AccountingSidebarNav -> SidebarNav).
// An item's `module` is its id in permissions.ts (visibility + write access); every view id equals its module id,
// which is what the renderContent guard below relies on. A group with no visible item is dropped (no empty heading).
type AdminItem = NavItem<View> & { module: string };
type AdminGroup = Omit<NavGroup<View>, 'items'> & { items: AdminItem[] };

const ADMIN_TOPS: AdminItem[] = [
  { id: 'dashboard', label: 'DASHBOARD', icon: Home, view: 'home', module: 'home' },
  { id: 'overview', label: 'OVERVIEW SYSTEM', icon: LayoutDashboard, view: 'overview', module: 'overview' },
];

const ADMIN_GROUPS: AdminGroup[] = [
  { id: 'procurements', label: 'PROCUREMENTS', items: [
    { id: 'pr-request', label: 'PR REQUEST', icon: ClipboardCheck, view: 'purchase-requests', module: 'purchase-requests', badge: 'pr' },
    { id: 'po-request', label: 'PO REQUEST', icon: Package, view: 'purchase-orders', module: 'purchase-orders', badge: 'po' },
    { id: 'suppliers', label: 'SUPPLIERS', icon: Factory, view: 'suppliers', module: 'suppliers' },
    { id: 'inventory', label: 'INVENTORY', icon: Package, view: 'inventory', module: 'inventory', hover: 'Inventory management' },
    { id: 'withdrawals', label: 'WITHDRAWALS REQUEST', icon: PackageMinus, view: 'withdrawal-requests', module: 'withdrawal-requests', badge: 'wd' },
    { id: 'discrepancies', label: 'DELIVERY DISCREPANCIES', icon: PackageMinus, view: 'discrepancies', module: 'discrepancies' },
    // Signs the PR/PO prints, so it lives with them (as in the Accounting portal).
    { id: 'signature', label: 'MY SIGNATURE', icon: PenTool, view: 'signature', module: 'signature' },
  ] },
  { id: 'sales', label: 'SALES DISTRIBUTIONS', items: [
    { id: 'clients', label: 'CLIENTS', icon: Users, view: 'customers', module: 'customers' },
    { id: 'quotation', label: 'QUOTATION', icon: MessageSquare, view: 'inquiries', module: 'inquiries' },
    { id: 'sales-orders', label: 'SALES ORDERS', icon: FileText, view: 'orders', module: 'orders' },
    { id: 'contract-services', label: 'CONTRACT SERVICES', icon: Briefcase, view: 'projects', module: 'projects' },
    { id: 'delivery-receipt', label: 'DELIVERY RECEIPT', icon: Truck, view: 'delivery-receipts', module: 'delivery-receipts' },
    { id: 'customers-billing', label: "CUSTOMER'S BILLING", icon: ReceiptText, view: 'billing-invoices', module: 'billing-invoices' },
  ] },
  { id: 'hr', label: 'HUMAN RESOURCES', items: [
    { id: 'attendance-sheet', label: 'ATTENDANCE SHEET', icon: CalendarCheck, view: 'timesheet', module: 'timesheet' },
    { id: 'payroll-payout', label: 'PAYROLL PAY-OUT', icon: Calculator, view: 'payroll', module: 'payroll' },
    { id: 'thirteenth-month', label: '13TH MONTH PAY', icon: Gift, view: 'thirteenth', module: 'thirteenth', hover: 'Basic earned ÷ 12, post to payroll' },
    { id: 'employee-profiles', label: 'EMPLOYEE PROFILES', icon: IdCard, view: 'roster', module: 'roster' },
    { id: 'holidays', label: 'HOLIDAYS', icon: CalendarDays, view: 'holidays', module: 'holidays' },
  ] },
  { id: 'accounting', label: 'ACCOUNTING', items: [
    { id: 'collections-report', label: 'COLLECTIONS REPORT', icon: HandCoins, view: 'collections', module: 'collections', hover: 'Payments received on billing invoices' },
    { id: 'receivable-report', label: 'RECEIVABLE REPORT', icon: Coins, view: 'receivables', module: 'receivables', hover: 'Billing invoice − collection', badge: 'rec' },
    { id: 'purchases', label: 'PURCHASES', icon: ShoppingCart, view: 'purchases-report', module: 'purchases-report', hover: 'Summary of PO requests' },
    { id: 'payable-report', label: 'PAYABLE REPORT', icon: CreditCard, view: 'payables', module: 'payables', hover: 'Purchases − payments' },
    { id: 'disbursement-report', label: 'DISBURSEMENT REPORT', icon: FileOutput, view: 'expenses', module: 'expenses', hover: 'Manual voucher' },
    { id: 'pcf', label: 'PCF', icon: Wallet, view: 'pcf', module: 'pcf', hover: 'Petty cash fund' },
    { id: 'gl-accounts', label: 'GL ACCOUNTS', icon: BookOpen, view: 'gl-accounts', module: 'gl-accounts', hover: 'Accounts an expense line can be coded to' },
  ] },
  { id: 'administration', label: 'ADMINISTRATION', items: [
    { id: 'production-accounts', label: 'PRODUCTION ACCTS', icon: Users, view: 'employee-accounts', module: 'employee-accounts', hover: 'Production portal accounts' },
    { id: 'purchasing-accounts', label: 'PURCHASING ACCTS', icon: UserCog, view: 'purchasing-accounts', module: 'purchasing-accounts', hover: 'Purchasing portal accounts' },
    { id: 'warehouse-accounts', label: 'WAREHOUSE ACCTS', icon: Warehouse, view: 'warehouse-accounts', module: 'warehouse-accounts', hover: 'Warehouse portal accounts' },
    { id: 'accounting-accounts', label: 'ACCOUNTING ACCTS', icon: Calculator, view: 'accounting-accounts', module: 'accounting-accounts', hover: 'Accounting portal accounts' },
    { id: 'sales-accounts', label: 'SALES ACCTS', icon: ShoppingCart, view: 'sales-accounts', module: 'sales-accounts', hover: 'Sales portal accounts' },
    { id: 'logistics-accounts', label: 'LOGISTICS ACCTS', icon: Truck, view: 'logistics-accounts', module: 'logistics-accounts', hover: 'Logistics portal accounts' },
    { id: 'administrator-accounts', label: 'ADMIN ACCTS', icon: UserCog, view: 'staff', module: 'staff', hover: 'Administrator accounts' },
    { id: 'time-stations', label: 'TIME STATIONS', icon: ScanLine, view: 'stations', module: 'stations' },
    { id: 'payroll-settings', label: 'PAYROLL SETTINGS', icon: SlidersHorizontal, view: 'payroll-settings', module: 'payroll-settings' },
  ] },
];

const ADMIN_NAV_KEY = 'kimoel.admin.nav.v1';

export function AdminDashboard({ userName, isSuperAdmin, role: roleProp, onLogout }: AdminDashboardProps) {
  // Enable auto-logout when app is closed
  useAutoLogout();
  useDocumentTitle('Administrator');

  // Effective role drives module visibility. Super admin = owner; default to admin for safety.
  const role: Role = isSuperAdmin ? 'owner' : (roleProp || 'admin');

  // Build the visible sidebar tree: items the role can see, and groups keeping only their visible items.
  const visibleTops = ADMIN_TOPS.filter(i => canView(role, i.module));
  const visibleGroups = ADMIN_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => canView(role, i.module)) }))
    .filter(g => g.items.length > 0);

  // First view the role is allowed to see, scanning the top items then each group in order.
  const firstAllowedView: View = visibleTops[0]?.view ?? visibleGroups[0]?.items[0]?.view ?? 'home';

  const [currentView, setCurrentView] = useState<View>(firstAllowedView);
  // Menu preferences (minimized strip + which groups are open), remembered per browser. Loading and saving are
  // wrapped, so the menu works with storage unavailable -- it just forgets between visits.
  const [navPrefs, setNavPrefs] = useState<NavPrefs>(() => loadNavPrefsFor(ADMIN_NAV_KEY, ADMIN_GROUPS));
  useEffect(() => { saveNavPrefsTo(ADMIN_NAV_KEY, navPrefs); }, [navPrefs]);
  // Landing on a screen (a click, the attention card, a link from the Overview) opens the group that holds it.
  useEffect(() => { setNavPrefs(p => revealGroupForIn(ADMIN_GROUPS, p, currentView)); }, [currentView]);
  // Where Overview / Payable Report links land: a receivable, a PO number, a voucher number.
  const [receivablesFocus, setReceivablesFocus] = useState<number | null>(null);
  const [payableSearch, setPayableSearch] = useState('');
  const [billingMonth, setBillingMonth] = useState('');
  const [voucherFocus, setVoucherFocus] = useState('');
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
  // graceNotices rides along on the same endpoint: who the clock station has told this month that they
  // passed their 3 grace arrivals. Accountability only — no pay effect, nothing to approve.
  const [counts, setCounts] = useState<{
    purchaseRequests: number; purchaseOrders: number; withdrawals: number; overdueInvoices: number;
    graceNotices: { count: number; people: { name: string; work_date: string; uses: number }[] };
    // Scheduled days whose punches look incomplete (one scan, an odd number, or a first scan after noon).
    missedScans: { count: number; items: { person_id: number; name: string; work_date: string; punches: number; why: string }[] };
  }>({ purchaseRequests: 0, purchaseOrders: 0, withdrawals: 0, overdueInvoices: 0, graceNotices: { count: 0, people: [] }, missedScans: { count: 0, items: [] } });
  // Which day the Attendance Sheet should open on when the admin follows a missed-scan link. The nonce
  // makes a second click on the same day act again.
  const [sheetFocus, setSheetFocus] = useState<{ personId: number; date: string; nonce: number } | null>(null);
  const loadCounts = async () => {
    // Merged rather than replaced so an older server that omits a key can't blank the card.
    try { const next = await fetchApi('/admin/queue-counts'); setCounts(c => ({ ...c, ...next })); }
    catch { /* keep last-known */ }
  };
  useEffect(() => { loadCounts(); }, []);
  // Also refresh the counts each time the admin leaves a queue view (they likely just cleared
  // something), on top of the 20s poll and the tab-focus refetch inside the hook.
  useEffect(() => { loadCounts(); }, [currentView]);
  useLiveRefresh(loadCounts);

  // The live counts the nav items wear, by the `badge` key on each item. A collapsed group's heading shows the sum
  // of its items' badges (done inside SidebarNav).
  const navBadges = { pr: counts.purchaseRequests, po: counts.purchaseOrders, wd: counts.withdrawals, rec: counts.overdueInvoices };

  // [removed] Admin Requests tab, its render branch, and the effect that fetched
  // adminRequests — the data was never passed to the component (it fetched its own), so the
  // request was pure duplication. AdminRequests-Professional.tsx is now unreferenced.

  // Where a click on the Overview (alert, card, calendar item) goes. Contract Trading and Facilities have no
  // Administrator screen yet, so those links say so instead of doing nothing.
  const goTo = (view: View) => { setCurrentView(view); setMobileOpen(false); };
  const openFromOverview = (l: OverviewLink) => {
    setReceivablesFocus(null); setPayableSearch(''); setVoucherFocus(''); setBillingMonth('');
    const map: Record<string, View> = {
      'billing-invoices': 'billing-invoices', receivables: 'receivables', payables: 'payables', collections: 'collections', expenses: 'expenses', pcf: 'pcf',
      orders: 'purchase-orders', projects: 'projects', payroll: 'payroll',
    };
    const target = map[l.view];
    if (!target) { toast.info('Contract Trading and Facilities are in the Accounting portal.'); return; }
    if (l.view === 'billing-invoices') setBillingMonth(l.month || '');
    if (l.view === 'receivables' && l.id !== undefined) setReceivablesFocus(Number(l.id));
    if (l.view === 'payables' && l.search) setPayableSearch(l.search);
    goTo(target);
  };

  const renderContent = () => {
    // Role guard: never render a module this role can't see (e.g. via stale state).
    if (!canView(role, currentView)) {
      return <div style={{ padding: '40px', color: '#5a5a5a' }}>You don't have access to this section.</div>;
    }

    // Accounting screens: the same components the Accounting portal mounts, handed the admin fetcher.
    if (currentView === 'overview') return <AccountingOverview api={fetchApi} userKey={`admin:${userEmail || userName}`} onOpen={openFromOverview} />;
    if (currentView === 'collections') return <CollectionsReport api={fetchApi} isAdmin={canManage(role, 'collections')}
      onOpenInvoice={(id) => { setReceivablesFocus(id); goTo('receivables'); }} />;
    if (currentView === 'purchases-report') return <PurchasesReport api={fetchApi} isAdmin={canManage(role, 'purchases-report')} onOpenPo={() => goTo('purchase-orders')} />;
    if (currentView === 'payables') return <PayableReport key={payableSearch || 'all'} initialSearch={payableSearch} api={fetchApi}
      onOpenVoucher={(serialNo) => { setVoucherFocus(serialNo); goTo('expenses'); }} />;
    if (currentView === 'expenses') return <AdminDisbursement key={voucherFocus || 'all'} initialSearch={voucherFocus} api={fetchApi} isAdmin={canManage(role, 'expenses')} />;
    if (currentView === 'pcf') return <AdminPcf api={fetchApi} isAdmin={canManage(role, 'pcf')} />;
    if (currentView === 'gl-accounts') return <GlAccountsScreen api={fetchApi} />;
    if (currentView === 'thirteenth') return <ThirteenthMonth api={fetchApi} isAdmin={canManage(role, 'thirteenth')} />;

    // New CRM / pipeline / planning modules
    if (currentView === 'suppliers') return <SuppliersList isAdmin={canManage(role, 'suppliers')} />;
    if (currentView === 'customers') return <CustomersList isAdmin={canManage(role, 'customers')} />;
    // fetchApi (admin token) is the default this screen expects; the Accounting portal passes its own.
    if (currentView === 'delivery-receipts') return <DeliveryReceipts api={fetchApi} isAdmin={canManage(role, 'delivery-receipts')} />;
    if (currentView === 'billing-invoices') return <BillingInvoices key={billingMonth || 'all'} monthFilter={billingMonth} api={fetchApi} isAdmin={canManage(role, 'billing-invoices')} />;
    if (currentView === 'receivables') return <Receivables key={receivablesFocus ?? 'all'} api={fetchApi} isAdmin={canManage(role, 'receivables')} focusId={receivablesFocus} />;
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

    if (currentView === 'discrepancies') {
      return <DeliveryDiscrepancies />;
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

    if (currentView === 'roster') {
      return <RosterList />;
    }

    if (currentView === 'stations') {
      return <StationsList />;
    }

    if (currentView === 'timesheet') {
      return <TimesheetReview api={fetchApi} role="admin" focus={sheetFocus} />;
    }

    if (currentView === 'holidays') {
      return <HolidaysList />;
    }

    if (currentView === 'payroll-settings') {
      return <PayrollSettings />;
    }

    if (currentView === 'payroll') {
      return <PayrollReview api={fetchApi} role="admin" />;
    }

    if (currentView === 'purchase-requests') {
      return <PurchaseRequestsReview />;
    }

    if (currentView === 'withdrawal-requests') {
      return <WithdrawalRequestsReview isAdmin={canManage(role, 'withdrawal-requests')} />;
    }

    return <div>View not found</div>;
  };

  // Sidebar state. The mobile drawer is never icon-only: a 'minimized' saved on a desktop must not turn the phone
  // menu into a column of bare icons.
  const mini = navPrefs.minimized && !mobileOpen;
  const menuOpen = !mini;
  const toggleNavGroup = (groupId: string) => setNavPrefs(p => toggleGroupIn(ADMIN_GROUPS, p, groupId, currentView));

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <div className="admin-portal h-screen bg-slate-50 flex overflow-hidden">
      {/* #8 — dismissible attention card, fed by the same queue-counts the badges use. */}
      <AttentionCard items={[
        { label: 'Purchase requests to verify', count: counts.purchaseRequests, onView: () => setCurrentView('purchase-requests') },
        { label: 'Purchase orders to approve', count: counts.purchaseOrders, onView: () => setCurrentView('purchase-orders') },
        { label: 'Withdrawals to approve', count: counts.withdrawals, onView: () => setCurrentView('withdrawal-requests') },
        { label: 'Overdue invoices', count: counts.overdueInvoices, onView: () => setCurrentView('receivables') },
        // One link per flagged day, straight to that day on the Attendance Sheet.
        {
          label: 'Possible missed scans',
          count: counts.missedScans?.count ?? 0,
          links: (counts.missedScans?.items ?? []).map(m => ({
            label: `${m.name} — ${new Date(`${m.work_date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}: ${m.why}`,
            title: 'Open this day on the Attendance Sheet',
            onClick: () => { setSheetFocus({ personId: m.person_id, date: m.work_date, nonce: Date.now() }); setCurrentView('timesheet'); },
          })),
        },
        // No onView: there is deliberately no grace report to jump to. The names ARE the notification.
        {
          label: 'Grace allowance exceeded (late arrivals)',
          count: counts.graceNotices?.count ?? 0,
          detail: (counts.graceNotices?.people ?? [])
            .map(p => `${p.name} — ${new Date(`${p.work_date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} (use ${p.uses})`)
            .join(' · '),
        },
      ]} />
      {/* Sidebar. Matches the portal shell: a fixed drawer under lg, an in-flow rail above it.
          The admin previously had no mobile behaviour at all — the sidebar simply ate the
          screen on a phone, with no way to dismiss it. */}
      <div className={`bg-white border-r border-gray-200 flex-shrink-0 z-30 flex-col transition-all duration-300 ${menuOpen ? 'w-64' : 'w-20'} ${mobileOpen ? 'flex fixed inset-y-0 left-0' : 'hidden lg:flex'}`}>
        {/* Header: expand/collapse toggle + portal title, with the logo below */}
        <div className="border-b border-gray-200">
          <div className={`flex items-center gap-2 px-3 py-3 ${!menuOpen ? 'justify-center' : ''}`}>
            {/* Purpose-built sidebar icons: the panel glyph shows which way it will move.
                text-gray-500 (#5A5A5A) matches the resting nav tabs below. */}
            <button
              onClick={() => setNavPrefs(p => setMinimized(p, !p.minimized))}
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

        {/* Navigation: the grouped menu shared with the Accounting portal. */}
        <SidebarNav<View> tops={visibleTops} groups={visibleGroups} ariaLabel="Administrator"
          activeView={currentView} minimized={mini} prefs={navPrefs} badges={navBadges}
          onNavigate={(v) => { goTo(v); setReceivablesFocus(null); setPayableSearch(''); setVoucherFocus(''); setBillingMonth(''); }}
          onToggleGroup={toggleNavGroup} />

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
