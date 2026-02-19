import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { MapPin, AlertCircle, Navigation, Gauge, RefreshCw, Plus, Filter, Settings, Wifi, WifiOff } from 'lucide-react';

// Define types locally instead of importing from Traccar
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

export function LiveVehicleMap() {
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Real GPS tracking with phone receiver
  useEffect(() => {
    const loadMockData = () => {
      const mockDevices = [
        {
          id: 1,
          name: 'Delivery Truck 001',
          uniqueId: 'TRUCK001',
          status: 'online',
          lastUpdate: new Date().toISOString(),
          positionId: 1,
          category: 'truck',
          position: {
            id: 1,
            deviceId: 1,
            latitude: 14.5995,
            longitude: 120.9842,
            speed: 45.2,
            course: 90,
            altitude: 15,
            accuracy: 5,
            fixTime: new Date().toISOString(),
            deviceTime: new Date().toISOString(),
            serverTime: new Date().toISOString(),
            attributes: {}
          }
        }
      ];

      setDevices(mockDevices);
      setLastUpdated(new Date());
      setLoading(false);
      setError(null);
    };

    setLoading(true);
    setError(null);

    // Listen for GPS data from both devices via localStorage
    const handleGPSData = (e: StorageEvent) => {
      if ((e.key === 'phoneGPSData' || e.key === 'laptopGPSData') && e.newValue) {
        try {
          const gpsData = JSON.parse(e.newValue);
          console.log('Received GPS data:', e.key, gpsData);
          
          // Add mock vehicles and GPS device
          const mockDevices = [
            {
              id: 1,
              name: 'Delivery Truck 001',
              uniqueId: 'TRUCK001',
              status: 'online',
              lastUpdate: new Date().toISOString(),
              positionId: 1,
              category: 'truck',
              position: {
                id: 1,
                deviceId: 1,
                latitude: 14.5995,
                longitude: 120.9842,
                speed: 45.2,
                course: 90,
                altitude: 15,
                accuracy: 5,
                fixTime: new Date().toISOString(),
                deviceTime: new Date().toISOString(),
                serverTime: new Date().toISOString(),
                attributes: {}
              }
          }
          ];

          setDevices([gpsData, ...mockDevices]);
          setLastUpdated(new Date());
          setLoading(false);
          setError(null);
        } catch (err) {
          console.log('Error parsing GPS data:', err);
        }
      }
    };

    // Add event listener for GPS data
    window.addEventListener('storage', handleGPSData);

    // Add polling mechanism to check for GPS data updates
    let lastGPSData = {
      phone: localStorage.getItem('phoneGPSData'),
      laptop: localStorage.getItem('laptopGPSData')
    };

    const checkGPSData = () => {
      const currentPhoneData = localStorage.getItem('phoneGPSData');
      const currentLaptopData = localStorage.getItem('laptopGPSData');
      
      // Check if phone GPS data changed
      if (currentPhoneData !== lastGPSData.phone && currentPhoneData) {
        try {
          const phoneData = JSON.parse(currentPhoneData);
          console.log('Phone GPS data updated:', phoneData);
          const storageEvent = {
            key: 'phoneGPSData',
            newValue: currentPhoneData,
            oldValue: lastGPSData.phone,
            storageArea: localStorage,
            url: window.location.href
          } as StorageEvent;
          handleGPSData(storageEvent);
          lastGPSData.phone = currentPhoneData;
        } catch (err) {
          console.log('Error parsing phone GPS data:', err);
        }
      }
      
      // Check if laptop GPS data changed
      if (currentLaptopData !== lastGPSData.laptop && currentLaptopData) {
        try {
          const laptopData = JSON.parse(currentLaptopData);
          console.log('Laptop GPS data updated:', laptopData);
          const storageEvent = {
            key: 'laptopGPSData',
            newValue: currentLaptopData,
            oldValue: lastGPSData.laptop,
            storageArea: localStorage,
            url: window.location.href
          } as StorageEvent;
          handleGPSData(storageEvent);
          lastGPSData.laptop = currentLaptopData;
        } catch (err) {
          console.log('Error parsing laptop GPS data:', err);
        }
      }
    };

    // Check for existing GPS data
    const existingPhoneData = localStorage.getItem('phoneGPSData');
    const existingLaptopData = localStorage.getItem('laptopGPSData');
    
    if (existingPhoneData) {
      try {
        const phoneData = JSON.parse(existingPhoneData);
        console.log('Received phone GPS data:', phoneData);
        const storageEvent = {
          key: 'phoneGPSData',
          newValue: existingPhoneData,
          oldValue: null,
          storageArea: localStorage,
          url: window.location.href
        } as StorageEvent;
        handleGPSData(storageEvent);
        lastGPSData.phone = existingPhoneData;
      } catch (err) {
        console.log('Error parsing phone GPS data:', err);
      }
    }
    
    if (existingLaptopData) {
      try {
        const laptopData = JSON.parse(existingLaptopData);
        console.log('Received laptop GPS data:', laptopData);
        const storageEvent = {
          key: 'laptopGPSData',
          newValue: existingLaptopData,
          oldValue: null,
          storageArea: localStorage,
          url: window.location.href
        } as StorageEvent;
        handleGPSData(storageEvent);
        lastGPSData.laptop = existingLaptopData;
      } catch (err) {
        console.log('Error parsing laptop GPS data:', err);
      }
    }
    
    if (!existingPhoneData && !existingLaptopData) {
      // Fall back to mock data if no GPS data
      loadMockData();
    }

    // Start polling for GPS data updates every 2 seconds
    const pollInterval = setInterval(checkGPSData, 2000);

    return () => {
      window.removeEventListener('storage', handleGPSData);
      clearInterval(pollInterval);
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Just trigger a reload of current GPS data
    window.location.reload();
  };

  // Update map with vehicle positions
  useEffect(() => {
    if (!mapRef.current) return;

    const mapContainer = mapRef.current;
    const devicesWithPositions = devices.filter(d => d.position);
    
    // Create dynamic map with vehicle positions
    const updateMap = () => {
      if (devicesWithPositions.length === 0) {
        // Show simple placeholder when no vehicles
        mapContainer.innerHTML = `
          <div style="width: 100%; height: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; text-align: center;">
            <div>
              <div style="font-size: 48px; margin-bottom: 16px;">🗺️</div>
              <div style="font-size: 20px; font-weight: bold; margin-bottom: 8px;">GPS Map Loading</div>
              <div style="font-size: 14px; opacity: 0.8;">Waiting for device connections...</div>
            </div>
          </div>
        `;
      } else {
        // Create map centered on vehicles with markers
        const lats = devicesWithPositions.map(d => d.position!.latitude);
        const lngs = devicesWithPositions.map(d => d.position!.longitude);
        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
        
        // Calculate bounds for map view
        const latDiff = Math.max(...lats) - Math.min(...lats) || 0.1;
        const lngDiff = Math.max(...lngs) - Math.min(...lngs) || 0.1;
        const bbox = `${centerLng - lngDiff/2},${centerLat - latDiff/2},${centerLng + lngDiff/2},${centerLat + latDiff/2}`;
        
        mapContainer.innerHTML = `
          <div style="width: 100%; height: 100%; position: relative;">
            <iframe 
              src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${centerLat},${centerLng}" 
              style="width: 100%; height: 100%; border: 0;"
              title="Live Vehicle Map"
            />
            
            <!-- Vehicle Markers Overlay -->
            ${devicesWithPositions.map((device, index) => {
              const pos = device.position!;
              const speed = (pos.speed * 1.852).toFixed(1);
              const isMoving = pos.speed > 0;
              const statusColor = device.status === 'online' ? '#10b981' : '#6b7280';
              const movementColor = isMoving ? '#f59e0b' : '#3b82f6';
              
              return `
                <div style="
                  position: absolute; 
                  top: ${20 + index * 60}px; 
                  left: 20px; 
                  background: white; 
                  padding: 8px 12px; 
                  border-radius: 8px; 
                  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                  border-left: 4px solid ${statusColor};
                  z-index: 1000;
                ">
                  <div style="font-weight: bold; color: #333; font-size: 14px; margin-bottom: 4px;">
                    🚛 ${device.name}
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px; font-size: 12px;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                      <div style="width: 8px; height: 8px; border-radius: 50%; background: ${movementColor};"></div>
                      <span style="color: ${movementColor};">
                        ${isMoving ? 'Moving' : 'Stopped'}
                      </span>
                    </div>
                    <span style="color: #666;">${speed} km/h</span>
                  </div>
                  <div style="font-size: 11px; color: #999; margin-top: 2px;">
                    📍 ${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}
                  </div>
                  <div style="font-size: 11px; color: #999;">
                    🧭 ${pos.course}° | ⏰ ${new Date(pos.fixTime).toLocaleTimeString()}
                  </div>
                </div>
              `;
            }).join('')}
            
            <!-- Map Info -->
            <div style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.9); padding: 8px 12px; border-radius: 6px; font-size: 11px; z-index: 1000;">
              <div style="font-weight: bold; color: #333;">Live Vehicle Tracking</div>
              <div style="color: #10b981;">● ${devicesWithPositions.length} Active</div>
              <div style="color: #666;">Updates every 5 seconds</div>
            </div>
          </div>
        `;
      }
    };

    updateMap();
  }, [devices]);

  if (loading) {
    return (
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
            <span className="text-sm font-medium text-slate-500">Loading GPS data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
        <CardContent className="p-6">
          <div className="flex items-start gap-3 text-amber-600">
            <MapPin className="size-5 mt-0.5" />
            <div>
              <div className="font-semibold">GPS Status</div>
              <div className="text-sm text-amber-500 mt-1">{error}</div>
              <div className="text-xs text-slate-500 mt-2">
                Please allow location permissions and refresh the page.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-slate-200/60 shadow-2xl shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
      {/* Enhanced Header */}
      <CardHeader className="border-b border-slate-200/60 bg-gradient-to-r from-white to-slate-50/50 px-6 py-6 dark:border-b dark:border-white/5 dark:from-slate-800/30 dark:to-slate-700/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-500/20">
                <MapPin className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-slate-900 font-bold text-lg dark:text-slate-100">
                  Live Vehicle Tracking
                </CardTitle>
                <p className="text-slate-600 text-sm dark:text-slate-400">
                  Real-time GPS Monitoring
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
            
            <Button
              variant="outline"
              size="sm"
              className="border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700 transition-all duration-150"
            >
              <Filter className="size-4" />
              Filter
            </Button>
            
            <Button
              size="sm"
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 border border-blue-500/20 transition-all duration-150"
            >
              <Plus className="size-4" />
              Add Device
            </Button>
          </div>
        </div>
        
        {/* Last Updated */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${devices.filter(d => d.position).length > 0 ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span>{devices.filter(d => d.position).length} active</span>
          </div>
          <span>•</span>
          <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {/* Enhanced Map Container */}
        <div className="relative">
          {/* Gradient Overlay for Header Contrast */}
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-white/80 to-transparent dark:from-slate-800/50 dark:to-transparent pointer-events-none z-10"></div>
          
          {/* Live Map */}
          <div className="h-[600px] relative">
            <div 
              ref={mapRef} 
              className="w-full h-full"
              style={{ minHeight: '600px' }}
            />
          </div>
        </div>
        
        {/* Enhanced Vehicle Details */}
        <div className="border-t border-slate-200/60 p-6 bg-gradient-to-b from-slate-50/50 to-white dark:border-t dark:border-white/5 dark:from-slate-700/30 dark:to-slate-800/50">
          <div className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-4 dark:text-slate-400">
            Tracked Devices
          </div>
          {devices.filter(d => d.position).length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
                <WifiOff className="size-6 text-slate-400 dark:text-slate-500" />
              </div>
              <div className="font-semibold text-lg text-slate-700 dark:text-slate-300 mb-2">No Active Devices</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Configure your GPS devices to see real-time tracking information
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {devices.filter(d => d.position).map(device => (
                <div
                  key={device.id}
                  className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200/60 dark:border-white/10 shadow-sm hover:shadow-md hover:shadow-slate-900/10 dark:hover:shadow-black/20 transition-all duration-150 hover:-translate-y-1"
                >
                  <div className={`size-3 rounded-full ${
                    device.status === 'online' ? 'bg-green-500 shadow-green-500/50' : 'bg-gray-400 shadow-gray-400/50'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{device.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">{device.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {((device.position!.speed * 1.852)).toFixed(0)} km/h
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {device.status === 'online' ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
