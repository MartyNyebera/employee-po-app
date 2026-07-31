import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// Time station (/clock). A shared door PC, NOT an employee login. It authenticates
// as a station: the station_token secret is stored on this PC and exchanged for a
// short-lived JWT (mirrors the per-portal token pattern). A hands-free USB scanner
// behaves like a keyboard — it types the QR contents then Enter into an always-focused
// hidden input. The server decides IN vs OUT and stamps the time; this page only shows it.
// ============================================================================

const SECRET_KEY = 'clock_station_secret'; // the station_token (persistent on this PC)
const JWT_KEY = 'clock_station_jwt';       // cached session JWT (refreshed on 401)
const NAME_KEY = 'clock_station_name';

interface StationLoginResult { token: string; station: { id: number; name: string | null }; }

async function stationLogin(secret: string): Promise<StationLoginResult> {
  const res = await fetch('/api/clock/station-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ station_token: secret }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Station login failed'); }
  return res.json();
}

// Fetch with the station JWT; on a 401 refresh the JWT from the stored secret and retry once.
async function stationFetch(path: string, opts: RequestInit, secret: string): Promise<Response> {
  const go = () => fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem(JWT_KEY) || ''), ...(opts.headers || {}) } });
  let res = await go();
  if (res.status === 401) {
    const r = await stationLogin(secret);
    localStorage.setItem(JWT_KEY, r.token);
    res = await go();
  }
  return res;
}

export function ClockStation() {
  const [secret, setSecret] = useState<string | null>(() => localStorage.getItem(SECRET_KEY));
  const [stationName, setStationName] = useState<string>(() => localStorage.getItem(NAME_KEY) || '');
  const [connecting, setConnecting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  // (Re)establish a session whenever the secret is set (also on page reload).
  useEffect(() => {
    if (!secret) { setReady(false); return; }
    let cancelled = false;
    setConnecting(true);
    stationLogin(secret)
      .then(r => {
        if (cancelled) return;
        localStorage.setItem(JWT_KEY, r.token);
        localStorage.setItem(NAME_KEY, r.station.name || '');
        setStationName(r.station.name || '');
        setReady(true); setError('');
      })
      .catch((e: any) => { if (!cancelled) { setReady(false); setError(e.message || 'Could not connect'); } })
      .finally(() => { if (!cancelled) setConnecting(false); });
    return () => { cancelled = true; };
  }, [secret]);

  const activate = (s: string) => { localStorage.setItem(SECRET_KEY, s); setSecret(s); };
  const signOut = () => {
    localStorage.removeItem(SECRET_KEY); localStorage.removeItem(JWT_KEY); localStorage.removeItem(NAME_KEY);
    setSecret(null); setReady(false); setError('');
  };

  if (!ready) return <StationSetup connecting={connecting} error={error} hasSecret={!!secret} onActivate={activate} onReset={signOut} />;
  return <ClockView secret={secret!} stationName={stationName} onSignOut={signOut} />;
}

// ---- Setup / activation ---------------------------------------------------
function StationSetup({ connecting, error, hasSecret, onActivate, onReset }: {
  connecting: boolean; error: string; hasSecret: boolean; onActivate: (s: string) => void; onReset: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'Poppins, system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '420px', background: '#1e293b', borderRadius: '16px', padding: '32px', border: '1px solid #334155' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px' }}>Time Station Setup</h1>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px' }}>Paste the station token from the admin dashboard (Time Stations). It's saved on this PC.</p>
        {connecting && hasSecret ? (
          <p style={{ fontSize: '14px', color: '#cbd5e1' }}>Connecting…</p>
        ) : (
          <>
            <input
              autoFocus value={value} onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onActivate(value.trim()); }}
              placeholder="Station token"
              style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
            />
            {error ? <p style={{ fontSize: '13px', color: '#f87171', marginTop: '10px' }}>{error}</p> : null}
            <button
              onClick={() => value.trim() && onActivate(value.trim())}
              style={{ width: '100%', marginTop: '16px', padding: '12px', borderRadius: '10px', border: 'none', background: '#d1b01b', color: '#000', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}>
              Activate station
            </button>
            {hasSecret ? <button onClick={onReset} style={{ width: '100%', marginTop: '10px', padding: '10px', borderRadius: '10px', border: '1px solid #475569', background: 'transparent', color: '#cbd5e1', fontSize: '13px', cursor: 'pointer' }}>Clear stored token</button> : null}
          </>
        )}
      </div>
    </div>
  );
}

// ---- The live clock + scan capture ---------------------------------------
interface PunchRow { id: number; punch_type: 'in' | 'out'; punched_at: string; full_name: string; position?: string | null; photo_url?: string | null; }
type Flash = { kind: 'in' | 'out' | 'info' | 'error'; name?: string; position?: string | null; time?: string; message?: string; photo?: string | null } | null;

