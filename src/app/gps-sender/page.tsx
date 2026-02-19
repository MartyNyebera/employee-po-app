'use client';

import { useEffect, useState, useRef } from 'react';
import { gpsService, GPSLocation } from '../../services/gpsService';

export default function GPSSenderPage() {
  const [isTracking, setIsTracking] = useState(false);
  const [location, setLocation] = useState<GPSLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState('vehicle-001');
  const [mode, setMode] = useState<'manual' | 'automatic' | 'simulation'>('manual');
  const [sentCount, setSentCount] = useState(0);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Manual GPS sending
  const sendManualGPS = async () => {
    const lat = parseFloat((document.getElementById('latitude') as HTMLInputElement)?.value || '0');
    const lng = parseFloat((document.getElementById('longitude') as HTMLInputElement)?.value || '0');
    const speed = parseFloat((document.getElementById('speed') as HTMLInputElement)?.value || '0');
    const heading = parseFloat((document.getElementById('heading') as HTMLInputElement)?.value || '0');

    if (isNaN(lat) || isNaN(lng)) {
      setError('Please enter valid latitude and longitude');
      return;
    }

    const locationData: GPSLocation = {
      vehicleId,
      lat,
      lng,
      speed: speed || null,
      heading: heading || null,
      timestamp: Date.now()
    };

    try {
      const result = await gpsService.saveLocation(locationData);
      
      if (result.success) {
        setLocation(locationData);
        setSentCount(prev => prev + 1);
        setSuccess('GPS location sent successfully!');
        setError(null);
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      console.error('Error sending GPS:', err);
      setError('Failed to send GPS location');
      setSuccess(null);
    }
  };

  // Automatic GPS sending (device GPS)
  const startAutomaticGPS = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser');
      return;
    }

    setIsTracking(true);
    setError(null);
    setSuccess(null);

    const sendLocation = async (position: GeolocationPosition) => {
      const locationData: GPSLocation = {
        vehicleId,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        speed: position.coords.speed ? position.coords.speed * 3.6 : null, // Convert m/s to km/h
        heading: position.coords.heading,
        timestamp: Date.now()
      };

      try {
        const result = await gpsService.saveLocation(locationData);
        
        if (result.success) {
          setLocation(locationData);
          setSentCount(prev => prev + 1);
          setError(null);
        } else {
          throw new Error(result.message);
        }
      } catch (err) {
        console.error('Error sending GPS:', err);
        setError('Failed to send GPS location');
      }
    };

    // Start watching position
    watchIdRef.current = navigator.geolocation.watchPosition(
      sendLocation,
      (err) => {
        console.error('Geolocation error:', err);
        setError(`Geolocation error: ${err.message}`);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    // Send initial position
    navigator.geolocation.getCurrentPosition(sendLocation, (err) => {
      console.error('Initial position error:', err);
    });
  };

  // Simulation mode
  const startSimulation = () => {
    setIsTracking(true);
    setError(null);
    setSuccess(null);

    let angle = Math.random() * 360;
    const baseLat = 14.5995;
    const baseLng = 120.9842;
    const radius = 0.01;

    intervalRef.current = setInterval(async () => {
      // Simulate movement
      angle += (Math.random() - 0.5) * 30;
      const lat = baseLat + Math.sin(angle * Math.PI / 180) * radius;
      const lng = baseLng + Math.cos(angle * Math.PI / 180) * radius;
      const speed = 20 + Math.random() * 40; // 20-60 km/h
      const heading = angle % 360;

      const locationData: GPSLocation = {
        vehicleId,
        lat,
        lng,
        speed,
        heading,
        timestamp: Date.now()
      };

      try {
        const result = await gpsService.saveLocation(locationData);
        
        if (result.success) {
          setLocation(locationData);
          setSentCount(prev => prev + 1);
          setError(null);
        }
      } catch (err) {
        console.error('Error sending simulated GPS:', err);
        setError('Failed to send simulated GPS');
      }
    }, 2000); // Every 2 seconds
  };

  const stopTracking = () => {
    setIsTracking(false);
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, []);

  const getStatusColor = () => {
    if (isTracking) return 'bg-green-500';
    if (error) return 'bg-red-500';
    if (success) return 'bg-blue-500';
    return 'bg-gray-500';
  };

  const getStatusText = () => {
    if (isTracking) return 'Active';
    if (error) return 'Error';
    if (success) return 'Success';
    return 'Inactive';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 dark:bg-slate-800">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              📍 GPS Sender
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Send GPS location data to the live tracking system
            </p>
            
            {/* Status Bar */}
            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Status: {getStatusText()}
                </span>
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Sent: {sentCount} locations
              </div>
            </div>
          </div>

          {/* Mode Selection */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 dark:bg-slate-800">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Sending Mode
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setMode('manual')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  mode === 'manual' 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  📍 Manual
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Enter coordinates manually
                </div>
              </button>
              
              <button
                onClick={() => setMode('automatic')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  mode === 'automatic' 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  📱 Automatic
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Use device GPS
                </div>
              </button>
              
              <button
                onClick={() => setMode('simulation')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  mode === 'simulation' 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  🎮 Simulation
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Simulate movement
                </div>
              </button>
            </div>
          </div>

          {/* Manual Mode */}
          {mode === 'manual' && (
            <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 dark:bg-slate-800">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Manual GPS Input
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Vehicle ID
                  </label>
                  <input
                    type="text"
                    id="vehicleId"
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    placeholder="vehicle-001"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Latitude
                  </label>
                  <input
                    type="number"
                    id="latitude"
                    step="0.000001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    placeholder="14.5995"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Longitude
                  </label>
                  <input
                    type="number"
                    id="longitude"
                    step="0.000001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    placeholder="120.9842"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Speed (km/h)
                  </label>
                  <input
                    type="number"
                    id="speed"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    placeholder="45"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Heading (degrees)
                  </label>
                  <input
                    type="number"
                    id="heading"
                    min="0"
                    max="360"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    placeholder="90"
                  />
                </div>
              </div>
              
              <button
                onClick={sendManualGPS}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
              >
                📍 Send GPS Location
              </button>
            </div>
          )}

          {/* Automatic Mode */}
          {mode === 'automatic' && (
            <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 dark:bg-slate-800">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Automatic GPS Tracking
              </h2>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Vehicle ID
                </label>
                <input
                  type="text"
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  placeholder="vehicle-001"
                />
              </div>
              
              {!isTracking ? (
                <button
                  onClick={startAutomaticGPS}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Start Automatic GPS
                </button>
              ) : (
                <button
                  onClick={stopTracking}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <div className="w-5 h-5 bg-white rounded-sm" />
                  Stop GPS Tracking
                </button>
              )}
              
              <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                <p>• Location updates every 2 seconds</p>
                <p>• High accuracy mode enabled</p>
                <p>• Requires GPS permissions</p>
              </div>
            </div>
          )}

          {/* Simulation Mode */}
          {mode === 'simulation' && (
            <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 dark:bg-slate-800">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
                GPS Simulation
              </h2>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Vehicle ID
                </label>
                <input
                  type="text"
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  placeholder="vehicle-001"
                />
              </div>
              
              {!isTracking ? (
                <button
                  onClick={startSimulation}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Start Simulation
                </button>
              ) : (
                <button
                  onClick={stopTracking}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <div className="w-5 h-5 bg-white rounded-sm" />
                  Stop Simulation
                </button>
              )}
              
              <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                <p>• Simulates movement around Manila</p>
                <p>• Updates every 2 seconds</p>
                <p>• Random speed and heading changes</p>
              </div>
            </div>
          )}

          {/* Current Location */}
          {location && (
            <div className="bg-white rounded-2xl shadow-xl p-6 dark:bg-slate-800">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Current Location
              </h2>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Latitude:</span>
                  <div className="font-mono text-slate-900 dark:text-slate-100">
                    {location.lat.toFixed(6)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Longitude:</span>
                  <div className="font-mono text-slate-900 dark:text-slate-100">
                    {location.lng.toFixed(6)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Speed:</span>
                  <div className="font-mono text-slate-900 dark:text-slate-100">
                    {location.speed ? `${location.speed.toFixed(1)} km/h` : 'N/A'}
                  </div>
                </div>
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Heading:</span>
                  <div className="font-mono text-slate-900 dark:text-slate-100">
                    {location.heading ? `${location.heading.toFixed(0)}°` : 'N/A'}
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-600 dark:text-slate-400">Last Updated:</span>
                  <div className="font-mono text-slate-900 dark:text-slate-100">
                    {new Date(location.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg dark:bg-green-900/20 dark:border-green-800">
              <p className="text-green-600 dark:text-green-400">{success}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
