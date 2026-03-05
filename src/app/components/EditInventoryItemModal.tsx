import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../api/client';

interface EditInventoryItemModalProps {
  item: {
    id: string;
    itemCode: string;
    itemName: string;
    description: string;
    quantity: number;
    unit: string;
    location: string;
    supplier: string;
    unitCost: number;
  };
  onClose: () => void;
  onUpdated: () => void;
}

export function EditInventoryItemModal({ item, onClose, onUpdated }: EditInventoryItemModalProps) {
  const [form, setForm] = useState({
    itemName: item.itemName,
    description: item.description,
    quantity: item.quantity.toString(),
    unit: item.unit,
    location: item.location,
    supplier: item.supplier || '',
    unitCost: item.unitCost ? item.unitCost.toString() : '',
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.itemName || !form.location) {
      toast.error('Please fill in all required fields');
      return;
    }

    const quantity = parseFloat(form.quantity) || 0;
    const unitCost = parseFloat(form.unitCost) || 0;
    
    if (quantity < 0 || unitCost < 0) {
      toast.error('Quantity and unit cost must be positive numbers');
      return;
    }

    try {
      setLoading(true);
      
      await fetchApi(`/inventory/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          itemName: form.itemName,
          description: form.description,
          quantity: quantity,
          unit: form.unit,
          location: form.location,
          supplier: form.supplier,
          unitCost: unitCost,
        }),
      });

      toast.success('Inventory item updated successfully!');
      onUpdated();
      onClose();
    } catch (err: any) {
      toast.error('Failed to update inventory item: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Edit Inventory Item</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {/* Item Code (read-only) and Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">Item Code</Label>
                <Input
                  value={item.itemCode}
                  disabled
                  className="bg-slate-50 text-slate-500"
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
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
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
                onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
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
                  ₱{((parseFloat(form.quantity) || 0) * (parseFloat(form.unitCost) || 0)).toFixed(2)}
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
              {loading ? 'Updating...' : 'Update Item'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
