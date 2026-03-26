import { useState, useEffect } from 'react';
import { useAutoLogout } from '../hooks/useAutoLogout';
import { Button } from './ui/button';
import { LogOut, Home, FileText, Receipt, Menu, X, UserPlus, Check, XCircle, MapPin, Calendar, Clock, Truck, Wrench, ShoppingCart, Package, User, UserCheck } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { BusinessOverview } from './BusinessOverview-InlineStyles';
import { AssetDetails } from './AssetDetails';
import { PurchaseOrdersList } from './PurchaseOrdersList';
import { TransactionsList } from './TransactionsList';
import { LiveVehicleMap } from './LiveVehicleMap';
import { WorkingMap } from './WorkingMap';
import { FleetList } from './FleetList';
import { VehicleDetails } from './VehicleDetails';
import { PMSReminders } from './PMSReminders';
import { PurchaseOrderList } from './PurchaseOrderList';
import { InventoryList } from './InventoryList';
import { DriversList } from './DriversList';
import { DeliveriesList } from './DeliveriesList';
import { MaterialRequests } from './MaterialRequests';
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
  onLogout: () => void;
}

type View = 'home' | 'orders' | 'transactions' | 'requests' | 'material-requests' | 'employee-approvals' | 'driver-approvals' | 'gps' | 'fleet' | 'pms' | 'purchase-orders' | 'inventory' | 'drivers' | 'deliveries';

