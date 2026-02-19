import { useState, useEffect } from 'react';
import { mockAssets } from '../data/mockData';
import { fetchAssets } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { 
  Truck, 
  Activity, 
  AlertTriangle, 
  MapPin, 
  Clock, 
  Fuel,
  Battery,
  Gauge,
  TrendingUp
} from 'lucide-react';

interface FleetOverviewProps {
  onAssetClick: (assetId: string) => void;
}

export function FleetOverview({ onAssetClick }: FleetOverviewProps) {
  const [assets, setAssets] = useState(mockAssets);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAssets()
      .then(setAssets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeAssets = assets.filter(a => a.status === 'active').length;
  const idleAssets = assets.filter(a => a.status === 'idle').length;
  const offlineAssets = assets.filter(a => a.status === 'offline').length;
  const totalEngineHours = assets.reduce((sum, a) => sum + a.engineHours, 0);
  const avgEfficiency = assets.length ? Math.round(
    assets.reduce((sum, a) => sum + a.efficiencyScore, 0) / assets.length
  ) : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'idle':
        return 'bg-yellow-500';
      case 'offline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-emerald-500/10 hover:bg-emerald-100 transition-all duration-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30 dark:shadow-lg dark:shadow-emerald-500/20 dark:hover:bg-emerald-500/30">Active</Badge>;
      case 'idle':
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-amber-500/10 hover:bg-amber-100 transition-all duration-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30 dark:shadow-lg dark:shadow-amber-500/20 dark:hover:bg-amber-500/30">Idle</Badge>;
      case 'offline':
        return <Badge className="bg-rose-50 text-rose-700 border-rose-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-rose-500/10 hover:bg-rose-100 transition-all duration-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30 dark:shadow-lg dark:shadow-rose-500/20 dark:hover:bg-rose-500/30">Offline</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-slate-500/10 hover:bg-slate-200 transition-all duration-200 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30 dark:shadow-lg dark:shadow-slate-500/20 dark:hover:bg-slate-500/30">{status}</Badge>;
    }
  };

  const getEfficiencyColor = (score: number) => {
    if (score >= 85) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 70) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[280px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
          <span className="text-sm font-medium text-slate-500">Loading fleet...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 transition-all duration-300 border-l-4 border-l-emerald-500 dark:bg-slate-800/30 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30 dark:hover:brightness-110 dark:border-l-emerald-500">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg dark:bg-emerald-500/20">
                <Activity className="size-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-xs font-medium text-slate-600 uppercase tracking-widerest dark:text-slate-400">Active</span>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{activeAssets}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 transition-all duration-300 border-l-4 border-l-amber-500 dark:bg-slate-800/30 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30 dark:hover:brightness-110 dark:border-l-amber-500">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-500/10 rounded-lg dark:bg-amber-500/20">
                <Clock className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xs font-medium text-slate-600 uppercase tracking-widerest dark:text-slate-400">Idle</span>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{idleAssets}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 transition-all duration-300 border-l-4 border-l-rose-500 dark:bg-slate-800/30 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30 dark:hover:brightness-110 dark:border-l-rose-500">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-rose-500/10 rounded-lg dark:bg-rose-500/20">
                <AlertTriangle className="size-5 text-rose-600 dark:text-rose-400" />
              </div>
              <span className="text-xs font-medium text-slate-600 uppercase tracking-widerest dark:text-slate-400">Offline</span>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{offlineAssets}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 transition-all duration-300 border-l-4 border-l-amber-400 dark:bg-slate-800/30 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30 dark:hover:brightness-110 dark:border-l-amber-400">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-400/10 rounded-lg dark:bg-amber-400/20">
                <TrendingUp className="size-5 text-amber-600 dark:text-amber-300" />
              </div>
              <span className="text-xs font-medium text-slate-600 uppercase tracking-widerest dark:text-slate-400">Avg Efficiency</span>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{avgEfficiency}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Fleet List */}
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30">
        <CardHeader className="border-b border-slate-200/60 bg-slate-50/50 px-6 py-4 dark:border-b dark:border-slate-700/50 dark:bg-slate-800/30">
          <CardTitle className="flex items-center gap-3 text-slate-900 font-semibold dark:text-slate-100">
            <div className="p-2 bg-slate-100 rounded-lg dark:bg-slate-700/50">
              <Truck className="size-5 text-slate-600 dark:text-slate-300" />
            </div>
            Fleet assets ({assets.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-200/60 dark:divide-y dark:divide-slate-700/30">
            {assets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => onAssetClick(asset.id)}
                className="w-full p-6 hover:bg-slate-50/80 transition-all duration-300 text-left hover:shadow-lg hover:shadow-slate-900/10 group dark:hover:bg-slate-700/50 dark:hover:shadow-lg dark:hover:shadow-black/20 dark:hover:brightness-105 dark:border-b dark:border-transparent"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`size-3 rounded-full ${getStatusColor(asset.status)} shadow-lg shadow-current/50`} />
                      <span className="font-bold text-lg text-slate-900 dark:text-slate-100">{asset.name}</span>
                    </div>
                    <div className="text-sm text-slate-500 font-mono dark:text-slate-400">{asset.id}</div>
                  </div>
                  {getStatusBadge(asset.status)}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <div className="p-1.5 bg-amber-100 rounded-lg dark:bg-amber-500/20">
                      <MapPin className="size-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <span className="truncate">{asset.location}</span>
                  </div>

                  {asset.driver && (
                    <div className="text-sm text-slate-600 flex items-center gap-2 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-500">Driver:</span>
                      <span className="font-medium">{asset.driver}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                      <div className="p-1.5 bg-blue-100 rounded-lg dark:bg-blue-500/20">
                        <Gauge className="size-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="font-semibold">{asset.speed} km/h</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                      <div className="p-1.5 bg-orange-100 rounded-lg dark:bg-orange-500/20">
                        <Fuel className="size-4 text-orange-600 dark:text-orange-400" />
                      </div>
                      <span className="font-semibold">{asset.fuelLevel}%</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                      <div className="p-1.5 bg-emerald-100 rounded-lg dark:bg-emerald-500/20">
                        <Battery className="size-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <span className="font-semibold">{asset.batteryVoltage}V</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                      <div className="p-1.5 bg-slate-200 rounded-lg dark:bg-slate-600/20">
                        <Clock className="size-4 text-slate-600 dark:text-slate-400" />
                      </div>
                      <span className="font-semibold">{asset.engineHours}h</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-200/60 dark:border-t dark:border-slate-700/30">
                  <div className="text-xs text-slate-500 dark:text-slate-400">{asset.lastUpdate}</div>
                  <div className={`text-xs font-semibold ${getEfficiencyColor(asset.efficiencyScore)}`}>
                    Efficiency: {asset.efficiencyScore}%
                  </div>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
