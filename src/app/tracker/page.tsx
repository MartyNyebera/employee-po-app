import { useEffect, useRef, useState } from 'react';

const DEFAULT_DEVICE_ID = 'phone-1';

interface LocationData {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

interface TrackingStats {
  totalDistance: number;
  maxSpeed: number;
  avgSpeed: number;
  duration: number;
}

export default function TrackerPage() {
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [isTracking, setIsTracking] = useState(false);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [sendCount, setSendCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline' | 'poor'>('online');
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [trackingStats, setTrackingStats] = useState<TrackingStats>({
    totalDistance: 0,
    maxSpeed: 0,
    avgSpeed: 0,
    duration: 0
  });
  const [history, setHistory] = useState<LocationData[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const lastLocationRef = useRef<LocationData | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const sendIntervalRef = useRef<number | null>(null);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const updateTrackingStats = (newLocation: LocationData) => {
    if (!lastLocationRef.current) {
      lastLocationRef.current = newLocation;
      return;
    }

    const distance = calculateDistance(
      lastLocationRef.current.lat,
      lastLocationRef.current.lng,
      newLocation.lat,
      newLocation.lng
    );

    const currentSpeed = newLocation.speed || 0;
    const newMaxSpeed = Math.max(trackingStats.maxSpeed, currentSpeed);
    const newTotalDistance = trackingStats.totalDistance + distance;
    const duration = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
    const newAvgSpeed = duration > 0 ? (newTotalDistance / (duration / 1000 / 60 / 60)) : 0;

    setTrackingStats({
      totalDistance: newTotalDistance,
      maxSpeed: newMaxSpeed,
      avgSpeed: newAvgSpeed,
      duration
    });

    lastLocationRef.current = newLocation;
  };

  const postLocation = async (pos: GeolocationPosition) => {
    const data: LocationData = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      speed: pos.coords.speed != null ? pos.coords.speed * 3.6 : null, // m/s → km/h
      heading: pos.coords.heading ?? null,
      timestamp: Date.now(),
    };

    setLocation(data);
    setHistory(prev => [...prev.slice(-99), data]); // Keep last 100 positions
    updateTrackingStats(data);

    // Check connection status
    if (navigator.onLine) {
      setConnectionStatus('online');
    } else {
      setConnectionStatus('offline');
      // Store in localStorage for offline sync
      localStorage.setItem(`gpsOffline_${deviceId}`, JSON.stringify(data));
      return;
    }

    try {
      const res = await fetch('/api/phone-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, ...data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setLastSent(new Date().toLocaleTimeString());
      setSendCount(c => c + 1);
      setError(null);
      setConnectionStatus('online');
      
      // Clear offline data after successful send
      localStorage.removeItem(`gpsOffline_${deviceId}`);
    } catch (err: any) {
      setError('Send failed: ' + err.message);
      setConnectionStatus('poor');
      // Store in localStorage for retry
      localStorage.setItem(`gpsOffline_${deviceId}`, JSON.stringify(data));
    }
  };

  const getBatteryLevel = async () => {
    if ('getBattery' in navigator) {
      try {
        const battery = await (navigator as any).getBattery();
        setBatteryLevel(Math.round(battery.level * 100));
        
        // Listen for battery level changes
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      } catch (e) {
        console.log('Battery API not available');
      }
    }
  };

  const syncOfflineData = async () => {
    const offlineData = localStorage.getItem(`gpsOffline_${deviceId}`);
    if (offlineData) {
      try {
        const data = JSON.parse(offlineData);
        await fetch('/api/phone-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, ...data }),
        });
        localStorage.removeItem(`gpsOffline_${deviceId}`);
        setSendCount(c => c + 1);
      } catch (e) {
        console.log('Offline sync failed, will retry later');
      }
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser');
      return;
    }
    setError(null);
    setIsTracking(true);
    startTimeRef.current = Date.now();
    
    // Get battery level
    getBatteryLevel();
    
    // Sync any offline data
    syncOfflineData();

    // Set up periodic sync for offline data
    sendIntervalRef.current = window.setInterval(() => {
      if (navigator.onLine) {
        syncOfflineData();
      }
    }, 30000); // Every 30 seconds

    watchIdRef.current = navigator.geolocation.watchPosition(
      postLocation,
      (err) => {
        setError(`GPS error: ${err.message}`);
        setIsTracking(false);
        if (sendIntervalRef.current) {
          clearInterval(sendIntervalRef.current);
          sendIntervalRef.current = null;
        }
      },
      { 
        enableHighAccuracy: true, 
        timeout: 15000, 
        maximumAge: 0,
        // Adaptive accuracy based on battery level
        ...(batteryLevel && batteryLevel < 20 && {
          enableHighAccuracy: false,
          timeout: 30000,
          maximumAge: 60000 // 1 minute cache for low battery
        })
      }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (sendIntervalRef.current !== null) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
    setIsTracking(false);
    startTimeRef.current = null;
    lastLocationRef.current = null;
    
    // Save tracking summary
    if (trackingStats.totalDistance > 0) {
      const summary = {
        deviceId,
        date: new Date().toISOString(),
        ...trackingStats,
        history: history.slice(-10) // Save last 10 positions
      };
      localStorage.setItem(`gpsSummary_${deviceId}_${Date.now()}`, JSON.stringify(summary));
    }
  };

  useEffect(() => {
    // Listen for online/offline events
    const handleOnline = () => {
      setConnectionStatus('online');
      if (isTracking) {
        // Sync offline data when coming back online
        const offlineData = localStorage.getItem(`gpsOffline_${deviceId}`);
        if (offlineData) {
          try {
            const data = JSON.parse(offlineData);
            fetch('/api/phone-location', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ deviceId, ...data }),
            }).then(() => {
              localStorage.removeItem(`gpsOffline_${deviceId}`);
              setSendCount(c => c + 1);
            }).catch(() => {
              console.log('Offline sync failed, will retry later');
            });
          } catch (e) {
            console.log('Offline sync failed, will retry later');
          }
        }
      }
    };
    
    const handleOffline = () => {
      setConnectionStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (sendIntervalRef.current !== null) {
        clearInterval(sendIntervalRef.current);
      }
    };
  }, [isTracking, deviceId]);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)', padding: '16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '420px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>� Phone GPS Tracker</div>
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>Sends your location to the fleet dashboard</div>
        </div>

        {/* iOS Warning */}
        <div style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: '#fbbf24', fontWeight: 600, marginBottom: '4px' }}>⚠️ iOS Safari Notice</div>
          <div style={{ fontSize: '12px', color: '#fcd34d', lineHeight: '1.5' }}>
            iOS Safari stops GPS when the screen locks. Keep this page open and screen awake while tracking. For best results use Chrome on Android.
          </div>
        </div>

        {/* Device ID */}
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Device ID (shown on map)</label>
          <input
            type="text"
            value={deviceId}
            onChange={e => setDeviceId(e.target.value.trim())}
            disabled={isTracking}
            style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
          />
        </div>

        {/* Status */}
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <div style={{ 
              width: '10px', 
              height: '10px', 
              borderRadius: '50%', 
              background: connectionStatus === 'online' ? '#22c55e' : connectionStatus === 'offline' ? '#ef4444' : '#f59e0b', 
              boxShadow: connectionStatus === 'online' ? '0 0 8px #22c55e' : 'none' 
            }} />
            <span style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>
              {isTracking ? `Tracking Active (${connectionStatus})` : 'Not Tracking'}
            </span>
            {batteryLevel !== null && (
              <span style={{ fontSize: '12px', color: batteryLevel > 20 ? '#22c55e' : '#ef4444' }}>
                🔋 {batteryLevel}%
              </span>
            )}
          </div>

          {location && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                ['Latitude', location.lat.toFixed(6)],
                ['Longitude', location.lng.toFixed(6)],
                ['Speed', location.speed != null ? `${location.speed.toFixed(1)} km/h` : '—'],
                ['Heading', location.heading != null ? `${location.heading.toFixed(0)}°` : '—'],
                ['Accuracy', location.accuracy != null ? `±${location.accuracy.toFixed(0)}m` : '—'],
                ['Sent', `${sendCount} times`],
              ].map(([label, value]) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 600, fontFamily: 'monospace' }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tracking Stats */}
          {isTracking && trackingStats.totalDistance > 0 && (
            <div style={{ marginTop: '12px', background: 'rgba(34,197,94,0.1)', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600, marginBottom: '6px' }}>📊 TRACKING STATS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>Distance</div>
                  <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: 600 }}>
                    {trackingStats.totalDistance < 1 ? 
                      `${(trackingStats.totalDistance * 1000).toFixed(0)}m` : 
                      `${trackingStats.totalDistance.toFixed(2)}km`
                    }
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>Max Speed</div>
                  <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: 600 }}>
                    {trackingStats.maxSpeed.toFixed(1)}km/h
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>Duration</div>
                  <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: 600 }}>
                    {Math.floor(trackingStats.duration / 1000 / 60)}m
                  </div>
                </div>
              </div>
            </div>
          )}

          {lastSent && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#22c55e' }}>
              ✓ Last sent: {lastSent}
            </div>
          )}

          {error && (
            <div style={{ marginTop: '10px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#f87171' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Controls */}
        {!isTracking ? (
          <button
            onClick={startTracking}
            style={{ width: '100%', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '14px', padding: '18px', fontSize: '17px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            <span style={{ fontSize: '22px' }}>▶</span> Start Tracking
          </button>
        ) : (
          <button
            onClick={stopTracking}
            style={{ width: '100%', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '14px', padding: '18px', fontSize: '17px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            <span style={{ fontSize: '22px' }}>⏹</span> Stop Tracking
          </button>
        )}

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: '#475569' }}>
          View live position on the dashboard GPS map
        </div>
      </div>
    </div>
  );
}
