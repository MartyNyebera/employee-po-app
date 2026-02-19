import { useState, useEffect } from 'react';
import { useAutoLogout } from '../hooks/useAutoLogout';
import { Button } from './ui/button';
import { LogOut, Home, FileText, Receipt, Menu, X, UserPlus, Check, XCircle, MapPin, Calendar, Clock, Truck, Wrench } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { FleetOverview } from './FleetOverview';
import { AssetDetails } from './AssetDetails';
import { PurchaseOrdersList } from './PurchaseOrdersList';
import { TransactionsList } from './TransactionsList';
import { LiveVehicleMap } from './LiveVehicleMap';
import { SuperSimpleMap } from './SuperSimpleMap';
import { FleetList } from './FleetList';
import { VehicleDetails } from './VehicleDetails';
import { PMSReminders } from './PMSReminders';
import { fetchAdminRequests, approveAdminRequest, rejectAdminRequest, type AdminApprovalRequest } from '../api/client';
import { toast } from 'sonner';

interface AdminDashboardProps {
  userName: string;
  isSuperAdmin?: boolean;
  onLogout: () => void;
}

type View = 'home' | 'orders' | 'transactions' | 'requests' | 'gps' | 'fleet' | 'pms';

export function AdminDashboard({ userName, isSuperAdmin, onLogout }: AdminDashboardProps) {
  // Enable auto-logout when app is closed
  useAutoLogout();
  
  const [currentView, setCurrentView] = useState<View>('home');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminRequests, setAdminRequests] = useState<AdminApprovalRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  useEffect(() => {
    if (isSuperAdmin && currentView === 'requests') {
      setLoadingRequests(true);
      fetchAdminRequests()
        .then(setAdminRequests)
        .catch(() => toast.error('Failed to load admin requests'))
        .finally(() => setLoadingRequests(false));
    }
  }, [isSuperAdmin, currentView]);

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
      if (selectedAssetId) {
        return <AssetDetails assetId={selectedAssetId} onBack={handleBackToOverview} isAdmin={true} />;
      }
      return <FleetOverview onAssetClick={handleAssetClick} />;
    }
    
    if (currentView === 'orders') {
      return <PurchaseOrdersList isAdmin={true} />;
    }
    
    if (currentView === 'transactions') {
      return <TransactionsList isAdmin={true} />;
    }

    if (currentView === 'gps') {
      return <SuperSimpleMap />;
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
    { id: 'orders', label: 'Orders', icon: FileText },
    { id: 'transactions', label: 'Transactions', icon: Receipt },
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
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      {/* Bottom Navigation - Mobile Only */}
      <nav className="md:hidden bg-white border-t border-slate-200 flex items-center justify-around py-2 sticky bottom-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id as View);
                setSelectedAssetId(null);
              }}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === item.id ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
