import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { MapPin, AlertCircle, RefreshCw } from 'lucide-react';

// Define types locally
interface DeviceWithPosition {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  lastUpdate: string | null;
  positionId: number | null;
  category: string;
  position?: {
    id: number;
    deviceId: number;
    latitude: number;
    longitude: number;
    speed: number;
    course: number;
    altitude: number;
    accuracy: number;
    fixTime: string;
    deviceTime: string;
    serverTime: string;
    attributes: Record<string, unknown>;
  };
}

export function SafeMapTracker() {
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Simple GPS data receiver without map
  useEffect(() => {
    const handleGPSData = (e: StorageEvent) => {
      if ((e.key === 'phoneGPSData' || e.key === 'laptopGPSData') && e.newValue) {
        try {
          const gpsData = JSON.parse(e.newValue);
          console.log('✅ Received GPS data:', e.key, gpsData);
          
          setDevices([gpsData]);
          setLastUpdated(new Date());
          setLoading(false);
          setError(null);
        } catch (err) {
          console.log('❌ Error parsing GPS data:', err);
        }
      }
    };

    // Add event listener
    window.addEventListener('storage', handleGPSData);

    // Check for existing GPS data
    const existingPhoneData = localStorage.getItem('phoneGPSData');
    const existingLaptopData = localStorage.getItem('laptopGPSData');
    
    if (existingPhoneData) {
      try {
        const phoneData = JSON.parse(existingPhoneData);
        console.log('Received phone GPS data:', phoneData);
        setDevices([phoneData]);
        setLastUpdated(new Date());
        setLoading(false);
        setError(null);
      } catch (err) {
        console.log('Error parsing phone GPS data:', err);
      }
    }
    
    if (existingLaptopData) {
      try {
        const laptopData = JSON.parse(existingLaptopData);
        console.log('Received laptop GPS data:', laptopData);
        setDevices([laptopData]);
        setLastUpdated(new Date());
        setLoading(false);
        setError(null);
      } catch (err) {
        console.log('Error parsing laptop GPS data:', err);
      }
    }
    
    if (!existingPhoneData && !existingLaptopData) {
      setDevices([]);
      setLastUpdated(new Date());
      setLoading(false);
      setError(null);
    }

    // Simple polling every 5 seconds
    const pollInterval = setInterval(() => {
      const currentPhoneData = localStorage.getItem('phoneGPSData');
      const currentLaptopData = localStorage.getItem('laptopGPSData');
      
      if (currentPhoneData) {
        try {
          const phoneData = JSON.parse(currentPhoneData);
          setDevices([phoneData]);
          setLastUpdated(new Date());
        } catch (err) {
          console.log('Error parsing phone GPS data:', err);
        }
      }
      
      if (currentLaptopData) {
        try {
          const laptopData = JSON.parse(currentLaptopData);
          setDevices([laptopData]);
          setLastUpdated(new Date());
        } catch (err) {
          console.log('Error parsing laptop GPS data:', err);
        }
      }
    }, 5000);

    return () => {
      window.removeEventListener('storage', handleGPSData);
      clearInterval(pollInterval);
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Just refresh the data
    const currentPhoneData = localStorage.getItem('phoneGPSData');
    const currentLaptopData = localStorage.getItem('laptopGPSData');
    
    if (currentPhoneData) {
      try {
        const phoneData = JSON.parse(currentPhoneData);
        setDevices([phoneData]);
        setLastUpdated(new Date());
      } catch (err) {
        console.log('Error parsing phone GPS data:', err);
      }
    }
    
    if (currentLaptopData) {
      try {
        const laptopData = JSON.parse(currentLaptopData);
        setDevices([laptopData]);
        setLastUpdated(new Date());
      } catch (err) {
        console.log('Error parsing laptop GPS data:', err);
      }
    }
    
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  if (loading) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-slate-600 dark:text-slate-400">Loading GPS Tracker...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-slate-200/60 shadow-2xl shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
      {/* Header */}
      <CardHeader className="border-b border-slate-200/60 bg-gradient-to-r from-white to-slate-50/50 px-6 py-6 dark:border-b dark:border-white/5 dark:from-slate-800/30 dark:to-slate-700/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-green-100 rounded-lg dark:bg-green-500/20">
                <MapPin className="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="text-slate-900 font-bold text-lg dark:text-slate-100">
                  Safe GPS Tracker
                </CardTitle>
                <p className="text-slate-600 text-sm dark:text-slate-400">
                  GPS Monitoring (No Map - Safe Mode)
                </p>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700 transition-all duration-150"
            >
              <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
        
        {/* Last Updated */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${devices.length > 0 ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span>{devices.length} GPS device{devices.length !== 1 ? 's' : ''}</span>
          </div>
          <span>•</span>
          <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
          <span>•</span>
          <span>Safe Mode (No Map Loading)</span>
        </div>
      </CardHeader>
      
      {/* Content */}
      <CardContent className="p-6">
        <div className="text-center py-12">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <MapPin className="size-8 text-blue-600" />
            </div>
          </div>
          
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
            GPS Tracking Active
          </h3>
          
          {devices.length > 0 ? (
            <div className="space-y-4">
              {devices.map(device => (
                <div key={device.id} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                      {device.name}
                    </h4>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      device.status === 'online' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {device.status}
                    </span>
                  </div>
                  {device.position && (
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="font-medium">Coordinates:</span>
                          <div className="font-mono text-xs">
                            {device.position.latitude.toFixed(6)}, {device.position.longitude.toFixed(6)}
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">Speed:</span>
                          <div className="text-xs">
                            {device.position.speed.toFixed(1)} km/h
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">Direction:</span>
                          <div className="text-xs">
                            {device.position.course}°
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">Accuracy:</span>
                          <div className="text-xs">
                            {device.position.accuracy}m
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Last update: {new Date(device.lastUpdate || '').toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-500 dark:text-slate-400">
              <p>No GPS devices detected</p>
              <p className="text-sm mt-2">
                Start GPS tracking to see devices here
              </p>
            </div>
          )}
          
          <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <MapPin className="size-5" />
              <div>
                <h4 className="font-semibold">Safe Mode Active</h4>
                <p className="text-sm">Map loading disabled to prevent freezes</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
