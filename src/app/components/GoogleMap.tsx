import { useEffect, useState, useRef } from 'react';
import { fetchTraccarDevices, fetchTraccarPositions, type TraccarDevice, type TraccarPosition } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { MapPin, Gauge, Navigation, AlertCircle } from 'lucide-react';

interface DeviceWithPosition extends TraccarDevice {
  position?: TraccarPosition;
}

declare global {
  interface Window {
    google: any;
  }
}

export function GoogleMap() {
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  // Load Google Maps API
  useEffect(() => {
    const loadGoogleMaps = () => {
      if (window.google && window.google.maps) {
        console.log('[GoogleMap] Google Maps already loaded');
        return;
      }

      console.log('[GoogleMap] Loading Google Maps API...');
      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyBtSaPx_nSjC_2kL_3xQeTmF8M4vQ9yW7E&callback=initMap';
      script.id = 'google-maps-script';
      
      // Define the callback function
      (window as any).initMap = () => {
        console.log('[GoogleMap] Google Maps API loaded successfully');
        initializeMap();
      };
      
      document.head.appendChild(script);
    };

    const initializeMap = () => {
      if (!mapRef.current || !window.google || !window.google.maps) return;

      console.log('[GoogleMap] Initializing map...');
      
      const mapOptions: google.maps.MapOptions = {
        center: { lat: 12.8797, lng: 121.7740 }, // Philippines center
        zoom: 6,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
          }
        ]
      };

      mapInstanceRef.current = new google.maps.Map(mapRef.current, mapOptions);
      console.log('[GoogleMap] Map initialized successfully!');
    };

    loadGoogleMaps();
  }, []);

  // Fetch devices and positions on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const [devicesData, positionsData] = await Promise.all([
          fetchTraccarDevices(),
          fetchTraccarPositions(),
        ]);
        
        // Merge devices with their latest positions
        const merged = devicesData.map(device => {
          const position = positionsData.find(p => p.deviceId === device.id);
          return { ...device, position };
        });
        
        setDevices(merged);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load GPS data');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Update markers when devices change
  useEffect(() => {
    if (!mapInstanceRef.current || loading) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Add markers for devices with positions
    const devicesWithPositions = devices.filter(d => d.position);
    
    if (devicesWithPositions.length > 0) {
      const bounds = new google.maps.LatLngBounds();

      devicesWithPositions.forEach(device => {
        const pos = device.position!;
        const status = device.status || 'offline';
        
        // Create custom marker icon
        const markerIcon = {
          url: status === 'online' 
            ? 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiMxMGI5ODEiLz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSI4IiB5PSI4Ij4KPHBhdGggZD0iTTggMTZDMTIuNDE4MiAxNiAxNiAxMi40MTgyIDE2IDhDMTYgMy41ODE4IDEyLjQxODIgMCA4IDBDMy41ODE4IDAgMCAzLjU4MTggMCA4QzAgMTIuNDE4MiAzLjU4MTggMTYgOCAxNloiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik04IDlMMTAuNSA2LjVMMTIuNSA4LjVMMTEgMTBMMTMgMTJMMTEuNSAxMy41TDkgMTFMNi41IDEzLjVMNSAxMkwzIDlMNS41IDYuNUw0IDVMNi41IDNMOCA5WiIgZmlsbD0iIzEwYjk4MSIvPgo8L3N2Zz4KPC9zdmc+'
            : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiM2YjcyODAiLz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSI4IiB5PSI4Ij4KPHBhdGggZD0iTTggMTZDMTIuNDE4MiAxNiAxNiAxMi40MTgyIDE2IDhDMTYgMy41ODE4IDEyLjQxODIgMCA4IDBDMy41ODE4IDAgMCAzLjU4MTggMCA4QzAgMTIuNDE4MiAzLjU4MTggMTYgOCAxNloiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik04IDlMMTAuNSA2LjVMMTIuNSA4LjVMMTEgMTBMMTMgMTJMMTEuNSAxMy41TDkgMTFMNi41IDEzLjVMNSAxMkwzIDlMNS41IDYuNUw0IDVMNi41IDNMOCA5WiIgZmlsbD0iIzZiNzI4MCIvPgo8L3N2Zz4KPC9zdmc+',
          scaledSize: new google.maps.Size(32, 32),
          anchor: new google.maps.Point(16, 16),
        };

        const marker = new google.maps.Marker({
          position: { lat: pos.latitude, lng: pos.longitude },
          map: mapInstanceRef.current,
          title: device.name,
          icon: markerIcon,
        });

        // Create info window
        const speedKmh = (pos.speed * 1.852).toFixed(1);
        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="min-width: 200px; font-family: Arial, sans-serif;">
              <div style="font-weight: bold; margin-bottom: 8px; color: #333;">${device.name}</div>
              <div style="font-size: 12px; color: #666;">
                <div>Status: <span style="color: ${status === 'online' ? '#10b981' : '#6b7280'}; font-weight: bold;">${status}</span></div>
                <div>Speed: ${speedKmh} km/h</div>
                <div>Course: ${pos.course}°</div>
                <div>Position: ${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}</div>
                <div style="margin-top: 8px; font-size: 10px; color: #999;">
                  ${new Date(pos.fixTime).toLocaleString()}
                </div>
              </div>
            </div>
          `,
        });

        marker.addListener('click', () => {
          infoWindow.open(mapInstanceRef.current!, marker);
        });

        markersRef.current.push(marker);
        bounds.extend({ lat: pos.latitude, lng: pos.longitude });
      });

      // Fit map to show all markers
      if (!bounds.isEmpty()) {
        mapInstanceRef.current.fitBounds(bounds);
      }
    }
  }, [devices, loading]);

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
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-6">
          <div className="flex items-start gap-3 text-red-600">
            <AlertCircle className="size-5 mt-0.5" />
            <div>
              <div className="font-semibold">GPS Connection Error</div>
              <div className="text-sm text-red-500 mt-1">{error}</div>
              <div className="text-xs text-slate-500 mt-2">
                Make sure Traccar server is running on http://localhost:8082
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (devices.length === 0) {
    return (
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-6 text-center text-slate-500">
          <MapPin className="size-12 mx-auto mb-3 text-slate-300" />
          <div className="font-medium">No GPS devices registered</div>
          <div className="text-sm mt-1">Add devices in Traccar to see them here</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <CardTitle className="flex items-center gap-2 text-slate-900 font-semibold">
          <MapPin className="size-5 text-slate-600" />
          Live GPS Tracking ({devices.length} devices)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[500px] relative">
          <div ref={mapRef} className="w-full h-full" />
        </div>
        
        {/* Device list below map */}
        <div className="border-t border-slate-100 p-4 bg-slate-50/50">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
            Tracked Devices
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {devices.map(device => (
              <div
                key={device.id}
                className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 text-sm"
              >
                <div className={`size-2 rounded-full ${
                  device.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                }`} />
                <span className="font-medium text-slate-900 truncate flex-1">{device.name}</span>
                {device.position && (
                  <span className="text-xs text-slate-500">
                    {((device.position.speed * 1.852)).toFixed(0)} km/h
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
