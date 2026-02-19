import { useEffect, useRef, useState } from 'react';

const DEFAULT_DEVICE_ID = 'phone-tracker-1';

interface LocationData {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

export default function TrackerPage() {
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [isTracking, setIsTracking] = useState(false);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [sendCount, setSendCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

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

    try {
      const res = await fetch('/api/mobile/location', {
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
    } catch (err: any) {
      setError('Send failed: ' + err.message);
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser');
      return;
    }
    setError(null);
    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      postLocation,
      (err) => {
        setError(`GPS error: ${err.message}`);
        setIsTracking(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

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
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isTracking ? '#22c55e' : '#64748b', boxShadow: isTracking ? '0 0 8px #22c55e' : 'none' }} />
            <span style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>{isTracking ? 'Tracking Active' : 'Not Tracking'}</span>
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
