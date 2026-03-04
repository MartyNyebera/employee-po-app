import { useState } from 'react';
import { createPurchaseOrder } from '../api/client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface LineItem {
  id: string;
  no: number;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  amount: number;
}

interface CreatePurchaseOrderModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreatePurchaseOrderModal({ onClose, onCreated }: CreatePurchaseOrderModalProps) {
  const [form, setForm] = useState({
    poNumber: `KTCI-${new Date().getFullYear()}-0001`,
    poDate: new Date().toISOString().split('T')[0],
    deliveryDate: '',
    poType: 'domestic' as 'domestic' | 'foreign',
    paymentTerms: '30 days from receipt/acceptance',
    termsAndConditions: `1. Prices quoted are firm and valid for 30 days from PO date.\n2. Delivery shall be made to the specified address within the agreed timeframe.\n3. Materials shall conform to specifications and quality standards.\n4. Payment shall be made within 30 days from receipt and acceptance of materials.\n5. This PO is governed by the laws of the Republic of the Philippines.`,
    preparedBy: '',
    reviewedBy: '',
    vendorName: '',
    vendorAddress: '',
    vendorContact: '',
    ewt: 0,
    vatAmount: 0,
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: '1',
      no: 1,
      description: '',
      quantity: 1,
      unit: 'pcs',
      unitCost: 0,
      amount: 0,
    }
  ]);

  const [loading, setLoading] = useState(false);

  const calculateSubTotal = () => {
    return lineItems.reduce((sum, item) => sum + item.amount, 0);
  };

  const calculateTotal = () => {
    const subTotal = calculateSubTotal();
    const vat = subTotal * 0.12; // 12% VAT
    const ewt = subTotal * 0.02; // 2% EWT
    return subTotal + vat - ewt;
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(items => items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitCost') {
          updated.amount = updated.quantity * updated.unitCost;
        }
        return updated;
      }
      return item;
    }));
  };

  const addLineItem = () => {
    const newNo = Math.max(...lineItems.map(item => item.no)) + 1;
    setLineItems([...lineItems, {
      id: Date.now().toString(),
      no: newNo,
      description: '',
      quantity: 1,
      unit: 'pcs',
      unitCost: 0,
      amount: 0,
    }]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter(item => item.id !== id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.vendorName || !form.vendorAddress || !form.deliveryDate || !form.preparedBy) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (lineItems.some(item => !item.description || item.unitCost <= 0)) {
      toast.error('Please fill in description and unit cost for all line items');
      return;
    }

    try {
      setLoading(true);
      
      // Convert line items to old format for API compatibility
      const legacyLineItems = lineItems.map(item => ({
        id: item.id,
        no: item.no,
        account: 'Materials',
        vendor: form.vendorName,
        quantity: item.quantity,
        unit: item.unit,
        description: item.description,
        unitPrice: item.unitCost,
        amount: item.amount,
      }));
      
      const poData = {
        poNumber: form.poNumber,
        poDate: form.poDate,
        deliveryDate: form.deliveryDate,
        poType: form.poType,
        paymentTerms: form.paymentTerms,
        termsAndConditions: form.termsAndConditions,
        preparedBy: form.preparedBy,
        reviewedBy: form.reviewedBy,
        customerName: form.vendorName, // Use vendorName as customerName for API compatibility
        customerAddress: form.vendorAddress,
        customerContact: form.vendorContact,
        lineItems: legacyLineItems,
        subTotal: calculateSubTotal(),
        otherCharges: form.ewt,
        vatAmount: form.vatAmount,
        totalAmount: calculateTotal(),
        createdDate: new Date().toISOString().split('T')[0],
        status: 'pending', // Purchase Order starts as pending
        orderType: undefined, // Explicitly undefined for Purchase Orders
      };

      await createPurchaseOrder(poData);
      toast.success('Purchase Order created successfully!');
      onCreated();
      
      // Trigger Overview refresh
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
    } catch (err: any) {
      toast.error('Failed to create Purchase Order: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Create Purchase Order</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            {/* PO Details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">PO Number *</Label>
                <Input
                  value={form.poNumber}
                  onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">PO Date *</Label>
                <Input
                  type="date"
                  value={form.poDate}
                  onChange={(e) => setForm({ ...form, poDate: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">Delivery Date *</Label>
                <Input
                  type="date"
                  value={form.deliveryDate}
                  onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">PO Type</Label>
                <Select value={form.poType} onValueChange={(value: 'domestic' | 'foreign') => setForm({ ...form, poType: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="domestic">Domestic</SelectItem>
                    <SelectItem value="foreign">Foreign</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Vendor Details */}
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-slate-900">Vendor Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-1">Vendor Name *</Label>
                  <Input
                    value={form.vendorName}
                    onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
                    placeholder="Enter vendor name"
                    className="w-full"
                  />
                </div>
                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-1">Contact</Label>
                  <Input
                    value={form.vendorContact}
                    onChange={(e) => setForm({ ...form, vendorContact: e.target.value })}
                    placeholder="Enter contact number"
                    className="w-full"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="block text-sm font-medium text-slate-700 mb-1">Vendor Address *</Label>
                  <Textarea
                    value={form.vendorAddress}
                    onChange={(e) => setForm({ ...form, vendorAddress: e.target.value })}
                    placeholder="Enter vendor address"
                    rows={2}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-md font-semibold text-slate-900">Line Items</h3>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="size-4 mr-1" />
                  Add Item
                </Button>
              </div>
              
              <div className="space-y-2">
                {lineItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="text-sm text-slate-600 font-medium">#{item.no}</div>
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                      className="col-span-4"
                    />
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="col-span-1"
                    />
                    <Input
                      placeholder="Unit"
                      value={item.unit}
                      onChange={(e) => updateLineItem(item.id, 'unit', e.target.value)}
                      className="col-span-1"
                    />
                    <Input
                      type="number"
                      placeholder="Unit Cost"
                      value={item.unitCost}
                      onChange={(e) => updateLineItem(item.id, 'unitCost', parseFloat(e.target.value) || 0)}
                      className="col-span-2"
                    />
                    <div className="text-sm text-slate-900 font-medium col-span-2">
                      ₱{item.amount.toFixed(2)}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeLineItem(item.id)}
                      disabled={lineItems.length === 1}
                      className="col-span-1"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span>Sub Total:</span>
                <span>₱{calculateSubTotal().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>VAT (12%):</span>
                <span>₱{(calculateSubTotal() * 0.12).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>EWT (2%):</span>
                <span>-₱{(calculateSubTotal() * 0.02).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                <span>Total:</span>
                <span>₱{calculateTotal().toFixed(2)}</span>
              </div>
            </div>

            {/* Signatories */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">Prepared By *</Label>
                <Input
                  value={form.preparedBy}
                  onChange={(e) => setForm({ ...form, preparedBy: e.target.value })}
                  placeholder="Enter name"
                  className="w-full"
                />
              </div>
              <div>
                <Label className="block text-sm font-medium text-slate-700 mb-1">Reviewed By</Label>
                <Input
                  value={form.reviewedBy}
                  onChange={(e) => setForm({ ...form, reviewedBy: e.target.value })}
                  placeholder="Enter name"
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-6 border-t">
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
