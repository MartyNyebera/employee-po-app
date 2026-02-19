import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { MapPin, RefreshCw } from 'lucide-react';

interface GPSData {
  vehicleId: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

declare global {
  interface Window {
    maplibregl: any;
  }
}

export function SuperSimpleMap() {
  const [gpsData, setGpsData] = useState<GPSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Load MapLibre from CDN
  useEffect(() => {
    const loadMap = () => {
      console.log('Loading map...');
      
      // Load CSS
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css';
      document.head.appendChild(css);

      // Load JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js';
      script.onload = () => {
        console.log('MapLibre loaded');
        setMapLoaded(true);
        setLoading(false);
      };
      script.onerror = () => {
        console.error('Failed to load MapLibre');
        setLoading(false);
      };
      document.head.appendChild(script);
    };

    loadMap();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapLoaded || !mapContainerRef.current || !window.maplibregl) return;

    try {
      console.log('Initializing map...');
      
      const map = new window.maplibregl.Map({
        container: mapContainerRef.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [121.0, 14.6],
        zoom: 12
      });

      map.on('load', () => {
        console.log('Map loaded');
      });

      mapRef.current = map;
    } catch (err) {
      console.error('Map init error:', err);
    }
  }, [mapLoaded]);

  // Listen for GPS data
  useEffect(() => {
    const checkGPS = () => {
      // Check for uncle-phone GPS data
      const uncleData = localStorage.getItem('gpsData_uncle-phone');
      if (uncleData) {
        try {
          const data = JSON.parse(uncleData);
          console.log('Found GPS data:', data);
          // Validate data structure
          if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
            setGpsData(data);
          } else {
            console.warn('Invalid GPS data structure:', data);
          }
        } catch (err) {
          console.error('Error parsing GPS data:', err);
          // Clear corrupted data
          localStorage.removeItem('gpsData_uncle-phone');
        }
      }
    };

    // Check immediately
    checkGPS();

    // Check every 2 seconds
    const interval = setInterval(checkGPS, 2000);

    // Listen for storage events
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'gpsData_uncle-phone' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          console.log('Storage event GPS data:', data);
          // Validate data structure
          if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
            setGpsData(data);
          } else {
            console.warn('Invalid GPS data structure from storage:', data);
          }
        } catch (err) {
          console.error('Error parsing storage GPS data:', err);
          // Clear corrupted data
          localStorage.removeItem('gpsData_uncle-phone');
        }
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Update marker
  useEffect(() => {
    if (!gpsData || !mapRef.current || !window.maplibregl) return;

    if (!markerRef.current) {
      // Create marker
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="
          background: #3b82f6;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <span style="color: white; font-size: 16px;">👨</span>
        </div>
      `;

      const marker = new window.maplibregl.Marker({
        element: el,
        anchor: 'center'
      })
        .setLngLat([gpsData.lng, gpsData.lat])
        .addTo(mapRef.current);

      markerRef.current = marker;
      console.log('Marker created at:', [gpsData.lng, gpsData.lat]);
    } else {
      // Update marker position
      markerRef.current.setLngLat([gpsData.lng, gpsData.lat]);
      console.log('Marker updated to:', [gpsData.lng, gpsData.lat]);
    }

    // Center map on marker
    mapRef.current.easeTo({
      center: [gpsData.lng, gpsData.lat],
      zoom: 15,
      duration: 1000
    });
  }, [gpsData]);

  if (loading) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3">Loading map...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-slate-200/60 shadow-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>🗺️ Uncle Live Map</CardTitle>
            <p className="text-sm text-slate-600">Super simple - no bugs!</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const data = localStorage.getItem('gpsData_uncle-phone');
              if (data) {
                setGpsData(JSON.parse(data));
                console.log('Manual refresh loaded:', JSON.parse(data));
              } else {
                console.log('No GPS data found');
              }
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {/* GPS Status */}
        {gpsData && (
          <div className="absolute top-4 left-4 z-10 bg-white/95 p-3 rounded-lg shadow-lg border">
            <div className="text-sm space-y-1">
              <div><strong>👨 Uncle's Phone</strong></div>
              <div>Lat: {gpsData.lat.toFixed(6)}</div>
              <div>Lng: {gpsData.lng.toFixed(6)}</div>
              <div>Speed: {gpsData.speed ? `${gpsData.speed.toFixed(1)} km/h` : 'Still'}</div>
              <div>Updated: {new Date(gpsData.timestamp).toLocaleTimeString()}</div>
            </div>
          </div>
        )}
        
        {/* Map */}
        <div 
          ref={mapContainerRef} 
          className="w-full h-[500px]"
          style={{ minHeight: '500px' }}
        />
        
        {/* Status */}
        <div className="p-4 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${gpsData ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              {gpsData ? '👨 Uncle tracked' : 'Waiting for GPS...'}
            </span>
            <span className="text-slate-500">
              {gpsData ? `Last: ${new Date(gpsData.timestamp).toLocaleTimeString()}` : 'No data yet'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