// Round avatar with an initials fallback — a missing photo never breaks the flash or the list.
const initialsOf = (name?: string) =>
  (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
function StationAvatar({ src, name, size }: { src?: string | null; name?: string; size: number }) {
  const common: React.CSSProperties = { width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.5)' };
  if (src) return <img src={src} alt="" style={common} />;
  return (
    <span style={{ ...common, background: 'rgba(255,255,255,0.15)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: Math.round(size * 0.36) }}>
      {initialsOf(name)}
    </span>
  );
}

const fmtClock = (d: Date) => d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtTime = (s: string) => new Date(s).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (d: Date) => d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

function ClockView({ secret, stationName, onSignOut }: { secret: string; stationName: string; onSignOut: () => void }) {
  const [now, setNow] = useState(() => new Date());
  const [buffer, setBuffer] = useState('');
  const [flash, setFlash] = useState<Flash>(null);
  const [today, setToday] = useState<PunchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<number | null>(null);

  // Live clock.
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // Keep the hidden scanner input focused at all times.
  const refocus = useCallback(() => inputRef.current?.focus(), []);
  useEffect(() => {
    refocus();
    const onClick = () => refocus();
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [refocus]);

  const loadToday = useCallback(async () => {
    try { const res = await stationFetch('/api/attendance/today', {}, secret); if (res.ok) setToday(await res.json()); }
    catch { /* leave last-known list */ }
  }, [secret]);

  useEffect(() => { loadToday(); const t = window.setInterval(loadToday, 20000); return () => clearInterval(t); }, [loadToday]);

  const showFlash = useCallback((f: Flash) => {
    setFlash(f);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 2500);
  }, []);

  const handleScan = useCallback(async (code: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await stationFetch('/api/attendance/scan', { method: 'POST', body: JSON.stringify({ token: code }) }, secret);
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) showFlash({ kind: 'error', message: data.error || 'Scan failed' });
      else if (data.ignored) showFlash({ kind: 'info', name: data.person?.name, position: data.person?.position, photo: data.person?.photo, message: data.message });
      else { showFlash({ kind: data.punch_type, name: data.person?.name, position: data.person?.position, photo: data.person?.photo, time: data.punched_at }); loadToday(); }
    } catch { showFlash({ kind: 'error', message: 'Network error — try again' }); }
    finally { setBusy(false); refocus(); }
  }, [busy, secret, showFlash, loadToday, refocus]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); const code = buffer.trim(); setBuffer(''); if (code) handleScan(code); }
  };

  const flashStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 30, textAlign: 'center', padding: '24px' };
    if (!flash) return { ...base, display: 'none' };
    const bg = flash.kind === 'in' ? '#065f46' : flash.kind === 'out' ? '#1e40af' : flash.kind === 'error' ? '#7f1d1d' : '#334155';
    return { ...base, background: bg };
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', fontFamily: 'Poppins, system-ui, sans-serif', position: 'relative', overflow: 'hidden' }}
      onClick={refocus}>
      {/* Always-focused, visually hidden capture field for the USB scanner. */}
      <input
        ref={inputRef} value={buffer} onChange={e => setBuffer(e.target.value)} onKeyDown={onKeyDown}
        onBlur={() => setTimeout(refocus, 0)} autoFocus aria-hidden
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px' }}
      />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#cbd5e1' }}>{stationName || 'Time Station'}</div>
        <button onClick={onSignOut} style={{ fontSize: '12px', color: '#64748b', background: 'none', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' }}>Sign out</button>
      </div>

      {/* Clock + prompt */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px 24px' }}>
        <div style={{ fontSize: 'min(18vw, 140px)', fontWeight: 800, lineHeight: 1, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}>{fmtClock(now)}</div>
        <div style={{ fontSize: '18px', color: '#94a3b8', marginTop: '10px' }}>{fmtDay(now)}</div>
        <div style={{ marginTop: '28px', fontSize: '20px', fontWeight: 600, color: '#d1b01b' }}>Scan your QR ID to clock in / out</div>
      </div>

      {/* Today's punches */}
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 24px 40px' }}>
        <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: '10px' }}>Today at this station</div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
          {today.length === 0 ? (
            <div style={{ padding: '18px', color: '#64748b', fontSize: '14px' }}>No scans yet today.</div>
          ) : today.slice(0, 5).map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #0f172a' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <StationAvatar src={r.photo_url} name={r.full_name} size={36} />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>{r.full_name}</span>
                  {r.position ? <span style={{ fontSize: '12px', color: '#94a3b8' }}>{r.position}</span> : null}
                </span>
              </span>
              <span style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 10px', borderRadius: '999px', background: r.punch_type === 'in' ? '#065f46' : '#1e40af' }}>{r.punch_type === 'in' ? 'IN' : 'OUT'}</span>
                <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(r.punched_at)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Big confirmation flash */}
      <div style={flashStyle()}>
        {flash && (
          <>
            {flash.name ? <div style={{ marginBottom: '20px' }}><StationAvatar src={flash.photo} name={flash.name} size={220} /></div> : null}
            <div style={{ fontSize: 'min(12vw, 84px)', fontWeight: 800, lineHeight: 1 }}>
              {flash.kind === 'in' ? '✓ Time In' : flash.kind === 'out' ? '✓ Time Out' : flash.kind === 'error' ? '✕' : '•'}
            </div>
            {flash.name ? <div style={{ fontSize: 'min(7vw, 44px)', fontWeight: 700, marginTop: '14px' }}>{flash.name}</div> : null}
            {flash.position ? <div style={{ fontSize: 'min(3.2vw, 22px)', color: '#e2e8f0', opacity: 0.8, marginTop: '6px' }}>{flash.position}</div> : null}
            {flash.time ? <div style={{ fontSize: '28px', color: '#e2e8f0', marginTop: '8px', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(flash.time)}</div> : null}
            {flash.message ? <div style={{ fontSize: '22px', color: '#e2e8f0', marginTop: '12px', maxWidth: '680px' }}>{flash.message}</div> : null}
          </>
        )}
      </div>
    </div>
  );
}
