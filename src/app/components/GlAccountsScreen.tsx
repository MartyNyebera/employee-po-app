// ============================================================================
// GL Accounts -- the short list of accounts an expense line can be coded to. A small settings list:
// add, rename, deactivate / reactivate. Nothing is computed here; GET /api/gl-accounts says how many
// expense lines use each one, and an account that any line uses cannot be deleted (the server refuses,
// and the button is not offered) -- deactivate it instead, which only stops it being offered on new
// lines. Existing lines keep their account either way.
// ============================================================================
import { useEffect, useState } from 'react';
import { Plus, Pencil, Check, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../lib/confirm';
import { S, TableScroll, tightTh, tightTd, pill } from './crm/crmKit';

type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;
interface Gl { id: number; name: string; active: boolean; linesUsing: number }

export function GlAccountsScreen({ api }: { api: Api }) {
  const [rows, setRows] = useState<Gl[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await api<Gl[]>('/gl-accounts')); }
    catch (e: any) { toast.error(e.message || 'Failed to load the GL accounts'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const add = async () => {
    if (!name.trim()) { toast.error('Enter a name for the GL account'); return; }
    setAdding(true);
    try {
      await api('/gl-accounts', { method: 'POST', body: JSON.stringify({ name }) });
      setName(''); toast.success('GL account added'); await load();
    } catch (e: any) { toast.error(e.message || 'Could not add the GL account'); } finally { setAdding(false); }
  };

  const patch = async (g: Gl, body: Record<string, unknown>, ok: string) => {
    setBusyId(g.id);
    try { await api(`/gl-accounts/${g.id}`, { method: 'PATCH', body: JSON.stringify(body) }); toast.success(ok); setEditId(null); await load(); }
    catch (e: any) { toast.error(e.message || 'Could not save the change'); } finally { setBusyId(null); }
  };

  const remove = async (g: Gl) => {
    if (!(await confirmDialog({ title: `Delete "${g.name}"?`, message: 'It is not used by any expense line. This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    setBusyId(g.id);
    try { await api(`/gl-accounts/${g.id}`, { method: 'DELETE' }); toast.success('GL account deleted'); await load(); }
    catch (e: any) { toast.error(e.message || 'Could not delete the GL account'); await load(); } finally { setBusyId(null); }
  };

  return (
    <div style={S.page}>
      <div style={{ marginBottom: '18px' }}>
        <h1 style={S.h1}>GL Accounts</h1>
        <p style={S.sub}>The accounts an expense line on a Disbursement Voucher can be coded to. An account that lines use can be renamed or deactivated, never deleted.</p>
      </div>

      <div style={{ ...S.card, padding: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px', overflow: 'visible' }}>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="New GL account, e.g. Fuel and Oil"
          onKeyDown={e => { if (e.key === 'Enter') add(); }} style={{ ...S.input, flex: '1 1 260px', width: 'auto' }} />
        <button onClick={add} disabled={adding} style={{ ...S.addBtn, opacity: adding ? 0.6 : 1 }}><Plus size={15} style={{ marginRight: '6px' }} />{adding ? 'Adding…' : 'Add GL account'}</button>
      </div>

      <TableScroll>
        <table style={S.table}>
          <thead><tr>
            <th style={tightTh}>GL Account</th>
            <th style={tightTh}>Status</th>
            <th style={{ ...tightTh, textAlign: 'right' }}>Expense lines using it</th>
            <th style={{ ...tightTh, textAlign: 'right', paddingRight: '16px' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={tightTd} colSpan={4}>Loading…</td></tr>
              : rows.length === 0 ? <tr><td style={{ ...tightTd, color: '#8a8a8a' }} colSpan={4}>No GL accounts yet.</td></tr>
              : rows.map(g => (
                <tr key={g.id} style={g.active ? undefined : { opacity: 0.6 }}>
                  <td style={{ ...tightTd, fontWeight: 600, color: '#000' }}>
                    {editId === g.id ? (
                      <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} maxLength={80}
                        onKeyDown={e => { if (e.key === 'Enter') patch(g, { name: editName }, 'Renamed'); if (e.key === 'Escape') setEditId(null); }}
                        style={{ ...S.input, padding: '6px 10px', maxWidth: '320px' }} />
                    ) : g.name}
                  </td>
                  <td style={{ ...tightTd, whiteSpace: 'nowrap' }}>{g.active ? pill('Active', 'good') : pill('Inactive', 'bad')}</td>
                  <td style={{ ...tightTd, textAlign: 'right' }}>{g.linesUsing}</td>
                  <td style={{ ...tightTd, whiteSpace: 'nowrap', textAlign: 'right', paddingRight: '16px' }}>
                    {editId === g.id ? (
                      <>
                        <button title="Save the new name" style={S.rowBtn} disabled={busyId === g.id} onClick={() => patch(g, { name: editName }, 'Renamed')}><Check size={14} /></button>
                        <button title="Cancel" style={S.rowBtn} onClick={() => setEditId(null)}><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <button title="Rename" style={S.rowBtn} disabled={busyId === g.id} onClick={() => { setEditId(g.id); setEditName(g.name); }}><Pencil size={13} /></button>
                        <button style={S.rowBtn} disabled={busyId === g.id} onClick={() => patch(g, { active: !g.active }, g.active ? 'Deactivated' : 'Reactivated')}>{g.active ? 'Deactivate' : 'Reactivate'}</button>
                        {g.linesUsing === 0 && (
                          <button title="Delete (only possible while no expense line uses it)" style={{ ...S.rowBtn, color: '#b91c1c' }} disabled={busyId === g.id} onClick={() => remove(g)}><Trash2 size={14} /></button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
