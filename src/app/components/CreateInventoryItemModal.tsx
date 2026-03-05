import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../api/client';

interface CreateInventoryItemModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateInventoryItemModal({ onClose, onCreated }: CreateInventoryItemModalProps) {
  const generateItemCode = () => {
    const prefix = 'ITM';
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}-${timestamp}`;
  };

  const [form, setForm] = useState({
    itemCode: generateItemCode(),
    itemName: '',
    description: '',
    quantity: 0,
    unit: 'pcs',
    location: '',
    supplier: '',
    unitCost: 0,
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.itemName || !form.location) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (form.quantity < 0 || form.unitCost < 0) {
      toast.error('Quantity and unit cost must be positive numbers');
      return;
    }

    try {
      setLoading(true);
      
      await fetchApi('/inventory', {
        method: 'POST',
        body: JSON.stringify({
          itemCode: form.itemCode,
          itemName: form.itemName,
          description: form.description,
          quantity: form.quantity,
          unit: form.unit,
          location: form.location,
          supplier: form.supplier,
          unitCost: form.unitCost,
        }),
      });

      toast.success('Inventory item created successfully!');
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error('Failed to create inventory item: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Add Inventory Item</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {/* Item Code and Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">Item Code</Label>
                <Input
                  value={form.itemCode}
                  disabled
                  className="bg-slate-50 text-slate-500"
                  placeholder="Auto-generated"
                />
              </div>
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">Item Name *</Label>
                <Input
                  value={form.itemName}
                  onChange={(e) => setForm({ ...form, itemName: e.target.value })}
                  placeholder="e.g., Office Chair"
                  className="w-full"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <Label className="block text-sm font-medium text-slate-700 mb-1">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Enter item description"
                rows={3}
                className="w-full"
              />
            </div>

            {/* Quantity and Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</Label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  min="0"
                  className="w-full"
                />
              </div>
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">Unit</Label>
                <Select value={form.unit} onValueChange={(value) => setForm({ ...form, unit: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">Pieces</SelectItem>
                    <SelectItem value="box">Box</SelectItem>
                    <SelectItem value="kg">Kilograms</SelectItem>
                    <SelectItem value="liters">Liters</SelectItem>
                    <SelectItem value="meters">Meters</SelectItem>
                    <SelectItem value="sets">Sets</SelectItem>
                    <SelectItem value="units">Units</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Location and Supplier */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">Location *</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g., Warehouse A, Shelf 1"
                  className="w-full"
                />
              </div>
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">Supplier</Label>
                <Input
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                  placeholder="e.g., Office Supplies Inc."
                  className="w-full"
                />
              </div>
            </div>

            {/* Unit Cost */}
            <div>
              <Label className="block text-sm font-medium text-slate-700 mb-1">Unit Cost</Label>
              <Input
                type="number"
                value={form.unitCost}
                onChange={(e) => setForm({ ...form, unitCost: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full"
              />
            </div>

            {/* Total Value Display */}
            <div className="bg-slate-50 p-3 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Total Value:</span>
                <span className="font-semibold text-slate-900">
                  ₱{(form.quantity * form.unitCost).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-6 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
              {loading ? 'Adding...' : 'Add Item'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
