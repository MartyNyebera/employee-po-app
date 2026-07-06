import { useState, useEffect } from 'react';
import { useAutoLogout } from '../hooks/useAutoLogout';
import { Button } from './ui/button';
import { LogOut, Home, FileText, Receipt, Menu, X, UserPlus, Check, XCircle, MapPin, Clock, Truck, Wrench, ShoppingCart, Package, User, UserCheck, MessageSquare, Users, Factory, UserCog } from 'lucide-react';
import { SuppliersList } from './crm/SuppliersList';
import { CustomersList } from './crm/CustomersList';
import { InquiriesList } from './crm/InquiriesList';
import { StaffAccountsList } from './crm/StaffAccountsList';
import { canView, canManage, type Role } from '../config/permissions';
import ErrorBoundary from './ErrorBoundary';
import { PageErrorFallback } from './PageErrorFallback';
import { ThemeToggle } from './ThemeToggle';
import { BusinessOverview } from './BusinessOverview-InlineStyles';
import { AssetDetails } from './AssetDetails';
import { PurchaseOrdersList } from './PurchaseOrdersList';
import { EmployeeApprovals } from './EmployeeApprovals-Professional';
import { DriverApprovals } from './DriverApprovals-Professional';
import { AdminRequests } from './AdminRequests-Professional';
import { MaterialRequests } from './MaterialRequests-Professional';
import { SalesOrdersList } from './SalesOrdersList-Professional';
import { TransactionsList } from './TransactionsList-Professional';
import { WorkingMap as LiveVehicleMap } from './WorkingMap';
import { FleetList } from './FleetList-Professional';
import { VehicleDetails } from './VehicleDetails';
import { PMSReminders } from './PMSReminders-Professional';
import { PurchaseOrderList } from './PurchaseOrderList-Professional-Fixed';
import { InventoryList } from './InventoryList-Professional';
import { DriversList } from './DriversList-Professional';
import { DriverVehicleAssignment } from './DriverVehicleAssignment';
import { DeliveryManagement } from './DeliveryManagement';
import { DeliveriesList } from './DeliveriesList-Professional';
import { MiscellaneousManagement } from './MiscellaneousManagement-Simple';
import { 
  fetchAdminRequests, 
  approveAdminRequest, 
  rejectAdminRequest, 
  fetchPendingEmployees,
  fetchPendingDrivers,
  approveEmployee,
  rejectEmployee,
  approveDriver,
  rejectDriver,
  type AdminApprovalRequest,
  type EmployeeRegistration,
  type DriverRegistration
} from '../api/client';
import { toast } from 'sonner';

interface AdminDashboardProps {
  userName: string;
  isSuperAdmin?: boolean;
  role?: Role;
  onLogout: () => void;
}

type View = 'home' | 'orders' | 'transactions' | 'requests' | 'material-requests' | 'employee-approvals' | 'driver-approvals' | 'driver-vehicles' | 'delivery-management' | 'gps' | 'fleet' | 'pms' | 'purchase-orders' | 'inventory' | 'drivers' | 'deliveries' | 'miscellaneous' | 'request-form' | 'suppliers' | 'customers' | 'inquiries' | 'staff';

// Sidebar entries, in display order. Visibility + write access come from MODULE_ACCESS.
const NAV_ITEMS: { view: View; label: string; icon: any; module: string }[] = [
  { view: 'home', label: 'Dashboard', icon: Home, module: 'home' },
  { view: 'orders', label: 'Sales Orders', icon: FileText, module: 'orders' },
  { view: 'purchase-orders', label: 'Purchase Orders', icon: Package, module: 'purchase-orders' },
  { view: 'inquiries', label: 'Inquiries / Quotations', icon: MessageSquare, module: 'inquiries' },
  { view: 'customers', label: 'Customers', icon: Users, module: 'customers' },
  { view: 'suppliers', label: 'Suppliers', icon: Factory, module: 'suppliers' },
  { view: 'request-form', label: 'Request Order', icon: ShoppingCart, module: 'request-form' },
  { view: 'inventory', label: 'Inventory Management', icon: Package, module: 'inventory' },
  { view: 'miscellaneous', label: 'Miscellaneous', icon: Wrench, module: 'miscellaneous' },
  { view: 'fleet', label: 'Fleet', icon: Truck, module: 'fleet' },
  { view: 'gps', label: 'GPS Tracking', icon: MapPin, module: 'gps' },
  { view: 'delivery-management', label: 'Delivery Management', icon: Truck, module: 'delivery-management' },
  { view: 'employee-approvals', label: 'Employee Approvals', icon: UserCheck, module: 'employee-approvals' },
  { view: 'driver-approvals', label: 'Driver Approvals', icon: UserCheck, module: 'driver-approvals' },
  { view: 'staff', label: 'Staff Accounts', icon: UserCog, module: 'staff' },
  { view: 'requests', label: 'Admin Requests', icon: UserPlus, module: 'requests' },
];

