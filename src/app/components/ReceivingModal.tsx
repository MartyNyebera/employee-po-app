import { useState } from 'react';
import { PackageCheck, X } from 'lucide-react';
import { toast } from 'sonner';

// ============================================================================
// Shared "Mark Delivered / Received" modal (Section D — #10).
//
// One deliberate confirmation step for two flows that both need the same thing — a "received
// by" name, optional notes, and a save that may move stock or a delivery record:
//   • Warehouse — receiving an inbound purchase order (goods arriving from a supplier).
//   • Logistics — completing an outbound delivery (goods handed to a customer).
//
// It lived inside LogisticsPortal as `DeliveredModal`; extracting it here lets the warehouse
// receive without duplicating the form, and gives Section E a single place to add the per-line
// received/defective grid.
// ============================================================================

// Section E — #14: when `lines` is given (warehouse PO receiving), the modal shows a per-line
// grid — Ordered (read-only), Received, Defective — and reports the { received, defective } for
// each line back through onSave. Logistics (outbound delivery) passes no lines and just captures
// the received-by name + notes.
export interface ReceiveLineInput { description: string; ordered: number; unit?: string | null }
export interface ReceiveLineResult { description: string; received: number; defective: number }

export function ReceivingModal({
  title = 'Mark Delivered',
  confirmLabel = 'Mark Delivered',
  subtitle,
  initialNotes,
  lines,
  onSave,
  onClose,
  onDone,
}: {
  title?: string;
  confirmLabel?: string;
  subtitle: string;
  initialNotes?: string | null;
  lines?: ReceiveLineInput[];
  onSave: (receivedBy: string, notes: string | null, lines?: ReceiveLineResult[]) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState(initialNotes || '');
  const [saving, setSaving] = useState(false);
  // Per-line received/defective. Default: everything received, none defective.
  const [grid, setGrid] = useState<{ received: string; defective: string }[]>(
    () => (lines || []).map(l => ({ received: String(l.ordered), defective: '0' })),
  );

  const setCell = (i: number, key: 'received' | 'defective', v: string) =>
    setGrid(g => g.map((row, idx) => idx === i ? { ...row, [key]: v } : row));

  const save = async () => {
    if (!receivedBy.trim()) { toast.error('Who received it?'); return; }
    let lineResults: ReceiveLineResult[] | undefined;
    if (lines && lines.length) {
      lineResults = lines.map((l, i) => ({
        description: l.description,
        received: Math.max(0, Number(grid[i]?.received) || 0),
        defective: Math.max(0, Number(grid[i]?.defective) || 0),
      }));
      for (let i = 0; i < lines.length; i++) {
        if (lineResults[i].defective > lineResults[i].received) {
          toast.error(`Defective can't exceed received for "${lines[i].description}"`); return;
        }
      }
    }
    setSaving(true);
    try {
      await onSave(receivedBy.trim(), notes.trim() || null, lineResults);
      onDone();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  const cell = 'w-16 px-2 py-1 text-sm text-center border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${lines && lines.length ? 'max-w-2xl' : 'max-w-md'} flex flex-col overflow-hidden max-h-[90vh]`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {lines && lines.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Items received</label>
              <p className="text-xs text-gray-400 mb-2">Enter how many actually arrived and how many are defective — only the usable ones (received − defective) are added to inventory.</p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-center">Ordered</th>
                      <th className="px-3 py-2 text-center">Received</th>
                      <th className="px-3 py-2 text-center">Defective</th>
                      <th className="px-3 py-2 text-center">Usable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const usable = Math.max(0, (Number(grid[i]?.received) || 0) - (Number(grid[i]?.defective) || 0));
                      const shortfall = usable < l.ordered;
                      return (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-800">{l.description}</td>
                          <td className="px-3 py-2 text-center text-gray-500">{l.ordered} {l.unit || ''}</td>
                          <td className="px-3 py-2 text-center"><input type="number" min="0" value={grid[i]?.received ?? ''} onChange={e => setCell(i, 'received', e.target.value)} className={cell} /></td>
                          <td className="px-3 py-2 text-center"><input type="number" min="0" value={grid[i]?.defective ?? ''} onChange={e => setCell(i, 'defective', e.target.value)} className={cell} /></td>
                          <td className={`px-3 py-2 text-center font-semibold ${shortfall ? 'text-amber-600' : 'text-gray-800'}`}>{usable}{shortfall ? ` (short ${l.ordered - usable})` : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Received by <span className="text-red-500">*</span></label>
            <input value={receivedBy} onChange={e => setReceivedBy(e.target.value)} placeholder="Name of the person who received it" className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={input} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"><PackageCheck className="w-4 h-4" /> {saving ? 'Saving…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
