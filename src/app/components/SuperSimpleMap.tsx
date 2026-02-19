import { useEffect, useRef, useState } from 'react';

interface MobilePos {
  deviceId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

type DeviceStatus = 'Moving' | 'Idle' | 'Offline' | 'Waiting';

const STATUS_COLORS: Record<DeviceStatus, string> = {
  Moving: '#22c55e',
  Idle: '#f59e0b',
  Offline: '#ef4444',
  Waiting: '#64748b',
};

export function SuperSimpleMap() {
  const [pos, setPos] = useState<MobilePos | null>(null);
  const [status, setStatus] = useState<DeviceStatus>('Waiting');
  const [follow, setFollow] = useState(true);
  const [deviceId, setDeviceId] = useState('phone-1');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for GPS updates from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'gps_update') {
        setPos(e.data.pos);
        setStatus(e.data.status);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Send follow toggle to iframe
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'set_follow', value: follow }, '*');
  }, [follow]);

  // Send device ID change to iframe
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'set_device', value: deviceId }, '*');
  }, [deviceId]);

  const statusColor = STATUS_COLORS[status];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: 'calc(100vh - 130px)', minHeight: '520px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}`, animation: status === 'Moving' ? 'pulse 1s infinite' : 'none' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>📡 Live GPS Map</span>
          <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 999, background: statusColor + '22', color: statusColor, fontWeight: 700 }}>{status}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Device:</span>
          <input
            type="text"
            value={deviceId}
            onChange={e => setDeviceId(e.target.value.trim())}
            style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, width: 130 }}
            placeholder="phone-1"
          />
          <button
            onClick={() => setFollow(f => !f)}
            style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontWeight: 600, background: follow ? '#2563eb' : '#fff', color: follow ? '#fff' : '#475569', borderColor: follow ? '#2563eb' : '#cbd5e1' }}
          >
            {follow ? '📍 Following' : '📍 Follow'}
          </button>
        </div>
      </div>

      {/* Map iframe - takes all remaining space */}
      <div style={{ position: 'relative', flex: 1 }}>
        <iframe
          ref={iframeRef}
          src="/livemap.html"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="Live GPS Map"
        />

        {/* Info overlay on top of iframe */}
        {pos && (
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: 'rgba(255,255,255,0.97)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', fontSize: 12, minWidth: 155, pointerEvents: 'none' }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#1e293b' }}>📱 {pos.deviceId}</div>
            <div style={{ color: '#475569' }}>Lat: <b>{pos.lat.toFixed(5)}</b></div>
            <div style={{ color: '#475569' }}>Lng: <b>{pos.lng.toFixed(5)}</b></div>
            <div style={{ color: '#475569' }}>Speed: <b>{pos.speed != null ? `${pos.speed.toFixed(1)} km/h` : '—'}</b></div>
            <div style={{ color: '#475569' }}>Heading: <b>{pos.heading != null ? `${pos.heading.toFixed(0)}°` : '—'}</b></div>
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e2e8f0', color: '#94a3b8', fontSize: 11 }}>{new Date(pos.timestamp).toLocaleTimeString()}</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
        <span>Polling every 2s</span>
        <span>{pos ? `Last update: ${new Date(pos.timestamp).toLocaleTimeString()}` : 'Waiting for phone...'}</span>
      </div>
    </div>
  );
}
