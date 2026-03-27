import { useState, useEffect } from 'react';
import { fetchApi, createPurchaseOrder } from '../api/client';
import { Button } from './ui/button';
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

  // Company info constants (same as SO form)
  const COMPANY_INFO = {
    name: 'KIMOEL TRADING & CONSTRUCTION INCORPORATED',
    address: 'PUROK 1, LODLOD, LIPA CITY, BATANGAS',
    tel: '(043) - 741 - 2023',
    email: 'kimoel_leotagle@yahoo.com',
    owner: 'LEO TAGLE',
    ownerMobile: '0917 - 628 - 3217',
  };

  const [form, setForm] = useState({
    poNumber: `KTCI-PO-${new Date().getFullYear()}-0001`,
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
    vatType: 'vatable' as 'vatable' | 'non-vatable',
    vatAmount: 0,
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', no: 1, description: '', quantity: 1, unit: 'Lot', unitCost: 0, amount: 0 }
  ]);

  const [loading, setLoading] = useState(false);

  // Auto-generate PO number on mount
  useEffect(() => {
    const generatePONumber = async () => {
      try {
        const currentYear = new Date().getFullYear();
        const orders = await fetchApi<any[]>('/purchase-orders') || [];
        const poOrders = orders.filter((o: any) => o.orderType !== 'sales');
        const lastPO = poOrders
          .filter((o: any) => o.poNumber && o.poNumber.startsWith(`KTCI-PO-${currentYear}-`))
          .sort((a: any, b: any) => b.poNumber.localeCompare(a.poNumber))[0];
        let counter = 1;
        if (lastPO) {
          const lastNumber = lastPO.poNumber.split('-')[3];
          counter = parseInt(lastNumber) + 1;
        }
        const poNumber = `KTCI-PO-${currentYear}-${counter.toString().padStart(4, '0')}`;
        setForm(prev => ({ ...prev, poNumber }));
      } catch (error) {
        console.error('Failed to generate PO number:', error);
      }
    };
    generatePONumber();
  }, []);

  // Auto-fill today's date
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setForm(prev => ({ ...prev, poDate: today }));
  }, []);

  const calculateSubTotal = () => lineItems.reduce((sum, item) => sum + item.amount, 0);

  const calculateVATAmount = () => {
    if (form.vatType === 'vatable') {
      return (calculateSubTotal() + form.ewt) * 0.12;
    }
    return 0;
  };

  const calculateTotal = () => calculateSubTotal() + form.ewt + calculateVATAmount();

  // Keep vatAmount in sync
  useEffect(() => {
    const vatAmount = calculateVATAmount();
    setForm(prev => ({ ...prev, vatAmount }));
  }, [lineItems, form.ewt, form.vatType]);

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => prev.map(item => {
      if (item.id === id) {
        // Convert string values to numbers properly
        const numValue = field === 'quantity' || field === 'unitCost' ? 
          (typeof value === 'string' ? parseFloat(value) || 0 : value) : value;
        
        const updated = { ...item, [field]: numValue };
        if (field === 'quantity' || field === 'unitCost') {
          updated.amount = Number(updated.quantity) * Number(updated.unitCost);
        }
        return updated;
      }
      return item;
    }));
  };

  const addLineItem = () => {
    setLineItems(prev => [...prev, {
      id: Date.now().toString(),
      no: prev.length + 1,
      description: '',
      quantity: 1,
      unit: 'Lot',
      unitCost: 0,
      amount: 0,
    }]);
  };

  const deleteLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(prev => {
        const filtered = prev.filter(item => item.id !== id);
        return filtered.map((item, index) => ({ ...item, no: index + 1 }));
      });
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
        customerName: form.vendorName,
        customerAddress: form.vendorAddress,
        customerContact: form.vendorContact,
        lineItems: legacyLineItems,
        subTotal: calculateSubTotal(),
        otherCharges: form.ewt,
        vatAmount: form.vatAmount,
        totalAmount: calculateTotal(),
        createdDate: new Date().toISOString().split('T')[0],
        status: 'pending',
        orderType: undefined,
      };

      await createPurchaseOrder(poData);
      toast.success('Purchase Order created successfully!');
      onCreated();
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
    } catch (err: any) {
      toast.error('Failed to create Purchase Order: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Create Purchase Order</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* ── A. OUR COMPANY INFORMATION (READ-ONLY) ── */}
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
            <h3 className="font-bold text-slate-900 mb-3 text-center">OUR COMPANY INFORMATION (BUYER)</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold">Company Name:</span>
                <div className="bg-white px-3 py-2 rounded border border-slate-300 mt-1">{COMPANY_INFO.name}</div>
              </div>
              <div>
                <span className="font-semibold">Company Address:</span>
                <div className="bg-white px-3 py-2 rounded border border-slate-300 mt-1">{COMPANY_INFO.address}</div>
              </div>
              <div>
                <span className="font-semibold">Contact:</span>
                <div className="bg-white px-3 py-2 rounded border border-slate-300 mt-1">
                  Tel: {COMPANY_INFO.tel}<br />Email: {COMPANY_INFO.email}
                </div>
              </div>
              <div>
                <span className="font-semibold">Company Owner / Approved By:</span>
                <div className="bg-white px-3 py-2 rounded border border-slate-300 mt-1">
                  {COMPANY_INFO.owner} (Mobile: {COMPANY_INFO.ownerMobile})
                </div>
              </div>
            </div>
          </div>

          {/* ── B. VENDOR INFORMATION ── */}
          <div className="border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-slate-900 mb-3">VENDOR INFORMATION</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Vendor Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.vendorName}
                  onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))}
                  placeholder="Vendor / supplier company name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Vendor Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.vendorAddress}
                  onChange={e => setForm(f => ({ ...f, vendorAddress: e.target.value }))}
                  placeholder="Vendor complete address"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vendor Contact</label>
                <input
                  type="text"
                  value={form.vendorContact}
                  onChange={e => setForm(f => ({ ...f, vendorContact: e.target.value }))}
                  placeholder="Vendor phone or email (optional)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* ── C. PURCHASE ORDER DETAILS ── */}
          <div className="border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-slate-900 mb-3">PURCHASE ORDER DETAILS</h3>
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
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      value="domestic"
                      checked={form.poType === 'domestic'}
                      onChange={e => setForm(f => ({ ...f, poType: e.target.value as 'domestic' | 'foreign' }))}
                      className="mr-2"
                    />
                    Domestic
                  </label>
                  <label className="flex items-center cursor-pointer">
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  VAT Type <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      value="vatable"
                      checked={form.vatType === 'vatable'}
                      onChange={e => setForm(f => ({ ...f, vatType: e.target.value as 'vatable' | 'non-vatable' }))}
                      className="mr-2"
                    />
                    Vatable
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      value="non-vatable"
                      checked={form.vatType === 'non-vatable'}
                      onChange={e => setForm(f => ({ ...f, vatType: e.target.value as 'vatable' | 'non-vatable' }))}
                      className="mr-2"
                    />
                    Non-Vatable
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* ── D. LINE ITEMS TABLE ── */}
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
                    <th className="border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 w-10">No.</th>
                    <th className="border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 text-left">Description</th>
                    <th className="border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 w-20">Quantity</th>
                    <th className="border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 w-20">Unit</th>
                    <th className="border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 w-28">Unit Cost</th>
                    <th className="border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 w-28 text-right">Amount</th>
                    <th className="border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="border border-slate-300 px-2 py-1 text-xs text-center text-slate-600">{item.no}</td>
                      <td className="border border-slate-300 px-2 py-1">
                        <input
                          type="text"
                          value={item.description}
                          onChange={e => updateLineItem(item.id, 'description', e.target.value)}
                          className="w-full px-1 py-1 text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                          placeholder="Item description"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-1">
                        <input
                          type="number"
                          value={item.quantity || ''}
                          onChange={e => updateLineItem(item.id, 'quantity', e.target.value)}
                          className="w-full px-1 py-1 text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400 rounded text-center"
                          min="1"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-1">
                        <input
                          type="text"
                          value={item.unit}
                          onChange={e => updateLineItem(item.id, 'unit', e.target.value)}
                          className="w-full px-1 py-1 text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400 rounded text-center"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-1">
                        <input
                          type="number"
                          value={item.unitCost || ''}
                          onChange={e => updateLineItem(item.id, 'unitCost', e.target.value)}
                          className="w-full px-1 py-1 text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400 rounded text-right"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-sm text-right font-medium">
                        ₱{item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => deleteLineItem(item.id)}
                          disabled={lineItems.length === 1}
                          className="text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── E. TOTALS SECTION ── */}
          <div className="border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-slate-900 mb-3">TOTALS</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sub Total</label>
                <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-900 text-sm font-medium">
                  ₱{calculateSubTotal().toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">EWT</label>
                <input
                  type="number"
                  value={form.ewt}
                  onChange={e => setForm(f => ({ ...f, ewt: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="0.01"
                />
              </div>
              {form.vatType === 'vatable' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">VAT Amount (12%)</label>
                  <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-900 text-sm font-medium">
                    ₱{calculateVATAmount().toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Amount</label>
                <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-blue-50 text-blue-900 text-sm font-bold border-blue-200">
                  ₱{calculateTotal().toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {/* ── F. TERMS & CONDITIONS ── */}
          <div className="border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-slate-900 mb-3">TERMS &amp; CONDITIONS</h3>
            <textarea
              value={form.termsAndConditions}
              onChange={e => setForm(f => ({ ...f, termsAndConditions: e.target.value }))}
              rows={5}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* ── G. APPROVAL SECTION ── */}
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

          {/* ── FORM ACTIONS ── */}
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
