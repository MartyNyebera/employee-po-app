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

export function ReceivingModal({
  title = 'Mark Delivered',
  confirmLabel = 'Mark Delivered',
  subtitle,
  initialNotes,
  onSave,
  onClose,
  onDone,
}: {
  title?: string;
  confirmLabel?: string;
  subtitle: string;
  initialNotes?: string | null;
  onSave: (receivedBy: string, notes: string | null) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState(initialNotes || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!receivedBy.trim()) { toast.error('Who received it?'); return; }
    setSaving(true);
    try {
      await onSave(receivedBy.trim(), notes.trim() || null);
      onDone();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Received by <span className="text-red-500">*</span></label>
            <input value={receivedBy} onChange={e => setReceivedBy(e.target.value)} placeholder="Name of the person who received it" className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={input} />
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
