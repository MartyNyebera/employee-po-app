import { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { MapPin, Navigation, RefreshCw, Wifi, WifiOff } from 'lucide-react';

// Fix for default marker icons in Leaflet with Webpack/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Mobile GPS data interface
interface MobileGPSData {
  deviceId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
  status: 'Moving' | 'Idle' | 'Offline';
}

export function LegacyLiveMap() {
  const [devices, setDevices] = useState<MobileGPSData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapRef.current) return;

    try {
      // Initialize map
      const map = L.map(mapRef.current).setView([14.5995, 120.9842], 13); // Default to Manila

      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      console.log('[LegacyLiveMap] Leaflet map initialized successfully');
    } catch (err) {
      console.error('[LegacyLiveMap] Failed to initialize map:', err);
      setError('Failed to initialize map');
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Fetch mobile GPS data
  const fetchMobileGPSData = async () => {
    try {
      // First try to fetch from mobile GPS API
      let mobileDevices: MobileGPSData[] = [];
      
      try {
        const response = await fetch('/api/mobile/gps');
        if (response.ok) {
          const data = await response.json();
          mobileDevices = data.devices.map((device: any) => ({
            deviceId: device.deviceId,
            lat: device.lat,
            lng: device.lng,
            accuracy: device.accuracy || null,
            speed: device.speed || null,
            heading: device.heading || null,
            timestamp: device.timestamp,
            status: device.status || 'Idle'
          }));
          console.log('[LegacyLiveMap] Fetched from API:', mobileDevices.length, 'devices');
        }
      } catch (apiError) {
        console.warn('[LegacyLiveMap] API fetch failed, falling back to localStorage:', apiError);
        
        // Fallback to localStorage for mobile GPS data (from tracker.html)
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('gpsData_')) {
            try {
              const gpsData = JSON.parse(localStorage.getItem(key) || '{}');
              const deviceId = key.replace('gpsData_', '');
              
              // Determine status based on speed and timestamp
              const now = Date.now();
              const age = now - gpsData.timestamp;
              const isOffline = age > 60000; // Offline if more than 1 minute old
              const isMoving = (gpsData.speed || 0) > 5; // Moving if speed > 5 km/h
              
              mobileDevices.push({
                deviceId,
                lat: gpsData.lat,
                lng: gpsData.lng,
                accuracy: gpsData.accuracy || null,
                speed: gpsData.speed || null,
                heading: gpsData.heading || null,
                timestamp: gpsData.timestamp,
                status: isOffline ? 'Offline' : (isMoving ? 'Moving' : 'Idle')
              });
            } catch (e) {
              console.warn('Invalid GPS data for key:', key, e);
            }
          }
        }
      }

      setDevices(mobileDevices);
      setLastUpdate(new Date());
      setIsConnected(mobileDevices.length > 0);
      setError(null);
      
      // Update map markers
      updateMapMarkers(mobileDevices);
      
    } catch (err) {
      console.error('[LegacyLiveMap] Error fetching GPS data:', err);
      setError('Failed to fetch GPS data');
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  // Update map markers
  const updateMapMarkers = (mobileDevices: MobileGPSData[]) => {
    if (!mapInstanceRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add new markers
    mobileDevices.forEach(device => {
      const statusColor = device.status === 'Moving' ? '#22c55e' : 
                         device.status === 'Idle' ? '#f59e0b' : '#ef4444';
      
      const customIcon = L.divIcon({
        html: `
          <div style="
            background: ${statusColor};
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          "></div>
        `,
        className: 'custom-marker',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      const marker = L.marker([device.lat, device.lng], { icon: customIcon })
        .addTo(mapInstanceRef.current!)
        .bindPopup(`
          <div style="min-width: 200px;">
            <strong>📱 ${device.deviceId}</strong><br>
            Status: <span style="color: ${statusColor}">${device.status}</span><br>
            Lat: ${device.lat.toFixed(6)}<br>
            Lng: ${device.lng.toFixed(6)}<br>
            ${device.speed ? `Speed: ${device.speed.toFixed(1)} km/h<br>` : ''}
            ${device.heading ? `Heading: ${device.heading.toFixed(0)}°<br>` : ''}
            Last seen: ${new Date(device.timestamp).toLocaleString()}
          </div>
        `);

      markersRef.current.push(marker);
    });

    // Fit map to show all devices
    if (mobileDevices.length > 0) {
      const bounds = L.latLngBounds(mobileDevices.map(d => [d.lat, d.lng]));
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  // Start polling for GPS data
  useEffect(() => {
    fetchMobileGPSData(); // Initial fetch
    
    // Poll every 2 seconds
    pollingIntervalRef.current = setInterval(fetchMobileGPSData, 15000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Listen for storage events (when tracker.html updates GPS data)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('gpsData_') && e.newValue) {
        fetchMobileGPSData(); // Refresh when GPS data changes
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    fetchMobileGPSData();
  };

  if (loading) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-slate-600 dark:text-slate-400">Loading Legacy Live Map...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
        <CardContent className="p-6">
          <div className="flex items-start gap-3 text-red-600">
            <MapPin className="size-5 mt-0.5" />
            <div>
              <div className="font-semibold">Map Error</div>
              <div className="text-sm text-red-500 mt-1">{error}</div>
              <Button onClick={handleRefresh} className="mt-2" size="sm">
                <RefreshCw className="size-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
      <CardHeader className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 ${isConnected ? 'bg-green-100 dark:bg-green-500/20' : 'bg-red-100 dark:bg-red-500/20'} rounded-lg`}>
              {isConnected ? (
                <Wifi className="size-5 text-green-600 dark:text-green-400" />
              ) : (
                <WifiOff className="size-5 text-red-600 dark:text-red-400" />
              )}
            </div>
            <div>
              <CardTitle className="text-slate-900 font-bold text-lg dark:text-slate-100">
                🗺️ Legacy Live Map
              </CardTitle>
              <p className="text-slate-600 text-sm dark:text-slate-400">
                Mobile GPS Tracking (Leaflet)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right mr-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {devices.length} Device{devices.length !== 1 ? 's' : ''}
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500">
                Last: {lastUpdate.toLocaleTimeString()}
              </div>
            </div>
            <Button onClick={handleRefresh} size="sm" variant="outline">
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {/* Leaflet Map Container */}
        <div className="relative">
          <div 
            ref={mapRef} 
            className="w-full h-[600px] bg-slate-100 dark:bg-slate-800"
            style={{ minHeight: '600px' }}
          />
          
          {/* Status Overlay */}
          <div className="absolute top-4 left-4 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-slate-200 dark:border-slate-600">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Mobile GPS Status
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {isConnected ? (
                <span className="text-green-600">● Connected</span>
              ) : (
                <span className="text-red-600">● No devices</span>
              )}
            </div>
          </div>
          
          {/* Device List */}
          {devices.length > 0 && (
            <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-slate-200 dark:border-slate-600 max-w-xs">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
                Active Devices
              </div>
              <div className="space-y-1">
                {devices.map(device => (
                  <div key={device.deviceId} className="text-xs text-slate-600 dark:text-slate-400">
                    <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                      device.status === 'Moving' ? 'bg-green-500' :
                      device.status === 'Idle' ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></span>
                    📱 {device.deviceId} - {device.status}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