export function AdminDashboard({ userName, isSuperAdmin, onLogout }: AdminDashboardProps) {
  // Enable auto-logout when app is closed
  useAutoLogout();
  
  const [currentView, setCurrentView] = useState<View>('home');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // Listen for navigation events from child components
  useEffect(() => {
    const handleNavigation = (event: CustomEvent) => {
      const { view } = event.detail;
      console.log('🧭 Navigation event received:', view);
      setCurrentView(view as View);
    };

    window.addEventListener('navigateToView', handleNavigation as EventListener);
    return () => window.removeEventListener('navigateToView', handleNavigation as EventListener);
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
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
        .catch(() => toast.error('Failed to load admin requests'))
        .finally(() => setLoadingRequests(false));
    }
  }, [isSuperAdmin, currentView]);

  useEffect(() => {
    if (currentView === 'employee-approvals') {
      setLoadingEmployees(true);
      fetchPendingEmployees()
        .then(setPendingEmployees)
        .catch(() => toast.error('Failed to load employee registrations'))
        .finally(() => setLoadingEmployees(false));
    }
  }, [currentView]);

  useEffect(() => {
    if (currentView === 'driver-approvals') {
      setLoadingDrivers(true);
      fetchPendingDrivers()
        .then(setPendingDrivers)
        .catch(() => toast.error('Failed to load driver registrations'))
        .finally(() => setLoadingDrivers(false));
    }
  }, [currentView]);

  const handleApprove = async (id: string) => {
    try {
      await approveAdminRequest(id);
      toast.success('Admin account approved');
      setAdminRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectAdminRequest(id);
      toast.success('Admin request rejected');
      setAdminRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject');
    }
  };

  const handleApproveEmployee = async (id: string) => {
    try {
      await approveEmployee(id, userName);
      toast.success('Employee registration approved');
      setPendingEmployees((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve employee');
    }
  };

  const handleRejectEmployee = async (id: string) => {
    try {
      await rejectEmployee(id, userName);
      toast.success('Employee registration rejected');
      setPendingEmployees((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject employee');
    }
  };

  const handleApproveDriver = async (id: string) => {
    try {
      await approveDriver(id, userName);
      toast.success('Driver registration approved');
      setPendingDrivers((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve driver');
    }
  };

  const handleRejectDriver = async (id: string) => {
    try {
      await rejectDriver(id, userName);
      toast.success('Driver registration rejected');
      setPendingDrivers((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject driver');
    }
  };

  const handleAssetClick = (assetId: string) => {
    setSelectedAssetId(assetId);
  };

  const handleBackToOverview = () => {
    setSelectedAssetId(null);
  };

  const handleViewChange = (view: View) => {
    setCurrentView(view);
    setSelectedAssetId(null);
  };

  const renderContent = () => {
    if (currentView === 'home') {
      return <BusinessOverview isAdmin={true} />;
    }
    
    if (currentView === 'orders') {
      return <PurchaseOrdersList isAdmin={true} />;
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
      return <PurchaseOrderList isAdmin={true} />;
    }

    if (currentView === 'inventory') {
      return <InventoryList isAdmin={true} />;
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
      return (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <UserCheck className="size-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Employee Registration Approvals</h1>
                <p className="text-slate-600">Review and approve employee account requests</p>
              </div>
            </div>
            <div className="text-sm text-slate-500">
              {pendingEmployees.length} pending
            </div>
          </div>

          {loadingEmployees ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-slate-600">Loading employee registrations...</p>
            </div>
          ) : pendingEmployees.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
              <UserCheck className="size-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No Pending Employee Registrations</h3>
              <p className="text-slate-500">All employee registrations have been reviewed</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingEmployees.map((employee) => (
                <div key={employee.id} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <UserCheck className="size-6 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">{employee.full_name}</h3>
                          <p className="text-slate-600">{employee.email}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-slate-500">Department:</span>
                          <p className="font-medium text-slate-900">{employee.department || 'Not specified'}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Position:</span>
                          <p className="font-medium text-slate-900">{employee.position || 'Not specified'}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Phone:</span>
                          <p className="font-medium text-slate-900">{employee.phone || 'Not specified'}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Applied:</span>
                          <p className="font-medium text-slate-900">
                            {new Date(employee.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        onClick={() => handleApproveEmployee(employee.id)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                      >
                        <Check className="size-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleRejectEmployee(employee.id)}
                        variant="destructive"
                        size="sm"
                      >
                        <XCircle className="size-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (currentView === 'driver-approvals') {
      return (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Truck className="size-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Driver Registration Approvals</h1>
                <p className="text-slate-600">Review and approve driver account requests</p>
              </div>
            </div>
            <div className="text-sm text-slate-500">
              {pendingDrivers.length} pending
            </div>
          </div>

          {loadingDrivers ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              <p className="mt-2 text-slate-600">Loading driver registrations...</p>
            </div>
          ) : pendingDrivers.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
              <Truck className="size-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No Pending Driver Registrations</h3>
              <p className="text-slate-500">All driver registrations have been reviewed</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingDrivers.map((driver) => (
                <div key={driver.id} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                          <Truck className="size-6 text-green-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">{driver.full_name}</h3>
                          <p className="text-slate-600">{driver.email}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-slate-500">Phone:</span>
                          <p className="font-medium text-slate-900">{driver.phone || 'Not specified'}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">License:</span>
                          <p className="font-medium text-slate-900">{driver.license_number || 'Not specified'}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Vehicle:</span>
                          <p className="font-medium text-slate-900">{driver.vehicle_assigned || 'Not assigned'}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Applied:</span>
                          <p className="font-medium text-slate-900">
                            {new Date(driver.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        onClick={() => handleApproveDriver(driver.id)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                      >
                        <Check className="size-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleRejectDriver(driver.id)}
                        variant="destructive"
                        size="sm"
                      >
                        <XCircle className="size-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (currentView === 'requests' && isSuperAdmin) {
      return (
        <div className="p-6 space-y-6">
          {/* Enhanced Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-500/20">
                  <UserPlus className="size-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Admin Approval Requests</h1>
                  <p className="text-slate-600 text-sm dark:text-slate-400">Review and approve or reject requests to create admin accounts</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <div className={`w-2 h-2 rounded-full ${adminRequests.length > 0 ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span>{adminRequests.length} pending</span>
            </div>
          </div>

          {loadingRequests ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-amber-500 animate-spin" />
                <span>Loading requests...</span>
              </div>
            </div>
          ) : adminRequests.length === 0 ? (
            <div className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 rounded-xl p-12 text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-amber-100 dark:bg-amber-500/20 rounded-full flex items-center justify-center">
                <UserPlus className="size-10 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">No Pending Admin Requests</h2>
              <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                All admin requests have been processed. New requests will appear here automatically when users request admin access.
              </p>
              <div className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                System is actively monitoring for new requests
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {adminRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 transition-all duration-300 dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30 rounded-xl p-6"
                >
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-amber-50 dark:bg-amber-500/20 rounded-lg">
                        <UserPlus className="size-6 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">{req.name}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">{req.email}</div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="size-3.5" />
                            <span>Requested {new Date(req.requestedAt).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="size-3.5" />
                            <span>{new Date(req.requestedAt).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button 
                        size="sm" 
                        onClick={() => handleApprove(req.id)}
                        className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 border border-emerald-500/20 transition-all duration-300"
                      >
                        <Check className="size-4 mr-2" />
                        Approve
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => handleReject(req.id)}
                        className="bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white shadow-lg shadow-rose-500/25 hover:shadow-xl hover:shadow-rose-500/30 border border-rose-500/20 transition-all duration-300"
                      >
                        <XCircle className="size-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    
    return null;
  };

  const navItems = [
    { id: 'home', label: 'Overview', icon: Home },
    { id: 'fleet', label: 'Fleet', icon: Truck },
    { id: 'pms', label: 'PMS Reminders', icon: Wrench },
    { id: 'gps', label: 'GPS Tracking', icon: MapPin },
    { id: 'drivers', label: 'Drivers', icon: UserCheck },
    { id: 'deliveries', label: 'Deliveries', icon: Package },
    { id: 'orders', label: 'Sales Order', icon: FileText },
    { id: 'purchase-orders', label: 'Purchase Order', icon: ShoppingCart },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'transactions', label: 'Miscellaneous', icon: Receipt },
    { id: 'material-requests', label: 'Material Requests', icon: Package },
    { id: 'employee-approvals', label: 'Employee Approvals', icon: UserCheck },
    { id: 'driver-approvals', label: 'Driver Approvals', icon: Truck },
    ...(isSuperAdmin ? [{ id: 'requests', label: 'Admin Requests', icon: UserPlus }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 dark:bg-slate-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-lg shadow-slate-900/10 dark:shadow-slate-800/50 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <img
            src="/kimoel-logo.png"
            alt="Kimoel Innovation"
            className="h-9 w-auto object-contain"
          />
          <div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Kimoel Tracking System</div>
            <div className="text-sm font-semibold text-slate-100">{userName} · Administrator</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-white hover:bg-slate-800 md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-white hover:bg-slate-800 hidden md:flex"
            onClick={onLogout}
          >
            <LogOut className="size-5" />
          </Button>
        </div>
      </header>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="bg-white border-b border-slate-200 md:hidden shadow-sm">
          <div className="flex flex-col p-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id as View);
                    setSelectedAssetId(null);
                    setMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium ${
                    currentView === item.id
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="size-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button
              onClick={onLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 hover:bg-slate-50 border-t border-slate-100 mt-2 pt-4 font-medium"
            >
              <LogOut className="size-5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-60 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="p-3 border-b border-slate-200 dark:border-slate-700">
            <ThemeToggle />
          </div>
          <nav className="p-3 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    handleViewChange(item.id as View);
                    setSelectedAssetId(null);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    currentView === item.id
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="size-5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content Area */}
        <div className={`flex-1 ${currentView === 'gps' ? 'overflow-hidden flex flex-col' : 'overflow-auto'}`}>
          {renderContent()}
        </div>
      </div>

          </div>
  );
}
