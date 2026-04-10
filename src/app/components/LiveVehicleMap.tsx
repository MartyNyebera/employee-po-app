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
  const [mapInitialized, setMapInitialized] = useState(false);

  // Real GPS tracking from server API
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const fetchDriverLocations = async () => {
      try {
        // Add timeout to prevent infinite loading
        timeoutId = setTimeout(() => {
          setLoading(false);
          setError('GPS data loading timeout. Please refresh.');
        }, 10000);

        setLoading(true);
        setError(null);
        
        // Fetch live driver locations from server
        console.log('Fetching driver locations from server...');
        const response = await fetch('/api/driver/locations/live');
        console.log('Response status:', response.status);
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error('Failed to fetch driver locations');
        }
        
        const driverLocations = await response.json();
        console.log('Driver locations from server:', driverLocations);
        
        // Convert driver locations to device format
        const devices: DeviceWithPosition[] = driverLocations.map((driver: any, index: number) => {
          const lat = parseFloat(driver.latitude);
          const lng = parseFloat(driver.longitude);
          
          return {
            id: driver.driver_id,
            name: driver.driver_name || `Driver ${driver.driver_id}`,
            uniqueId: `DRIVER${driver.driver_id}`,
            status: 'online',
            lastUpdate: new Date().toISOString(),
            positionId: index + 1,
            category: 'driver',
            position: {
              id: index + 1,
              deviceId: driver.driver_id,
              latitude: lat,
              longitude: lng,
              speed: driver.speed || 0, // Use actual GPS speed
              course: driver.heading || 0, // Use actual GPS heading
              altitude: 0,
              accuracy: driver.accuracy || 10,
              fixTime: driver.timestamp || new Date().toISOString(),
              deviceTime: driver.timestamp || new Date().toISOString(),
              serverTime: new Date().toISOString(),
              attributes: {}
            }
          };
        });
        
        // Add mock delivery truck if no drivers
        if (devices.length === 0) {
          const mockDevice = {
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
          };
          devices.push(mockDevice);
        }
        
        setDevices(devices);
        setLastUpdated(new Date());
        setLoading(false);
        
      } catch (err) {
        console.error('Error fetching driver locations:', err);
        
        // Clear timeout on error
        clearTimeout(timeoutId);
        
        // Fall back to mock data on error
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
        setError('Unable to connect to GPS server. Showing mock data.');
      }
    };

    // Initial fetch
    fetchDriverLocations();
    
    // Poll for updates every 5 seconds for more real-time feel
    const pollInterval = setInterval(fetchDriverLocations, 5000);

    return () => {
      clearInterval(pollInterval);
    };
  }, []);

  // Helper functions for distance and bearing calculations
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  };

  const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

    const θ = Math.atan2(y, x);
    const bearing = (θ * 180 / Math.PI + 360) % 360;

    return bearing;
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Fetch live driver locations from server
      const response = await fetch('/api/driver/locations/live');
      if (!response.ok) {
        throw new Error('Failed to fetch driver locations');
      }
      
      const driverLocations = await response.json();
      console.log('Driver locations from server:', driverLocations);
      
      // Convert driver locations to device format
      const devices: DeviceWithPosition[] = driverLocations.map((driver: any, index: number) => ({
        id: driver.driver_id,
        name: driver.driver_name || `Driver ${driver.driver_id}`,
        uniqueId: `DRIVER${driver.driver_id}`,
        status: 'online',
        lastUpdate: new Date().toISOString(),
        positionId: index + 1,
        category: 'driver',
        position: {
          id: index + 1,
          deviceId: driver.driver_id,
          latitude: parseFloat(driver.latitude),
          longitude: parseFloat(driver.longitude),
          speed: 0,
          course: 0,
          altitude: 0,
          accuracy: 10,
          fixTime: new Date().toISOString(),
          deviceTime: new Date().toISOString(),
          serverTime: new Date().toISOString(),
          attributes: {}
        }
      }));
      
      // Add mock delivery truck if no drivers
      if (devices.length === 0) {
        const mockDevice = {
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
        };
        devices.push(mockDevice);
      }
      
      setDevices(devices);
      setLastUpdated(new Date());
      setError(null);
      
    } catch (err) {
      console.error('Error refreshing driver locations:', err);
      setError('Failed to refresh GPS data.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Update map with vehicle positions
  useEffect(() => {
    if (!mapRef.current) return;

    const mapContainer = mapRef.current;
    const devicesWithPositions = devices.filter(d => d.position);
    
    // Create dynamic map with animated vehicle positions
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
        // Create map centered on vehicles with animated markers
        const lats = devicesWithPositions.map(d => d.position!.latitude);
        const lngs = devicesWithPositions.map(d => d.position!.longitude);
        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
        
        // Calculate bounds for map view with better defaults
        const latDiff = Math.max(...lats) - Math.min(...lats) || 0.01; // Reduced from 0.1 to 0.01
        const lngDiff = Math.max(...lngs) - Math.min(...lngs) || 0.01; // Reduced from 0.1 to 0.01
        const bbox = `${centerLng - lngDiff/2},${centerLat - latDiff/2},${centerLng + lngDiff/2},${centerLat + latDiff/2}`;
        
        // Calculate relative positions for vehicle markers on map
        const mapWidth = 100; // percentage
        const mapHeight = 100; // percentage
        const vehicleMarkers = devicesWithPositions.map((device, index) => {
          const pos = device.position!;
          const speed = (pos.speed * 1.852).toFixed(1);
          const isMoving = pos.speed > 0;
          const statusColor = device.status === 'online' ? '#10b981' : '#6b7280';
          const movementColor = isMoving ? '#f59e0b' : '#3b82f6';
          
          // Calculate relative position on map (0-100%)
          const relX = ((pos.longitude - centerLng) / lngDiff + 0.5) * mapWidth;
          const relY = ((centerLat - pos.latitude) / latDiff + 0.5) * mapHeight;
          
          // Get vehicle icon based on category and movement
          const vehicleIcon = device.category === 'driver' ? '🚗' : '🚛';
          const rotationAngle = pos.course || 0;
          
          return `
            <!-- Animated Vehicle Marker -->
            <div style="
              position: absolute;
              left: ${Math.max(5, Math.min(95, relX))}%;
              top: ${Math.max(5, Math.min(95, relY))}%;
              transform: translate(-50%, -50%) rotate(${rotationAngle}deg);
              z-index: 1000;
              transition: all 2s ease-in-out;
            ">
              <!-- Vehicle Icon with Animation -->
              <div style="
                font-size: 24px;
                text-shadow: 0 2px 4px rgba(0,0,0,0.3);
                animation: ${isMoving ? 'vehicleMove 1s infinite alternate' : 'vehiclePulse 2s infinite'};
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
              ">
                ${vehicleIcon}
              </div>
              
              <!-- Status Badge -->
              <div style="
                position: absolute;
                top: -8px;
                right: -8px;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: ${statusColor};
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                animation: statusPulse 2s infinite;
              "></div>
              
              <!-- Direction Indicator -->
              ${isMoving ? `
                <div style="
                  position: absolute;
                  top: 50%;
                  left: 50%;
                  transform: translate(-50%, -50%);
                  width: 30px;
                  height: 30px;
                  border: 2px solid ${movementColor};
                  border-radius: 50%;
                  animation: directionRing 1.5s infinite;
                "></div>
              ` : ''}
            </div>
            
            <!-- Vehicle Info Popup -->
            <div style="
              position: absolute;
              left: ${Math.max(5, Math.min(95, relX))}%;
              top: ${Math.max(5, Math.min(95, relY + 8))}%;
              transform: translateX(-50%);
              background: white;
              padding: 6px 10px;
              border-radius: 6px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.2);
              font-size: 11px;
              white-space: nowrap;
              z-index: 999;
              opacity: 0.9;
              transition: all 0.3s ease;
            " onmouseover="this.style.opacity='1'; this.style.transform='translateX(-50%) scale(1.1)';" 
               onmouseout="this.style.opacity='0.9'; this.style.transform='translateX(-50%) scale(1)';">
              <div style="font-weight: bold; color: #333; margin-bottom: 2px;">
                ${device.name}
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <div style="display: flex; align-items: center; gap: 3px;">
                  <div style="width: 6px; height: 6px; border-radius: 50%; background: ${movementColor};"></div>
                  <span style="color: ${movementColor}; font-weight: 500;">
                    ${isMoving ? 'Moving' : 'Stopped'}
                  </span>
                </div>
                <span style="color: #666;">${speed} km/h</span>
              </div>
              <div style="color: #999; font-size: 10px;">
                🧭 ${pos.course}°
              </div>
            </div>
          `;
        }).join('');
        
        // Only reload iframe if map is not initialized yet
        if (!mapInitialized && mapContainer) {
          mapContainer.innerHTML = `
            <div style="width: 100%; height: 100%; position: relative;">
              <iframe 
                src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${centerLat},${centerLng}" 
                style="width: 100%; height: 100%; border: 0;"
                title="Live Vehicle Map"
              />
              
              <!-- Animated Vehicle Markers -->
              ${vehicleMarkers}
            
            <!-- Map Controls and Info -->
            <div style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.95); padding: 10px 14px; border-radius: 8px; font-size: 11px; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
              <div style="font-weight: bold; color: #333; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; animation: statusPulse 2s infinite;"></div>
                Live Vehicle Tracking
              </div>
              <div style="color: #10b981; font-weight: 500;">● ${devicesWithPositions.length} Active</div>
              <div style="color: #666;">Updates every 5 seconds</div>
              <div style="color: #999; font-size: 10px; margin-top: 4px;">
                Last: ${lastUpdated.toLocaleTimeString()}
              </div>
            </div>
            
            <!-- Speed Legend -->
            <div style="position: absolute; bottom: 10px; left: 10px; background: rgba(255,255,255,0.95); padding: 8px 12px; border-radius: 6px; font-size: 10px; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
              <div style="font-weight: bold; color: #333; margin-bottom: 4px;">Speed Status</div>
              <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                <div style="width: 6px; height: 6px; border-radius: 50%; background: #f59e0b;"></div>
                <span>Moving (>0 km/h)</span>
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <div style="width: 6px; height: 6px; border-radius: 50%; background: #3b82f6;"></div>
                <span>Stopped (0 km/h)</span>
              </div>
            </div>
            
            <!-- CSS Animations -->
            <style>
              @keyframes vehicleMove {
                0% { transform: translate(-50%, -50%) rotate(var(--rotation)) scale(1); }
                100% { transform: translate(-50%, -50%) rotate(var(--rotation)) scale(1.1); }
              }
              @keyframes vehiclePulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
              }
              @keyframes statusPulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.2); opacity: 0.8; }
              }
              @keyframes directionRing {
                0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
              }
            </style>
          </div>
          `;
          setMapInitialized(true);
        } else if (mapContainer) {
          // Only update markers if map is already initialized
          const markersContainer = mapContainer.querySelector('[style*="position: absolute"]');
          if (markersContainer) {
            markersContainer.innerHTML = vehicleMarkers;
          }
        }
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
