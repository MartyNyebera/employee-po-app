import { useState, useEffect } from 'react';
import { createPurchaseOrder } from '../api/client';
import { Button } from './ui/button';
import { X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface LineItem {
  id: string;
  no: number;
  account: string;
  vendor: string;
  quantity: number;
  unit: string;
  description: string;
  unitPrice: number;
  amount: number;
}

interface CreatePOModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreatePOModal({ onClose, onCreated }: CreatePOModalProps) {
  const [form, setForm] = useState({
    poNumber: 'KTCI-2026-0001',
    poDate: '',
    deliveryDate: '',
    poType: 'domestic' as 'domestic' | 'foreign',
    paymentTerms: '30 days from receipt/acceptance',
    termsAndConditions: `1. Prices quoted are firm and valid for 30 days from PO date.\n2. Delivery shall be made to the specified address within the agreed timeframe.\n3. Materials shall conform to specifications and quality standards.\n4. Payment shall be made within 30 days from receipt and acceptance of materials.\n5. This PO is governed by the laws of the Republic of the Philippines.`,
    preparedBy: '',
    reviewedBy: '',
    customerName: '',
    customerAddress: '',
    customerContact: '',
    otherCharges: 0,
    vatAmount: 0,
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: '1',
      no: 1,
      account: 'Materials',
      vendor: '',
      quantity: 1,
      unit: 'Lot',
      description: '',
      unitPrice: 0,
      amount: 0,
    }
  ]);

  const [loading, setLoading] = useState(false);

  // Company info constants
  const COMPANY_INFO = {
    name: 'KIMOEL TRADING & CONSTRUCTION INCORPORATED',
    address: 'PUROK 1, LODLOD, LIPA CITY, BATANGAS',
    tel: '(043) - 741 - 2023',
    email: 'kimoel_leotagle@yahoo.com',
    owner: 'LEO TAGLE',
    ownerMobile: '0917 - 628 - 3217',
  };

  // Auto-generate PO number on component mount
  useEffect(() => {
    const generatePONumber = async () => {
      try {
        const currentYear = new Date().getFullYear();
        const response = await fetch('/api/purchase-orders');
        const orders = await response.json();
        const lastPO = orders
          .filter((order: any) => order.poNumber.startsWith(`KTCI-${currentYear}-`))
          .sort((a: any, b: any) => b.poNumber.localeCompare(a.poNumber))[0];
        
        let counter = 1;
        if (lastPO) {
          const lastNumber = lastPO.poNumber.split('-')[2];
          counter = parseInt(lastNumber) + 1;
        }
        
        const poNumber = `KTCI-${currentYear}-${counter.toString().padStart(4, '0')}`;
        setForm(prev => ({ ...prev, poNumber }));
      } catch (error) {
        console.error('Failed to generate PO number:', error);
      }
    };
    
    generatePONumber();
  }, []);

  // Auto-fill current date
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setForm(prev => ({ ...prev, poDate: today }));
  }, []);

  // Calculate totals
  const calculateSubTotal = () => {
    return lineItems.reduce((sum, item) => sum + item.amount, 0);
  };

  const calculateTotal = () => {
    return calculateSubTotal() + form.otherCharges + form.vatAmount;
  };

  // Update line item amount when quantity or unit price changes
  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        // Recalculate amount if quantity or unit price changed
        if (field === 'quantity' || field === 'unitPrice') {
          updated.amount = Number(updated.quantity) * Number(updated.unitPrice);
        }
        // Update vendor if not set
        if (field === 'description' && !updated.vendor && form.customerName) {
          updated.vendor = form.customerName;
        }
        return updated;
      }
      return item;
    }));
  };

  // Add new line item
  const addLineItem = () => {
    const newItem: LineItem = {
      id: Date.now().toString(),
      no: lineItems.length + 1,
      account: 'Materials',
      vendor: form.customerName,
      quantity: 1,
      unit: 'Lot',
      description: '',
      unitPrice: 0,
      amount: 0,
    };
    setLineItems(prev => [...prev, newItem]);
  };

  // Delete line item
  const deleteLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(prev => prev.filter(item => item.id !== id));
      // Renumber items
      setLineItems(prev => prev.map((item, index) => ({ ...item, no: index + 1 })));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.customerName || !form.customerAddress || !form.deliveryDate || !form.preparedBy) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (lineItems.some(item => !item.description || item.unitPrice <= 0)) {
      toast.error('Please fill in description and unit price for all line items');
      return;
    }

    try {
      setLoading(true);
      
      const poData = {
        poNumber: form.poNumber,
        poDate: form.poDate,
        deliveryDate: form.deliveryDate,
        poType: form.poType,
        paymentTerms: form.paymentTerms,
        termsAndConditions: form.termsAndConditions,
        preparedBy: form.preparedBy,
        reviewedBy: form.reviewedBy,
        customerName: form.customerName,
        customerAddress: form.customerAddress,
        customerContact: form.customerContact,
        lineItems: lineItems,
        subTotal: calculateSubTotal(),
        otherCharges: form.otherCharges,
        vatAmount: form.vatAmount,
        totalAmount: calculateTotal(),
        createdDate: new Date().toISOString().split('T')[0],
      };

      await createPurchaseOrder(poData);
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Create Purchase Order</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* A. COMPANY INFORMATION SECTION (READ-ONLY) */}
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
            <h3 className="font-bold text-slate-900 mb-3 text-center">OUR COMPANY INFORMATION (SUPPLIER)</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold">Supplier Name:</span>
                <div className="bg-white px-3 py-2 rounded border border-slate-300">{COMPANY_INFO.name}</div>
              </div>
              <div>
                <span className="font-semibold">Supplier Address:</span>
                <div className="bg-white px-3 py-2 rounded border border-slate-300">{COMPANY_INFO.address}</div>
              </div>
              <div>
                <span className="font-semibold">Contact:</span>
                <div className="bg-white px-3 py-2 rounded border border-slate-300">
                  Tel: {COMPANY_INFO.tel}<br/>
                  Email: {COMPANY_INFO.email}
                </div>
              </div>
              <div>
                <span className="font-semibold">Company Owner/Approved By:</span>
                <div className="bg-white px-3 py-2 rounded border border-slate-300">
                  {COMPANY_INFO.owner} (Mobile: {COMPANY_INFO.ownerMobile})
                </div>
              </div>
            </div>
          </div>

          {/* B. CUSTOMER INFORMATION SECTION */}
          <div className="border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-slate-900 mb-3">CUSTOMER INFORMATION</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.customerName}
                  onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                  placeholder="Customer company name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Customer Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.customerAddress}
                  onChange={e => setForm(f => ({ ...f, customerAddress: e.target.value }))}
                  placeholder="Customer complete address"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Customer Contact
                </label>
                <input
                  type="text"
                  value={form.customerContact}
                  onChange={e => setForm(f => ({ ...f, customerContact: e.target.value }))}
                  placeholder="Customer phone or email"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* C. PO DETAILS SECTION */}
          <div className="border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-slate-900 mb-3">PO DETAILS</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  PO Number <span className="text-red-500">*</span>
                </label>
                <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-900 text-sm">
                  {form.poNumber || 'Generating...'}
                </div>
                <p className="text-xs text-slate-500 mt-1">Automatically generated</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  PO Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.poDate}
                  onChange={e => setForm(f => ({ ...f, poDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Delivery Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.deliveryDate}
                  onChange={e => setForm(f => ({ ...f, deliveryDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  PO Type <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="domestic"
                      checked={form.poType === 'domestic'}
                      onChange={e => setForm(f => ({ ...f, poType: e.target.value as 'domestic' | 'foreign' }))}
                      className="mr-2"
                    />
                    Domestic
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="foreign"
                      checked={form.poType === 'foreign'}
                      onChange={e => setForm(f => ({ ...f, poType: e.target.value as 'domestic' | 'foreign' }))}
                      className="mr-2"
                    />
                    Foreign
                  </label>
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Payment Terms <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.paymentTerms}
                  onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))}
                  placeholder="e.g., 30 days from receipt/acceptance"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* D. LINE ITEMS TABLE */}
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-900">LINE ITEMS</h3>
              <Button type="button" onClick={addLineItem} className="flex items-center gap-2">
                <Plus className="size-4" />
                Add Item
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-300 px-2 py-1 text-xs font-medium">No.</th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-medium">Account</th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-medium">Vendor</th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-medium">Quantity</th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-medium">Unit</th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-medium">Description</th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-medium">Unit Price</th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-medium">Amount</th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="border border-slate-300 px-2 py-1 text-xs">{item.no}</td>
                      <td className="border border-slate-300 px-2 py-1">
                        <input
                          type="text"
                          value={item.account}
                          onChange={e => updateLineItem(item.id, 'account', e.target.value)}
                          className="w-full px-1 py-0.5 text-xs border-0 bg-transparent"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-1">
                        <input
                          type="text"
                          value={item.vendor}
                          onChange={e => updateLineItem(item.id, 'vendor', e.target.value)}
                          className="w-full px-1 py-0.5 text-xs border-0 bg-transparent"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-1">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateLineItem(item.id, 'quantity', Number(e.target.value))}
                          className="w-full px-1 py-0.5 text-xs border-0 bg-transparent"
                          min="1"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-1">
                        <input
                          type="text"
                          value={item.unit}
                          onChange={e => updateLineItem(item.id, 'unit', e.target.value)}
                          className="w-full px-1 py-0.5 text-xs border-0 bg-transparent"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-1">
                        <input
                          type="text"
                          value={item.description}
                          onChange={e => updateLineItem(item.id, 'description', e.target.value)}
                          className="w-full px-1 py-0.5 text-xs border-0 bg-transparent"
                          placeholder="Description"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-1">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={e => updateLineItem(item.id, 'unitPrice', Number(e.target.value))}
                          className="w-full px-1 py-0.5 text-xs border-0 bg-transparent text-right"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-xs text-right">
                        ₱{item.amount.toFixed(2)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center">
                        {lineItems.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteLineItem(item.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* E. TOTALS SECTION */}
          <div className="border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-slate-900 mb-3">TOTALS</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sub Total</label>
                <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-900 text-sm">
                  ₱{calculateSubTotal().toFixed(2)}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Other Charges</label>
                <input
                  type="number"
                  value={form.otherCharges}
                  onChange={e => setForm(f => ({ ...f, otherCharges: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">VAT Amount</label>
                <input
                  type="number"
                  value={form.vatAmount}
                  onChange={e => setForm(f => ({ ...f, vatAmount: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Amount</label>
                <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-900 text-sm font-bold">
                  ₱{calculateTotal().toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* F. TERMS & CONDITIONS SECTION */}
          <div className="border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-slate-900 mb-3">TERMS & CONDITIONS</h3>
            <textarea
              value={form.termsAndConditions}
              onChange={e => setForm(f => ({ ...f, termsAndConditions: e.target.value }))}
              rows={5}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* G. APPROVAL SECTION */}
          <div className="border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-slate-900 mb-3">APPROVAL SECTION</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Prepared By <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.preparedBy}
                  onChange={e => setForm(f => ({ ...f, preparedBy: e.target.value }))}
                  placeholder="Your name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reviewed By</label>
                <input
                  type="text"
                  value={form.reviewedBy}
                  onChange={e => setForm(f => ({ ...f, reviewedBy: e.target.value }))}
                  placeholder="Reviewer name (optional)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Approved By</label>
                <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-900 text-sm">
                  {COMPANY_INFO.owner}
                </div>
                <p className="text-xs text-slate-500 mt-1">Company Owner (Read-only)</p>
              </div>
            </div>
          </div>

          {/* Form Actions */}
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

/* Print Styles - Hide print button when printing */
const printStyles = `
@media print {
  .print-button {
    display: none !important;
  }
}
`;

// Inject print styles into document
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = printStyles;
  document.head.appendChild(styleSheet);
}
