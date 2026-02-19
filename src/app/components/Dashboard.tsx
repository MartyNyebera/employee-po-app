import { useState } from 'react';
import { useAutoLogout } from '../hooks/useAutoLogout';
import { Button } from './ui/button';
import { LogOut, Home, FileText, Receipt, Menu, X, MapPin, Truck, Wrench } from 'lucide-react';
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

interface DashboardProps {
  userName: string;
  onLogout: () => void;
}

type View = 'home' | 'assets' | 'orders' | 'transactions' | 'gps' | 'fleet' | 'pms';

export function Dashboard({ userName, onLogout }: DashboardProps) {
  // Enable auto-logout when app is closed
  useAutoLogout();
  
  const [currentView, setCurrentView] = useState<View>('home');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleAssetClick = (assetId: string) => {
    setSelectedAssetId(assetId);
  };

  const handleViewChange = (view: View) => {
    console.log('[Dashboard] Changing view to:', view);
    if (view === 'gps') {
      console.log('[Dashboard] GPS tab clicked - rendering LiveVehicleMap');
    }
    setCurrentView(view);
  };

  const handleBackToOverview = () => {
    setSelectedAssetId(null);
    setCurrentView('home');
  };

  const renderView = () => {
    console.log('[Dashboard] Current view:', currentView);
    
    if (currentView === 'home') {
      if (selectedAssetId) {
        return <AssetDetails assetId={selectedAssetId} onBack={handleBackToOverview} isAdmin={false} />;
      }
      return <FleetOverview onAssetClick={handleAssetClick} />;
    }
    
    if (currentView === 'orders') {
      return <PurchaseOrdersList isAdmin={false} />;
    }
    
    if (currentView === 'transactions') {
      return <TransactionsList isAdmin={false} />;
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

    console.log('[Dashboard] No matching view, returning null');
    return null;
  };

  const navItems = [
    { id: 'home', label: 'Overview', icon: Home },
    { id: 'fleet', label: 'Fleet', icon: Truck },
    { id: 'pms', label: 'PMS Reminders', icon: Wrench },
    { id: 'gps', label: 'GPS Tracking', icon: MapPin },
    { id: 'orders', label: 'Orders', icon: FileText },
    { id: 'transactions', label: 'Transactions', icon: Receipt },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 dark:bg-slate-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-lg shadow-slate-900/10 dark:shadow-slate-800/50 transition-colors duration-300">
        <div className="flex items-center gap-4">
          <img
            src="/kimoel-logo.png"
            alt="Kimoel Innovation"
            className="w-10 h-10"
          />
          <div>
            <div className="text-xl font-bold">KIMOEL</div>
            <div className="text-sm text-slate-400">Fleet Management System</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="border-slate-700 hover:bg-slate-700 dark:border-slate-600 dark:hover:bg-slate-700 dark:hover:bg-slate-600 transition-all duration-150"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex">
        {/* Sidebar Navigation */}
        <nav className="w-64 bg-slate-800 dark:bg-slate-900 border-r border-slate-700 dark:border-slate-600">
          <div className="p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Navigation</h3>
            <div className="space-y-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    handleViewChange(item.id as View);
                    setSelectedAssetId(null);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden group ${
                    currentView === item.id
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/25 border-l-4 border-l-amber-400 border border-white/10'
                      : 'text-slate-300 hover:bg-slate-900/50 hover:text-white hover:shadow-lg hover:shadow-black/20 hover:-translate-x-1 border border-transparent'
                  }`}
                >
                  <item.icon className="size-5" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* User Info */}
          <div className="p-4 border-t border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-lg">
                  {userName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <div className="text-white font-medium">{userName}</div>
                <div className="text-blue-200 text-sm">Administrator</div>
              </div>
            </div>
          </div>
        </nav>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          {renderView()}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 dark:bg-slate-800 text-slate-400 px-6 py-4 text-center text-sm border-t border-slate-700">
        <p>© 2026 KIMOEL Innovation. All rights reserved.</p>
      </footer>
    </div>
  );
}
