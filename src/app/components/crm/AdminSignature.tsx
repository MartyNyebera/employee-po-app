import { useEffect, useRef, useState } from 'react';
import { Eraser, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../../api/client';
import { S } from './crmKit';

// The admin's own e-signature, saved to their `users` row. Unlike the six portal accounts,
// the admin dashboard had no signature screen at all — so the "Approved By" block on a
// printed purchase request had nothing to stamp.
//
// The signature is resolved LIVE at print time (via purchase_requests.verified_by_id →
// users.signature), not snapshotted at verify time. That means saving one here retroactively
// stamps every request this admin has already verified, which is the whole point: without it,
// anything verified before the signature existed would print unsigned forever.
//
// NOTE: this is the 7th copy of this canvas pad (each portal has its own, bound to its own
// authed fetch). Worth collapsing into one component that takes a save callback.
export function AdminSignature() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const ctx = () => canvasRef.current?.getContext('2d') || null;

  useEffect(() => {
    fetchApi<{ signature: string | null }>('/admin/signature')
      .then(r => setSaved(r.signature))
      .catch(() => toast.error('Failed to load your signature'))
      .finally(() => setLoading(false));
  }, []);

  // Re-seed the canvas whenever the saved signature arrives, so an existing one can be
  // touched up rather than redrawn from scratch.
  useEffect(() => {
    if (loading) return;
    const c = canvasRef.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000000';
    if (saved) { const img = new Image(); img.onload = () => g.drawImage(img, 0, 0, c.width, c.height); img.src = saved; }
  }, [saved, loading]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (c.width / rect.width), y: (e.clientY - rect.top) * (c.height / rect.height) };
  };
  const down = (e: React.PointerEvent) => { const g = ctx(); if (!g) return; drawing.current = true; const p = pos(e); g.beginPath(); g.moveTo(p.x, p.y); (e.target as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const g = ctx(); if (!g) return; const p = pos(e); g.lineTo(p.x, p.y); g.stroke(); setDirty(true); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canvasRef.current; const g = ctx(); if (c && g) g.clearRect(0, 0, c.width, c.height); setDirty(true); };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { toast.error('Upload a PNG or JPEG image'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const c = canvasRef.current; const g = ctx(); if (!c || !g) return;
      const img = new Image();
      img.onload = () => { g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); setDirty(true); };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const save = async () => {
    const c = canvasRef.current; if (!c) return;
    const data = c.toDataURL('image/png');
    setSaving(true);
    try {
      const res = await fetchApi<{ signature: string }>('/admin/signature', { method: 'PUT', body: JSON.stringify({ signature: data }) });
      setSaved(res.signature);
      setDirty(false);
      toast.success('Signature saved');
    } catch (err: any) { toast.error(err.message || 'Failed to save signature'); } finally { setSaving(false); }
  };

  return (
    <div style={S.page}>
      <h1 style={S.h1}>My Signature</h1>
      <p style={S.sub}>
        Stamped on the <strong>Approved By</strong> block of every purchase request you verify —
        including ones you have already verified.
      </p>

      <div style={{ ...S.card, padding: '20px', marginTop: '24px', maxWidth: '620px' }}>
        {loading ? <p style={{ fontSize: '14px', color: '#8a8a8a' }}>Loading…</p> : (
          <>
            <div style={{ border: '1px dashed #d6d6d6', borderRadius: '8px', background: '#fff' }}>
              <canvas ref={canvasRef} width={560} height={200}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
                style={{ width: '100%', height: 200, touchAction: 'none', borderRadius: '8px', cursor: 'crosshair' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
              <button className="crm-row-btn" style={{ ...S.rowBtn, marginLeft: 0, display: 'inline-flex', alignItems: 'center', gap: '5px' }} onClick={clear}>
                <Eraser size={13} /> Clear
              </button>
              <label className="crm-row-btn" style={{ ...S.rowBtn, marginLeft: 0, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Upload size={13} /> Upload image
                <input type="file" accept="image/png,image/jpeg" onChange={onUpload} style={{ display: 'none' }} />
              </label>
              <button onClick={save} disabled={saving || !dirty}
                style={{ ...S.addBtn, marginLeft: 'auto', color: '#ffffff', opacity: saving || !dirty ? 0.5 : 1, cursor: saving || !dirty ? 'default' : 'pointer' }}>
                {saving ? 'Saving…' : 'Save signature'}
              </button>
            </div>
          </>
        )}
      </div>

      {saved && (
        <div style={{ ...S.card, padding: '20px', marginTop: '16px', maxWidth: '620px' }}>
          <div style={S.label}>Currently saved</div>
          <img src={saved} alt="Saved signature" style={{ maxHeight: '96px', objectFit: 'contain', border: '1px solid #e6e6e6', borderRadius: '6px', background: '#fff' }} />
        </div>
      )}
    </div>
  );
}