export function AdminDashboard({ userName, isSuperAdmin, role: roleProp, onLogout }: AdminDashboardProps) {
  // Enable auto-logout when app is closed
  useAutoLogout();

  // Effective role drives module visibility. Super admin = owner; default to admin for safety.
  const role: Role = isSuperAdmin ? 'owner' : (roleProp || 'admin');
  const visibleNav = NAV_ITEMS.filter(item => canView(role, item.module));
  const firstAllowedView: View = (visibleNav[0]?.view) || 'home';

  const [currentView, setCurrentView] = useState<View>(firstAllowedView);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

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
  const [adminRequests, setAdminRequests] = useState<AdminApprovalRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [pendingEmployees, setPendingEmployees] = useState<EmployeeRegistration[]>([]);
  const [pendingDrivers, setPendingDrivers] = useState<DriverRegistration[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingDrivers, setLoadingDrivers] = useState(false);

  useEffect(() => {
    if (isSuperAdmin && currentView === 'requests') {
      setLoadingRequests(true);
      fetchAdminRequests()
        .then(setAdminRequests)
        .catch(err => toast.error('Failed to load admin requests'))
        .finally(() => setLoadingRequests(false));
    }
  }, [currentView, isSuperAdmin]);

  useEffect(() => {
    if (currentView === 'employee-approvals') {
      setLoadingEmployees(true);
      fetchPendingEmployees()
        .then(setPendingEmployees)
        .catch(err => toast.error('Failed to load employee approvals'))
        .finally(() => setLoadingEmployees(false));
    }
  }, [currentView]);

  useEffect(() => {
    if (currentView === 'driver-approvals') {
      setLoadingDrivers(true);
      fetchPendingDrivers()
        .then(setPendingDrivers)
        .catch(err => toast.error('Failed to load driver approvals'))
        .finally(() => setLoadingDrivers(false));
    }
  }, [currentView]);

  const handleApprove = async (id: string) => {
    try {
      await approveAdminRequest(id);
      setAdminRequests(prev => prev.filter(req => req.id !== id));
      toast.success('Admin request approved');
    } catch (err) {
      toast.error('Failed to approve request');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectAdminRequest(id);
      setAdminRequests(prev => prev.filter(req => req.id !== id));
      toast.success('Admin request rejected');
    } catch (err) {
      toast.error('Failed to reject request');
    }
  };

  const handleApproveEmployee = async (id: string) => {
    try {
      await approveEmployee(id, userName);
      setPendingEmployees(prev => prev.filter(emp => emp.id !== id));
      toast.success('Employee approved');
    } catch (err) {
      toast.error('Failed to approve employee');
    }
  };

  const handleRejectEmployee = async (id: string) => {
    try {
      await rejectEmployee(id, userName);
      setPendingEmployees(prev => prev.filter(emp => emp.id !== id));
      toast.success('Employee rejected');
    } catch (err) {
      toast.error('Failed to reject employee');
    }
  };

  const handleApproveDriver = async (id: string) => {
    try {
      await approveDriver(id, userName);
      setPendingDrivers(prev => prev.filter(driver => driver.id !== id));
      toast.success('Driver approved');
    } catch (err) {
      toast.error('Failed to approve driver');
    }
  };

  const handleRejectDriver = async (id: string) => {
    try {
      await rejectDriver(id, userName);
      setPendingDrivers(prev => prev.filter(driver => driver.id !== id));
      toast.success('Driver rejected');
    } catch (err) {
      toast.error('Failed to reject driver');
    }
  };

  const renderContent = () => {
    // Role guard: never render a module this role can't see (e.g. via stale state).
    if (!canView(role, currentView)) {
      return <div style={{ padding: '40px', color: '#6b7280' }}>You don't have access to this section.</div>;
    }

    // New CRM / pipeline / planning modules
    if (currentView === 'suppliers') return <SuppliersList isAdmin={canManage(role, 'suppliers')} />;
    if (currentView === 'customers') return <CustomersList isAdmin={canManage(role, 'customers')} />;
    if (currentView === 'inquiries') return <InquiriesList isAdmin={canManage(role, 'inquiries')} />;
    if (currentView === 'staff') return <StaffAccountsList />;

    if (currentView === 'home') {
      return <BusinessOverview isAdmin={canManage(role, 'home')} />;
    }

    if (currentView === 'orders') {
      return <SalesOrdersList isAdmin={canManage(role, 'orders')} />;
    }
    
    if (currentView === 'transactions') {
      return <TransactionsList isAdmin={true} />;
    }

    if (currentView === 'gps') {
      return <LiveVehicleMap />;
    }

    if (currentView === 'fleet') {
      if (selectedVehicleId) {
        return <VehicleDetails vehicleId={selectedVehicleId} onBack={() => setSelectedVehicleId(null)} />;
      }
      return <FleetList onSelectVehicle={(id) => setSelectedVehicleId(id)} />;
    }

    if (currentView === 'pms') {
      return <PMSReminders onSelectVehicle={(id) => { setSelectedVehicleId(id); setCurrentView('fleet'); }} />;
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

    if (currentView === 'drivers') {
      return <DriversList isAdmin={true} />;
    }

    if (currentView === 'deliveries') {
      return <DeliveriesList isAdmin={true} />;
    }

    if (currentView === 'employee-approvals') {
      return <EmployeeApprovals onApprove={handleApproveEmployee} onReject={handleRejectEmployee} userName={userName} />;
    }

    if (currentView === 'driver-approvals') {
      return <DriverApprovals onApprove={handleApproveDriver} onReject={handleRejectDriver} userName={userName} />;
    }

    if (currentView === 'driver-vehicles') {
      return (
        <div className="p-6">
          <DriverVehicleAssignment />
        </div>
      );
    }

    if (currentView === 'delivery-management') {
      return (
        <div className="p-6">
          <DeliveryManagement />
        </div>
      );
    }

    if (currentView === 'miscellaneous') {
      return <MiscellaneousManagement />;
    }

    if (currentView === 'request-form') {
      return <MaterialRequests />;
    }

    if (currentView === 'requests' && isSuperAdmin) {
      return <AdminRequests onApprove={handleApprove} onReject={handleReject} />;
    }

    return <div>View not found</div>;
  };

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <div className="admin-portal min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div className={`bg-white border-r border-gray-200 transition-all duration-300 ${menuOpen ? 'w-64' : 'w-20'} flex flex-col`}>
        {/* Logo */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <img
              src="/kimoel-logo.png"
              alt="KIMOEL"
              className="h-8 w-auto object-contain"
            />
            {menuOpen && (
              <span style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#111827',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
              }}>
                KIMOEL
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => setCurrentView(item.view)}
                className={`w-full text-left rounded-lg transition-all duration-200 ${
                  active
                    ? 'bg-blue-50 border border-blue-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
                style={{
                  padding: '12px 16px',
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
                }}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" style={{ color: active ? '#2563eb' : '#6b7280' }} />
                  {menuOpen && (
                    <span style={{ fontSize: '14px', fontWeight: '500', color: active ? '#2563eb' : '#111827' }}>
                      {item.label}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>

        {/* User Menu */}
        <div className="p-3 border-t border-gray-200">
          <div className="flex items-center gap-3 p-3 mb-2">
            <User 
              className="w-4 h-4"
              style={{
                color: '#6b7280'
              }} 
            />
            {menuOpen && (
              <span style={{
                fontSize: '14px',
                fontWeight: '400',
                color: '#6b7280',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
              }}>
                {userName}
              </span>
            )}
          </div>
          
          {/* Logout Button */}
          <button
            onClick={onLogout}
            className="w-full text-left rounded-lg transition-all duration-200 hover:bg-gray-50 border border-transparent"
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <LogOut 
                className="w-4 h-4"
                style={{
                  color: '#6b7280'
                }} 
              />
              {menuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827'
                }}>
                  Logout
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
              </Button>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-black tracking-tight">Admin Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">
                {new Date().toLocaleDateString()}
              </span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className={`flex-1 ${currentView === 'gps' ? 'overflow-hidden flex flex-col' : 'overflow-auto'}`}>
          {renderContent()}
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
