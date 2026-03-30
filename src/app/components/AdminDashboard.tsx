import { useState, useEffect } from 'react';
import { useAutoLogout } from '../hooks/useAutoLogout';
import { Button } from './ui/button';
import { LogOut, Home, FileText, Receipt, Menu, X, UserPlus, Check, XCircle, MapPin, Calendar, Clock, Truck, Wrench, ShoppingCart, Package, User, UserCheck } from 'lucide-react';
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
import { LiveVehicleMap } from './LiveVehicleMap-Professional';
import { WorkingMap } from './WorkingMap';
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
  onLogout: () => void;
}

type View = 'home' | 'orders' | 'transactions' | 'requests' | 'material-requests' | 'employee-approvals' | 'driver-approvals' | 'driver-vehicles' | 'delivery-management' | 'gps' | 'fleet' | 'pms' | 'purchase-orders' | 'inventory' | 'drivers' | 'deliveries' | 'miscellaneous' | 'request-form';

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
    if (currentView === 'home') {
      return <BusinessOverview isAdmin={true} />;
    }
    
    if (currentView === 'orders') {
      return <SalesOrdersList isAdmin={true} />;
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
          {/* Dashboard */}
          <button
            onClick={() => setCurrentView('home')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              currentView === 'home' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <Home 
                style={{
                  width: '18px',
                  height: '18px',
                  color: currentView === 'home' ? '#2563eb' : '#6b7280'
                }} 
              />
              {menuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: currentView === 'home' ? '#2563eb' : '#111827'
                }}>
                  Dashboard
                </span>
              )}
            </div>
          </button>

          {/* Orders */}
          <button
            onClick={() => setCurrentView('orders')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              currentView === 'orders' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <FileText 
                style={{
                  width: '18px',
                  height: '18px',
                  color: currentView === 'orders' ? '#2563eb' : '#6b7280'
                }} 
              />
              {menuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: currentView === 'orders' ? '#2563eb' : '#111827'
                }}>
                  Sales Orders
                </span>
              )}
            </div>
          </button>

          {/* Purchase Orders */}
          <button
            onClick={() => setCurrentView('purchase-orders')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              currentView === 'purchase-orders' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <Package 
                style={{
                  width: '18px',
                  height: '18px',
                  color: currentView === 'purchase-orders' ? '#2563eb' : '#6b7280'
                }} 
              />
              {menuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: currentView === 'purchase-orders' ? '#2563eb' : '#111827'
                }}>
                  Purchase Orders
                </span>
              )}
            </div>
          </button>

          {/* Request Order */}
          <button
            onClick={() => setCurrentView('request-form')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              currentView === 'request-form' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <ShoppingCart 
                style={{
                  width: '18px',
                  height: '18px',
                  color: currentView === 'request-form' ? '#2563eb' : '#6b7280'
                }} 
              />
              {menuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: currentView === 'request-form' ? '#2563eb' : '#111827'
                }}>
                  Request Order
                </span>
              )}
            </div>
          </button>

          {/* Inventory Management */}
          <button
            onClick={() => setCurrentView('inventory')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              currentView === 'inventory' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <Package 
                style={{
                  width: '18px',
                  height: '18px',
                  color: currentView === 'inventory' ? '#2563eb' : '#6b7280'
                }} 
              />
              {menuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: currentView === 'inventory' ? '#2563eb' : '#111827'
                }}>
                  Inventory Management
                </span>
              )}
            </div>
          </button>

          {/* Miscellaneous */}
          <button
            onClick={() => setCurrentView('miscellaneous')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              currentView === 'miscellaneous' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <Wrench 
                style={{
                  width: '18px',
                  height: '18px',
                  color: currentView === 'miscellaneous' ? '#2563eb' : '#6b7280'
                }} 
              />
              {menuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: currentView === 'miscellaneous' ? '#2563eb' : '#111827'
                }}>
                  Miscellaneous
                </span>
              )}
            </div>
          </button>

          {/* Fleet */}
          <button
            onClick={() => setCurrentView('fleet')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              currentView === 'fleet' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <Truck 
                style={{
                  width: '18px',
                  height: '18px',
                  color: currentView === 'fleet' ? '#2563eb' : '#6b7280'
                }} 
              />
              {menuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: currentView === 'fleet' ? '#2563eb' : '#111827'
                }}>
                  Fleet
                </span>
              )}
            </div>
          </button>

          {/* GPS Tracking */}
          <button
            onClick={() => setCurrentView('gps')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              currentView === 'gps' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <MapPin 
                style={{
                  width: '18px',
                  height: '18px',
                  color: currentView === 'gps' ? '#2563eb' : '#6b7280'
                }} 
              />
              {menuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: currentView === 'gps' ? '#2563eb' : '#111827'
                }}>
                  GPS Tracking
                </span>
              )}
            </div>
          </button>

          {/* Admin Requests */}
          {isSuperAdmin && (
            <button
              onClick={() => setCurrentView('requests')}
              className={`w-full text-left rounded-lg transition-all duration-200 ${
                currentView === 'requests' 
                  ? 'bg-blue-50 border border-blue-200' 
                  : 'hover:bg-gray-50 border border-transparent'
              }`}
              style={{
                padding: '12px 16px',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
              }}
            >
              <div className="flex items-center gap-3">
                <UserPlus 
                  style={{
                    width: '18px',
                    height: '18px',
                    color: currentView === 'requests' ? '#2563eb' : '#6b7280'
                  }} 
                />
                {menuOpen && (
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: currentView === 'requests' ? '#2563eb' : '#111827'
                  }}>
                    Admin Requests
                  </span>
                )}
              </div>
            </button>
          )}

          {/* Employee Approvals */}
          <button
            onClick={() => setCurrentView('employee-approvals')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              currentView === 'employee-approvals' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <UserCheck 
                style={{
                  width: '18px',
                  height: '18px',
                  color: currentView === 'employee-approvals' ? '#2563eb' : '#6b7280'
                }} 
              />
              {menuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: currentView === 'employee-approvals' ? '#2563eb' : '#111827'
                }}>
                  Employee Approvals
                </span>
              )}
            </div>
          </button>

          {/* Driver Approvals */}
          <button
            onClick={() => setCurrentView('driver-approvals')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              currentView === 'driver-approvals' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <UserCheck 
                style={{
                  width: '18px',
                  height: '18px',
                  color: currentView === 'driver-approvals' ? '#2563eb' : '#6b7280'
                }} 
              />
              {menuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: currentView === 'driver-approvals' ? '#2563eb' : '#111827'
                }}>
                  Driver Approvals
                </span>
              )}
            </div>
          </button>

          {/* Delivery Management */}
          <button
            onClick={() => setCurrentView('delivery-management')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              currentView === 'delivery-management'
                ? 'bg-blue-50 border border-blue-200'
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <Truck
                style={{
                  width: '18px',
                  height: '18px',
                  color: currentView === 'delivery-management' ? '#2563eb' : '#6b7280'
                }}
              />
              {menuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: currentView === 'delivery-management' ? '#2563eb' : '#111827'
                }}>
                  Delivery Management
                </span>
              )}
            </div>
          </button>

        </nav>

        {/* User Menu */}
        <div className="p-3 border-t border-gray-200">
          <div className="flex items-center gap-3 p-3 mb-2">
            <User 
              style={{
                width: '18px',
                height: '18px',
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
                style={{
                  width: '18px',
                  height: '18px',
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
              <h1 className="text-4xl font-black text-black tracking-tight">Admin Dashboard</h1>
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
  );
}
