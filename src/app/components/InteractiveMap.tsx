import { useEffect, useState, useRef } from 'react';
import { fetchTraccarDevices, fetchTraccarPositions, type TraccarDevice, type TraccarPosition } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { MapPin, AlertCircle, ZoomIn, ZoomOut } from 'lucide-react';

interface DeviceWithPosition extends TraccarDevice {
  position?: TraccarPosition;
}

export function InteractiveMap() {
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(6);
  const [center, setCenter] = useState({ lat: 12.8797, lng: 121.7740 });
  const mapRef = useRef<HTMLDivElement>(null);

  // Fetch devices and positions
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const [devicesData, positionsData] = await Promise.all([
          fetchTraccarDevices(),
          fetchTraccarPositions(),
        ]);
        
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
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Initialize interactive map
  useEffect(() => {
    if (!mapRef.current || loading) return;

    const mapContainer = mapRef.current;
    
    // Create map container with tiles
    const initializeMap = () => {
      const mapHtml = `
        <div style="width: 100%; height: 100%; position: relative; overflow: hidden;">
          <!-- Map Tiles -->
          <div id="map-tiles" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0;">
            <!-- OpenStreetMap tiles will be loaded here -->
          </div>
          
          <!-- Map Controls -->
          <div style="position: absolute; top: 10px; right: 10px; z-index: 1000;">
            <button onclick="window.zoomIn()" style="background: white; border: 1px solid #ccc; padding: 8px; cursor: pointer; border-radius: 4px; display: block; margin-bottom: 2px;">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 4v4H4v4h4v4h4v-4h4V8h-4V4H8z"/>
              </svg>
            </button>
            <button onclick="window.zoomOut()" style="background: white; border: 1px solid #ccc; padding: 8px; cursor: pointer; border-radius: 4px;">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M4 8h8v1H4V8z"/>
              </svg>
            </button>
          </div>
          
          <!-- Vehicle Markers -->
          <div id="vehicle-markers" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; pointer-events: none;">
            ${devices.filter(d => d.position).map(device => `
              <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: auto;">
                <div style="background: ${device.status === 'online' ? '#10b981' : '#6b7280'}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); cursor: pointer;">
                  🚛 ${device.name}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
      mapContainer.innerHTML = mapHtml;
      
      // Load map tiles
      loadMapTiles();
      
      // Add zoom controls
      (window as any).zoomIn = () => setZoom(prev => Math.min(prev + 1, 18));
      (window as any).zoomOut = () => setZoom(prev => Math.max(prev - 1, 1));
    };

    const loadMapTiles = () => {
      const tilesContainer = mapContainer.querySelector('#map-tiles');
      if (!tilesContainer) return;
      
      // Calculate tile coordinates
      const tileUrl = `https://tile.openstreetmap.org/${zoom}/${Math.floor((center.lng + 180) / 360 * Math.pow(2, zoom))}/${Math.floor((1 - Math.log(Math.tan(Math.PI / 4 + center.lat * Math.PI / 180) / 2) / Math.PI / 2) * Math.pow(2, zoom))}.png`;
      
      tilesContainer.innerHTML = `
        <img src="${tileUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
        <div style="position: absolute; bottom: 10px; left: 10px; background: rgba(255,255,255,0.9); padding: 4px 8px; border-radius: 4px; font-size: 11px; z-index: 1000;">
          © OpenStreetMap contributors
        </div>
      `;
    };

    initializeMap();
  }, [devices, loading, zoom, center]);

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
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <CardTitle className="flex items-center gap-2 text-slate-900 font-semibold">
          <MapPin className="size-5 text-slate-600" />
          Interactive GPS Map ({devices.length} devices)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Interactive Map Container */}
        <div className="h-[500px] relative">
          <div 
            ref={mapRef} 
            className="w-full h-full"
            style={{ minHeight: '500px' }}
          />
        </div>
        
        {/* Map Info Bar */}
        <div className="absolute top-4 left-4 bg-white rounded-lg p-3 shadow-lg z-10">
          <div className="text-xs font-semibold text-gray-700">Philippines GPS Tracking</div>
          <div className="text-xs text-green-600">● Live Tracking</div>
          <div className="text-xs text-gray-500 mt-1">Zoom: {zoom}</div>
        </div>
        
        {/* Device List */}
        <div className="border-t border-slate-100 p-4 bg-slate-50/50">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
            Active Vehicles
          </div>
          {devices.filter(d => d.position).length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <MapPin className="size-12 mx-auto mb-3 text-slate-300" />
              <div className="font-medium">No GPS devices registered</div>
              <div className="text-sm mt-1">Add devices in Traccar to see them on the map</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {devices.filter(d => d.position).map(device => (
                <div
                  key={device.id}
                  className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 text-sm"
                >
                  <div className={`size-2 rounded-full ${
                    device.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <span className="font-medium text-slate-900 truncate flex-1">{device.name}</span>
                  <span className="text-xs text-slate-500">
                    {((device.position!.speed * 1.852)).toFixed(0)} km/h
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
