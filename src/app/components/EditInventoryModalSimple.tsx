import { useState, useEffect } from 'react';
import { X, Package, Save } from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../api/client';
import { allowedUnitsForName } from '../lib/inventoryUnits';

interface EditInventoryModalSimpleProps {
  isOpen: boolean;
  onClose: () => void;
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
  onSuccess: () => void;
}

export function EditInventoryModalSimple({ isOpen, onClose, item, onSuccess }: EditInventoryModalSimpleProps) {
  const [formData, setFormData] = useState({
    itemName: item.itemName,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    location: item.location,
    supplier: item.supplier,
    unitCost: item.unitCost
  });
  const [loading, setLoading] = useState(false);

  // The item name (type) decides the Unit choices. When a rule matches, Unit becomes a dropdown
  // limited to those units; otherwise it stays free text. If the current unit isn't allowed, snap to
  // the first allowed unit.
  const allowedUnits = allowedUnitsForName(formData.itemName);
  useEffect(() => {
    const a = allowedUnitsForName(formData.itemName);
    if (a && !a.includes(formData.unit)) setFormData(prev => ({ ...prev, unit: a[0] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.itemName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.itemName.trim()) {
      toast.error('Item name is required');
      return;
    }
    
    if (formData.quantity < 0) {
      toast.error('Quantity cannot be negative');
      return;
    }

    setLoading(true);
    
    try {
      await fetchApi(`/inventory/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(formData)
      });
      
      toast.success('Inventory item updated successfully');
      onSuccess();
      onClose();
      
    } catch (error: any) {
      console.error('Update error:', error);
      toast.error(error.message || 'Failed to update inventory item');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      {/* Flex column capped at the viewport: header + footer stay pinned, the body scrolls. */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header (pinned) */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Edit Inventory Item</h2>
              <p className="text-sm text-gray-500">Update item information</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form: flex column so the fields scroll and the footer stays pinned. min-h-0 lets the
            scroll area shrink within the flex parent. */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* Scrollable body */}
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Item Code (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Item Code
            </label>
            <input
              type="text"
              value={item.itemCode}
              disabled
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
              readOnly
            />
          </div>

          {/* Item Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Item Name *
            </label>
            <input
              type="text"
              value={formData.itemName}
              onChange={(e) => handleChange('itemName', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter item name"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter description"
              rows={3}
            />
          </div>

          {/* Quantity (with unit suffix) and Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quantity
              </label>
              {/* The suffix mirrors the item's Unit so the quantity reads clearly as its unit —
                  e.g. "120 mm". Change the Unit field and this follows it. When Unit is blank we
                  show no suffix (a unit-less item is more likely a plain count than millimeters). */}
              <div className="relative">
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => handleChange('quantity', parseFloat(e.target.value) || 0)}
                  className={`w-full pl-4 ${formData.unit ? 'pr-14' : 'pr-4'} py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
                {formData.unit ? (
                  <span className="absolute inset-y-0 right-3 flex items-center text-sm text-gray-400 pointer-events-none">
                    {formData.unit}
                  </span>
                ) : null}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unit
              </label>
              {allowedUnits ? (
                <select
                  value={formData.unit}
                  onChange={(e) => handleChange('unit', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {allowedUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.unit}
                  onChange={(e) => handleChange('unit', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="mm, pcs, kg…"
                />
              )}
            </div>
          </div>

          {/* Location + Supplier */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => handleChange('location', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Warehouse, Shelf, etc."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Supplier
              </label>
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => handleChange('supplier', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Supplier name"
              />
            </div>
          </div>

          {/* Unit Cost (peso) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Unit Cost
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-sm text-gray-400 pointer-events-none">₱</span>
              <input
                type="number"
                value={formData.unitCost}
                onChange={(e) => handleChange('unitCost', parseFloat(e.target.value) || 0)}
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
          </div>
          </div>{/* end scrollable body */}

          {/* Actions (pinned footer) */}
          <div className="flex gap-3 p-6 border-t border-gray-200 bg-white shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />
                  Save Changes
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
