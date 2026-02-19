import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { MapPin, RefreshCw, Navigation } from 'lucide-react';

interface GPSData {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: number;
}

declare global {
  interface Window {
    maplibregl: any;
  }
}

export function UltraSimpleGPS() {
  const [gpsData, setGpsData] = useState<GPSData | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Load MapLibre from CDN
  useEffect(() => {
    const loadMap = () => {
      // Load CSS
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css';
      document.head.appendChild(css);

      // Load JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js';
      script.onload = () => {
        setMapLoaded(true);
      };
      document.head.appendChild(script);
    };

    loadMap();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapLoaded || !mapContainerRef.current || !window.maplibregl) return;

    try {
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
      console.error('Map error:', err);
    }
  }, [mapLoaded]);

  // Listen for GPS data (super simple)
  useEffect(() => {
    const checkGPS = () => {
      // Check for any GPS data in localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('gpsData_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            setGpsData({
              lat: data.lat,
              lng: data.lng,
              speed: data.speed || 0,
              heading: data.heading || 0,
              timestamp: data.timestamp
            });
            break;
          } catch (err) {
            console.error('GPS parse error:', err);
          }
        }
      }
    };

    // Check immediately
    checkGPS();

    // Check every 2 seconds
    const interval = setInterval(checkGPS, 2000);

    // Listen for storage events
    const handleStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('gpsData_') && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          setGpsData({
            lat: data.lat,
            lng: data.lng,
            speed: data.speed || 0,
            heading: data.heading || 0,
            timestamp: data.timestamp
          });
        } catch (err) {
          console.error('Storage GPS error:', err);
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
      // Create simple marker
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="
          background: #3b82f6;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        ">
          📍
        </div>
      `;

      const marker = new window.maplibregl.Marker({
        element: el,
        anchor: 'center'
      })
        .setLngLat([gpsData.lng, gpsData.lat])
        .addTo(mapRef.current);

      markerRef.current = marker;
    } else {
      // Update marker
      markerRef.current.setLngLat([gpsData.lng, gpsData.lat]);
    }

    // Center map on GPS
    mapRef.current.flyTo({
      center: [gpsData.lng, gpsData.lat],
      zoom: 15,
      duration: 1000
    });
  }, [gpsData]);

  return (
    <Card className="bg-white border border-slate-200/60 shadow-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>🗺️ Ultra Simple GPS Tracker</CardTitle>
            <p className="text-sm text-slate-600">No more bugs - just works!</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Manual refresh
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('gpsData_')) {
                  try {
                    const data = JSON.parse(localStorage.getItem(key) || '{}');
                    setGpsData({
                      lat: data.lat,
                      lng: data.lng,
                      speed: data.speed || 0,
                      heading: data.heading || 0,
                      timestamp: data.timestamp
                    });
                    break;
                  } catch (err) {
                    console.error('Manual refresh error:', err);
                  }
                }
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
              <div><strong>📍 GPS Active</strong></div>
              <div>Lat: {gpsData.lat.toFixed(6)}</div>
              <div>Lng: {gpsData.lng.toFixed(6)}</div>
              <div>Speed: {gpsData.speed.toFixed(1)} km/h</div>
              <div>Heading: {gpsData.heading.toFixed(0)}°</div>
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
              {gpsData ? '📍 GPS Connected' : '⏸️ Waiting for GPS'}
            </span>
            <span className="text-slate-500">
              {gpsData ? `Updated: ${new Date(gpsData.timestamp).toLocaleTimeString()}` : 'No data yet'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
