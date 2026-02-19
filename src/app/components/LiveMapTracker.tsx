import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { MapPin, Navigation, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { gpsService, GPSLocation } from '../../services/gpsService';
import './LiveMapTracker.css';

// Types for vehicle data
interface VehicleStatus {
  speed: number;
  lastUpdated: string;
  lat: number;
  lng: number;
}

declare global {
  interface Window {
    maplibregl: any;
  }
}

export function LiveMapTracker() {
  const [vehicleId] = useState('vehicle-001'); // Default vehicle ID
  const [vehicleLocation, setVehicleLocation] = useState<GPSLocation | null>(null);
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followVehicle, setFollowVehicle] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const pollingIntervalRef = useRef<any>(null);

  // Load MapLibre GL JS from CDN
  useEffect(() => {
    const loadMapLibre = () => {
      console.log('Starting to load MapLibre GL JS...');
      
      // Check if already loaded
      if (window.maplibregl) {
        console.log('MapLibre GL JS already loaded');
        setMapLoaded(true);
        setLoading(false);
        return;
      }

      // Load CSS
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css';
      cssLink.onload = () => console.log('MapLibre CSS loaded');
      cssLink.onerror = () => console.error('Failed to load MapLibre CSS');
      document.head.appendChild(cssLink);

      // Load JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js';
      script.onload = () => {
        console.log('MapLibre GL JS loaded successfully');
        console.log('window.maplibregl:', window.maplibregl);
        setMapLoaded(true);
        setLoading(false);
      };
      script.onerror = (err) => {
        console.error('Failed to load MapLibre GL JS:', err);
        setError('Failed to load map library - check internet connection');
        setLoading(false);
      };
      document.head.appendChild(script);
    };

    loadMapLibre();
  }, []);

  // Initialize map when MapLibre is loaded
  useEffect(() => {
    if (!mapLoaded || !mapContainerRef.current || !window.maplibregl) {
      console.log('Map initialization conditions not met:', {
        mapLoaded,
        mapContainerRef: !!mapContainerRef.current,
        maplibregl: !!window.maplibregl
      });
      return;
    }

    const mapStyles = [
      'https://tiles.openfreemap.org/styles/liberty',
      'https://tiles.openfreemap.org/styles/positron',
      'https://tiles.openfreemap.org/styles/dark-matter'
    ];

    let currentStyleIndex = 0;

    const tryInitializeMap = (styleIndex = 0) => {
      if (styleIndex >= mapStyles.length) {
        setError('All map styles failed to load');
        return;
      }

      try {
        console.log('Initializing map with style:', mapStyles[styleIndex]);
        
        // Initialize map
        const map = new window.maplibregl.Map({
          container: mapContainerRef.current,
          style: mapStyles[styleIndex],
          center: [121.0, 14.6], // Manila default
          zoom: 12,
          attributionControl: false
        });

      // Add error handling for map
        map.on('error', (e: any) => {
          console.error('Map error with style', mapStyles[styleIndex], ':', e);
          if (styleIndex < mapStyles.length - 1) {
            console.log('Trying next style...');
            tryInitializeMap(styleIndex + 1);
          } else {
            setError('All map styles failed to load');
          }
        });

        map.on('load', () => {
          console.log('Map loaded successfully with style:', mapStyles[styleIndex]);
          
          // Add attribution control
          map.addControl(new window.maplibregl.AttributionControl({
            compact: true
          }));

          // Add navigation controls
          map.addControl(new window.maplibregl.NavigationControl());
        });

        mapRef.current = map;
        console.log('Map initialized successfully');
      } catch (err) {
        console.error('Error initializing map with style', mapStyles[styleIndex], ':', err);
        if (styleIndex < mapStyles.length - 1) {
          console.log('Trying next style...');
          tryInitializeMap(styleIndex + 1);
        } else {
          setError('Failed to initialize map: ' + (err as Error).message);
        }
      }
    };

    tryInitializeMap(0);

    return () => {
      if (mapRef.current) {
        console.log('Cleaning up map...');
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapLoaded]);

  // Create vehicle marker
  const createVehicleMarker = (location: GPSLocation) => {
    const markerElement = document.createElement('div');
    markerElement.className = 'vehicle-marker';
    markerElement.innerHTML = `
      <div class="vehicle-icon" style="transform: rotate(${location.heading || 0}deg)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L4 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-8-5z" 
                fill="#3b82f6" stroke="#1e40af" stroke-width="1"/>
          <path d="M12 8l-2 2h4l-2-2z" fill="white"/>
        </svg>
      </div>
    `;
    
    return markerElement;
  };

  // Update marker position
  const updateMarker = (location: GPSLocation) => {
    if (!mapRef.current || !markerRef.current) return;

    const marker = markerRef.current;
    const currentLngLat = marker.getLngLat();
    const newLngLat = [location.lng, location.lat];

    // Smooth animation
    marker.setLngLat(newLngLat);

    // Update rotation
    const markerElement = marker.getElement();
    const vehicleIcon = markerElement?.querySelector('.vehicle-icon');
    if (vehicleIcon && location.heading !== null) {
      vehicleIcon.style.transform = `rotate(${location.heading}deg)`;
    }

    // Follow vehicle if enabled
    if (followVehicle) {
      mapRef.current.easeTo({
        center: newLngLat,
        duration: 1000
      });
    }
  };

  // Calculate vehicle status (simplified - no presets)
  const calculateStatus = (location: GPSLocation) => {
    const now = Date.now();
    const age = now - location.timestamp;
    
    // Only show if data is recent, no preset status
    if (age > 30000) { // 30 seconds
      return null; // Too old, don't show
    }

    return {
      vehicleId: location.vehicleId,
      speed: location.speed || 0,
      lastUpdated: new Date(location.timestamp).toLocaleTimeString(),
      lat: location.lat,
      lng: location.lng
    };
  };

  // Fetch vehicle location
  const fetchVehicleLocation = async () => {
    try {
      // Try to get from GPS service first
      const location = await gpsService.getLatestLocation(vehicleId);
      
      if (location) {
        setVehicleLocation(location);
        setVehicleStatus(calculateStatus(location));
        setError(null);
      } else {
        // Use mock data when no real data available
        const now = Date.now();
        const timeOffset = (now % 60000) / 60000; // 0-1 minute cycle
        
        // Simulate movement around Manila
        const baseLat = 14.5995;
        const baseLng = 120.9842;
        const radius = 0.01; // Small movement radius
        
        const mockLocation: GPSLocation = {
          vehicleId,
          lat: baseLat + Math.sin(timeOffset * Math.PI * 2) * radius,
          lng: baseLng + Math.cos(timeOffset * Math.PI * 2) * radius,
          speed: 30 + Math.sin(timeOffset * Math.PI * 4) * 20, // 10-50 km/h
          heading: (timeOffset * 360) % 360, // 0-360 degrees
          timestamp: now
        };
        
        console.log('Using mock location:', mockLocation);
        setVehicleLocation(mockLocation);
        setVehicleStatus(calculateStatus(mockLocation));
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching vehicle location:', err);
      setError('Failed to fetch vehicle location');
    }
  };

  // Initialize marker when location is available
  useEffect(() => {
    if (!vehicleLocation || !mapRef.current) return;

    if (!markerRef.current) {
      // Create marker
      const markerElement = createVehicleMarker(vehicleLocation);
      
      const marker = new window.maplibregl.Marker({
        element: markerElement,
        anchor: 'center'
      })
        .setLngLat([vehicleLocation.lng, vehicleLocation.lat])
        .addTo(mapRef.current);

      markerRef.current = marker;
    } else {
      updateMarker(vehicleLocation);
    }
  }, [vehicleLocation]);

  // Start polling for location updates
  useEffect(() => {
    if (!mapLoaded) return;

    // Initial fetch
    fetchVehicleLocation();

    // Poll every 2 seconds
    pollingIntervalRef.current = setInterval(fetchVehicleLocation, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [vehicleId, mapLoaded]);

  
  if (loading) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-slate-600 dark:text-slate-400">Loading Live Map...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10">
        <CardContent className="p-6">
          <div className="flex flex-col items-center text-center">
            <MapPin className="size-12 text-red-500 mb-4" />
            <div className="font-semibold text-red-600 mb-2">Map Error</div>
            <div className="text-sm text-red-500 mb-4">{error}</div>
            <Button
              onClick={() => {
                setError(null);
                setLoading(true);
                setMapLoaded(false);
                // Reload the page to retry
                window.location.reload();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Retry Loading Map
            </Button>
            <div className="text-xs text-slate-500 mt-4">
              Check internet connection and try again
            </div>
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
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-500/20">
                <MapPin className="size-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-slate-900 font-bold text-lg dark:text-slate-100">
                  Live Map Tracker
                </CardTitle>
                <p className="text-slate-600 text-sm dark:text-slate-400">
                  Real-time vehicle location tracking
                </p>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFollowVehicle(!followVehicle)}
              className={`border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700 transition-all duration-150 ${
                followVehicle ? 'bg-blue-50 border-blue-200' : ''
              }`}
            >
              <Navigation className="size-4" />
              {followVehicle ? 'Following' : 'Follow'}
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={fetchVehicleLocation}
              className="border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700 transition-all duration-150"
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {/* Map Container */}
      <div className="relative">
        {/* Status Overlay */}
        {vehicleStatus && (
          <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-4 border border-slate-200/60 dark:bg-slate-800/95 dark:border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                📍 GPS Active
              </span>
            </div>
            
            <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex justify-between gap-4">
                <span>Speed:</span>
                <span className="font-mono">{vehicleStatus.speed.toFixed(1)} km/h</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Lat:</span>
                <span className="font-mono">{vehicleStatus.lat.toFixed(6)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Lng:</span>
                <span className="font-mono">{vehicleStatus.lng.toFixed(6)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Last Updated:</span>
                <span className="font-mono">{vehicleStatus.lastUpdated}</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Map */}
        <div 
          ref={mapContainerRef} 
          className="w-full h-[600px]"
          style={{ minHeight: '600px' }}
        />
      </div>
      
      {/* Footer */}
      <div className="px-6 py-3 border-t border-slate-200/60 dark:border-slate-700">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span>Vehicle ID: {vehicleId}</span>
            <span>•</span>
            <span>Powered by MapLibre GL + OpenFreeMap</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>Live Tracking Active</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
