import { useState } from 'react';
import { createPurchaseOrder } from '../api/client';
import { Button } from './ui/button';
import { X } from 'lucide-react';
import { toast } from 'sonner';

interface CreatePOModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreatePOModal({ onClose, onCreated }: CreatePOModalProps) {
  const [form, setForm] = useState({
    poNumber: '',
    client: '',
    description: '',
    amount: '',
    deliveryDate: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.poNumber || !form.client || !form.description || !form.amount || !form.deliveryDate) {
      toast.error('All fields are required');
      return;
    }
    try {
      setLoading(true);
      await createPurchaseOrder({
        poNumber: form.poNumber,
        client: form.client,
        description: form.description,
        amount: parseFloat(form.amount),
        deliveryDate: form.deliveryDate,
        createdDate: new Date().toISOString().split('T')[0], // Add current date
      });
      toast.success('Purchase Order created successfully!');
      onCreated();
    } catch (err: any) {
      toast.error('Failed to create Purchase Order: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Purchase Order</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              PO Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.poNumber}
              onChange={e => setForm(f => ({ ...f, poNumber: e.target.value }))}
              placeholder="PO-2026-XXXX"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              readOnly
              style={{ backgroundColor: '#f8fafc', cursor: 'not-allowed' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Client <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.client}
              onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
              placeholder="Company Name"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Project details..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Amount (PHP) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0"
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Delivery Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.deliveryDate}
              onChange={e => setForm(f => ({ ...f, deliveryDate: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
              {loading ? 'Creating...' : 'Create Purchase Order'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
