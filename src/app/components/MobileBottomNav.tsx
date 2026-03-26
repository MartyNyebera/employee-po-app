import React from 'react';
import { Package, ClipboardList, Bell, Plus } from 'lucide-react';
import type { EmployeeView } from '../pages/EmployeePortal';

interface MobileBottomNavProps {
  view: EmployeeView;
  setView: (view: EmployeeView) => void;
  unreadCount: number;
  className?: string;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  view,
  setView,
  unreadCount,
  className = ''
}) => {
  const tabs = [
    {
      id: 'inventory' as EmployeeView,
      label: 'Inventory',
      icon: Package,
      badge: false
    },
    {
      id: 'requests' as EmployeeView,
      label: 'New Request',
      icon: Plus,
      badge: false
    },
    {
      id: 'history' as EmployeeView,
      label: 'My Requests',
      icon: ClipboardList,
      badge: false
    },
    {
      id: 'notifications' as EmployeeView,
      label: 'Notifications',
      icon: Bell,
      badge: true
    }
  ];

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 lg:hidden ${className}`}>
      <div className="grid grid-cols-4 h-16">
        {tabs.map((tab) => {
          const isActive = view === tab.id;
          const Icon = tab.icon;
          
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`flex flex-col items-center justify-center text-xs font-medium transition-all duration-200 relative ${
                isActive
                  ? 'text-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              style={{ minHeight: '44px' }}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 mb-1 transition-all duration-200 ${
                  isActive ? 'text-blue-600' : 'text-slate-600'
                }`} />
                
                {tab.badge && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center min-w-[20px]">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              
              <span className="text-xs">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
