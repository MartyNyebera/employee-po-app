import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { FileText, Plus, ShoppingCart, Package, Edit, Trash2, Filter, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi, updatePurchaseOrder, deletePurchaseOrder } from '../api/client';
import { CreatePurchaseOrderModal } from './CreatePurchaseOrderModal';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  client: string;
  description: string;
  amount: number;
  status: 'pending' | 'approved' | 'RECEIVED';
  createdDate: string;
  deliveryDate: string;
  assignedAssets: string[];
}

interface PurchaseOrderListProps {
  isAdmin: boolean;
}

export function PurchaseOrderList({ isAdmin }: PurchaseOrderListProps) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    status: '',
    description: '',
  });

  const fetchPurchaseOrders = async () => {
    try {
      const data = await fetchApi<any[]>('/purchase-orders');
      const poData = (data || []).filter((item: any) => item.orderType !== 'sales');
      const transformedData = poData.map((po: any) => ({
        id: po.id,
        poNumber: po.poNumber || po.po_number,
        client: po.client,
        description: po.description || '',
        amount: parseFloat(po.amount) || 0,
        status: po.status || 'pending',
        createdDate: po.createdDate || po.created_date,
        deliveryDate: po.deliveryDate || po.delivery_date,
        assignedAssets: po.assignedAssets || []
      }));
      setPurchaseOrders(transformedData);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      toast.error('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 px-3 py-1 rounded-full font-medium text-xs">Pending</Badge>;
      case 'approved':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1 rounded-full font-medium text-xs">Approved</Badge>;
      case 'RECEIVED':
        return <Badge className="bg-green-50 text-green-700 border-green-200 px-3 py-1 rounded-full font-medium text-xs">Received</Badge>;
      default:
        return <Badge className="bg-gray-50 text-gray-700 border-gray-200 px-3 py-1 rounded-full font-medium text-xs">{status}</Badge>;
    }
  };

  const handleEditClick = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setEditForm({
      status: po.status,
      description: po.description,
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedPO) return;
    
    try {
      console.log('🔧 Updating PO:', selectedPO.id, 'with status:', editForm.status);
      const updated = await updatePurchaseOrder(selectedPO.id, { status: editForm.status, description: editForm.description });
      console.log('🔧 Updated PO response:', updated);
      console.log('🔧 New status from response:', updated.status);
      console.log('🔧 Status comparison - sent:', editForm.status, 'received:', updated.status);
      // Force immediate refresh by calling fetchPurchaseOrders
      await fetchPurchaseOrders();
      setIsEditing(false);
      toast.success('Purchase order updated successfully');
      
      // Trigger Overview refresh
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
    } catch (error) {
      console.error('Error updating purchase order:', error);
      toast.error('Failed to update purchase order');
    }
  };

  const handleDeletePO = async (po: PurchaseOrder) => {
    if (!confirm(`Are you sure you want to delete PO ${po.poNumber}? This action cannot be undone.`)) {
      return;
    }

    try {
      await deletePurchaseOrder(po.id);
      setPurchaseOrders(purchaseOrders.filter(p => p.id !== po.id));
      toast.success('Purchase order deleted successfully');
      setRefreshKey(prev => prev + 1);
      
      // Trigger Overview refresh
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      toast.error('Failed to delete purchase order');
    }
  };

  const handlePrintPO = (po: PurchaseOrder) => {
    // Create a professional print window with the same template as Sales Order
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print PO documents');
      return;
    }

    // Try to parse line items from description field (same as Sales Order)
    let lineItems = [];
    let supplierData = {
      name: po.client,
      address: '[Supplier Address]',
      contact: '[Supplier Contact]',
      preparedBy: '[Prepared By]',
      reviewedBy: '[Reviewed By]',
    };

    try {
      // Check if description contains JSON line items
      if (po.description.includes('Line Items:')) {
        const lineItemsMatch = po.description.match(/Line Items:\s*(\[.*?\])/);
        if (lineItemsMatch) {
          lineItems = JSON.parse(lineItemsMatch[1]);
        }
      }

      // Extract supplier data from description
      if (po.description.includes('Address:')) {
        supplierData.address = po.description.split('Address:')[1].split('\n')[0].trim();
      }
      if (po.description.includes('Contact:')) {
        supplierData.contact = po.description.split('Contact:')[1].split('\n')[0].trim();
      }
      if (po.description.includes('Prepared By:')) {
        supplierData.preparedBy = po.description.split('Prepared By:')[1].split('\n')[0].trim();
      }
      if (po.description.includes('Reviewed By:')) {
        supplierData.reviewedBy = po.description.split('Reviewed By:')[1].split('\n')[0].trim();
      }
    } catch (error) {
      console.error('Error parsing PO description:', error);
      // Fallback to single item if parsing fails
      lineItems = [{
        id: "1",
        no: 1,
        description: po.description.split('Line Items:')[0] || po.description,
        quantity: 1,
        unit: "Lot",
        unitPrice: po.amount,
        amount: po.amount
      }];
    }

    // If no line items found, create a default one
    if (lineItems.length === 0) {
      lineItems = [{
        id: "1",
        no: 1,
        description: po.description.split('Line Items:')[0] || po.description,
        quantity: 1,
        unit: "Lot",
        unitPrice: po.amount,
        amount: po.amount
      }];
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Order - ${po.poNumber}</title>
        <style>
          @page {
            margin: 0.5in;
            size: A4;
          }
          body {
            font-family: 'Times New Roman', serif;
            font-size: 11pt;
            line-height: 1.3;
            color: black;
            margin: 0;
            padding: 15px;
            background: white;
          }
          
          /* Header Section */
          .header-date {
            text-align: right;
            font-size: 9pt;
            margin-bottom: 5px;
          }
          .system-title {
            text-align: center;
            font-size: 10pt;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .company-name {
            text-align: center;
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 3px;
          }
          .company-address {
            text-align: center;
            font-size: 9pt;
            margin-bottom: 2px;
          }
          .contact-details {
            text-align: center;
            font-size: 8pt;
            margin-bottom: 2px;
          }
          .proprietor {
            text-align: center;
            font-size: 8pt;
            font-weight: bold;
            margin-bottom: 8px;
          }
          .document-title {
            text-align: center;
            font-size: 16pt;
            font-weight: bold;
            border: 2px solid black;
            padding: 8px;
            margin-bottom: 15px;
            background: white;
          }
          
          /* Info Boxes */
          .info-section {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
          }
          .info-box {
            flex: 1;
            border: 1px solid black;
            padding: 8px;
            min-height: 60px;
          }
          .info-box-title {
            font-weight: bold;
            font-size: 9pt;
            margin-bottom: 5px;
            text-align: center;
          }
          .info-content {
            font-size: 8pt;
            line-height: 1.2;
          }
          
          /* Payment Terms */
          .payment-terms {
            text-align: center;
            font-weight: bold;
            font-size: 9pt;
            margin-bottom: 15px;
            padding: 5px;
            border: 1px solid black;
          }
          
          /* Items Table */
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
            font-size: 8pt;
          }
          .items-table th {
            border: 1px solid black;
            padding: 5px;
            text-align: center;
            font-weight: bold;
            background: #f5f5f5;
          }
          .items-table td {
            border: 1px solid black;
            padding: 4px;
            text-align: center;
          }
          .description-col {
            text-align: left !important;
          }
          .number-col { width: 8%; }
          .description-col { width: 40%; }
          .quantity-col { width: 12%; }
          .unit-col { width: 12%; }
          .unit-cost-col { width: 14%; }
          .amount-col { width: 14%; }
          
          /* Summary Section */
          .summary-section {
            margin-bottom: 15px;
          }
          .summary-box {
            border: 1px solid black;
            padding: 10px;
            width: 300px;
            margin-left: auto;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 9pt;
          }
          .summary-label {
            font-weight: bold;
          }
          .summary-value {
            text-align: right;
          }
          
          /* Terms Section */
          .terms-section {
            font-size: 8pt;
            margin-bottom: 20px;
            line-height: 1.3;
          }
          
          /* Signature Section */
          .signature-section {
            margin-top: 30px;
          }
          .approved-header {
            text-align: center;
            font-weight: bold;
            font-size: 10pt;
            margin-bottom: 15px;
          }
          .signature-boxes {
            display: flex;
            gap: 20px;
          }
          .signature-box {
            flex: 1;
            border: 1px solid black;
            padding: 10px;
            text-align: center;
          }
          .signature-title {
            font-weight: bold;
            font-size: 9pt;
            margin-bottom: 20px;
          }
          .signature-line {
            border-bottom: 1px solid black;
            margin: 30px 0 5px 0;
          }
          .signature-name {
            font-size: 8pt;
          }
          
          /* Footer */
          .footer {
            text-align: center;
            font-size: 8pt;
            margin-top: 20px;
            border-top: 1px solid black;
            padding-top: 10px;
          }
          .computer-generated {
            text-align: center;
            font-size: 8pt;
            font-style: italic;
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <!-- HEADER SECTION -->
        <div class="header-date">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}     Purchase Order</div>
        <div class="system-title">Kimoel Tracking System</div>
        <div class="company-name">KIMOEL TRADING & CONSTRUCTION INCORPORATED</div>
        <div class="company-address">PUROK 1, LODLOD, LIPA CITY, BATANGAS</div>
        <div class="contact-details">Tel: (043) - 741 - 2023 | Email: kimoel_leotagle@yahoo.com</div>
        <div class="proprietor">LEO TAGLE (Mobile: 0917 - 628 - 3217)</div>
        <div class="document-title">PURCHASE ORDER</div>
        
        <!-- TOP INFO BOXES -->
        <div class="info-section">
          <div class="info-box">
            <div class="info-box-title">SUPPLIER NAME AND ADDRESS</div>
            <div class="info-content">
              ${supplierData.name}<br>
              ${supplierData.address}<br>
              ${supplierData.contact}
            </div>
          </div>
          <div class="info-box">
            <div class="info-box-title">BILL TO</div>
            <div class="info-content">
              KIMOEL TRADING & CONSTRUCTION INCORPORATED<br>
              PUROK 1, LODLOD, LIPA CITY, BATANGAS<br>
              Tel: (043) - 741 - 2023<br>
              Email: kimoel_leotagle@yahoo.com
            </div>
          </div>
          <div class="info-box">
            <div class="info-content">
              <strong>PO Date:</strong> ${formatDate(po.createdDate)}<br>
              <strong>PO Number:</strong> ${po.poNumber}<br>
              <strong>Page:</strong> 1 of 1<br>
              <strong>PO TYPE:</strong> ☑ Domestic ☐ Foreign<br>
              <strong>VAT Type:</strong> ☑ Vatable ☐ Non-Vatable
            </div>
          </div>
        </div>
        
        <!-- PAYMENT TERMS -->
        <div class="payment-terms">
          PAYMENT TERMS: 30 days from receipt/acceptance
        </div>
        
        <!-- LINE ITEMS TABLE -->
        <table class="items-table">
          <thead>
            <tr>
              <th class="number-col">No.</th>
              <th class="description-col">Description</th>
              <th class="quantity-col">Quantity</th>
              <th class="unit-col">Unit</th>
              <th class="unit-cost-col">Unit Cost</th>
              <th class="amount-col">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineItems.map((item: any) => `
              <tr>
                <td class="number-col">${item.no || item.id}</td>
                <td class="description-col">${item.description || ''}</td>
                <td class="quantity-col">${item.quantity || 1}</td>
                <td class="unit-col">${item.unit || 'Lot'}</td>
                <td class="unit-cost-col">${formatCurrency(item.unitPrice || item.amount || 0)}</td>
                <td class="amount-col">${formatCurrency(item.amount || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <!-- SUMMARY SECTION -->
        <div class="summary-section">
          <div class="summary-box">
            <div class="summary-row">
              <div class="summary-label">Sub Total:</div>
              <div class="summary-value">${formatCurrency(po.amount)}</div>
            </div>
            <div class="summary-row">
              <div class="summary-label">EWT:</div>
              <div class="summary-value">0.00</div>
            </div>
            <div class="summary-row">
              <div class="summary-label">VAT Amount:</div>
              <div class="summary-value">0.00</div>
            </div>
            <div class="summary-row">
              <div class="summary-label">Total Amount:</div>
              <div class="summary-value">${formatCurrency(po.amount)}</div>
            </div>
          </div>
        </div>
        
        <!-- TERMS & CONDITIONS -->
        <div class="terms-section">
          <strong>TERMS & CONDITIONS:</strong><br>
          1. Prices quoted are firm and valid for 30 days from PO date.<br>
          2. Delivery shall be made to the specified address within the agreed timeframe.<br>
          3. Materials shall conform to specifications and quality standards.<br>
          4. Payment shall be made within 30 days from receipt and acceptance of materials.<br>
          5. This PO is governed by the laws of the Republic of the Philippines.
        </div>
        
        <!-- SIGNATURE SECTION -->
        <div class="signature-section">
          <div class="approved-header">APPROVED</div>
          <div class="signature-boxes">
            <div class="signature-box">
              <div class="signature-title">Prepared By:</div>
              <div class="signature-line"></div>
              <div class="signature-name">Name: ${supplierData.preparedBy}</div>
            </div>
            <div class="signature-box">
              <div class="signature-title">Reviewed By:</div>
              <div class="signature-line"></div>
              <div class="signature-name">Name: ${supplierData.reviewedBy}</div>
            </div>
          </div>
        </div>
        
        <!-- FOOTER -->
        <div class="footer">
          <strong>KIMOEL TRADING & CONSTRUCTION INCORPORATED</strong><br>
          PUROK 1, LODLOD, LIPA CITY, BATANGAS<br>
          Tel: (043) - 741 - 2023 | Email: kimoel_leotagle@yahoo.com
        </div>
        
        <div class="computer-generated">
          Computer Generated - No Signature Required
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  };

const filteredPOs = purchaseOrders.filter(po => {
    const matchesFilter = filter === 'all' || po.status === filter;
    const matchesSearch = searchTerm === '' || 
      po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.client.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

useEffect(() => {
  fetchPurchaseOrders();
}, [refreshKey]);

  // Real-time refresh - listen for order updates
  useEffect(() => {
    const handleOrdersUpdated = () => {
      fetchPurchaseOrders();
    };

    window.addEventListener('ordersUpdated', handleOrdersUpdated);
    return () => window.removeEventListener('ordersUpdated', handleOrdersUpdated);
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Loading purchase orders...</div>
      </div>
    );
  }

  
  return (
    <>
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ShoppingCart className="size-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Purchase Orders</h2>
              <p className="text-slate-600 text-sm">Manage purchases from vendors and suppliers</p>
            </div>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="size-4 mr-2" />
            New PO
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-slate-500" />
              <select 
                value={filter} 
                onChange={(e) => setFilter(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="RECEIVED">Received</option>
              </select>
            </div>
            <div className="flex-1">
              <Input
                placeholder="Search PO number or vendor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Purchase Orders List */}
      <div className="space-y-3">
        {filteredPOs.length > 0 ? (
          filteredPOs.map((po) => (
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-3">
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-lg">{po.poNumber}</span>
                {getStatusBadge(po.status)}
              </div>
              <div className="flex justify-between text-sm text-slate-500 mb-1">
                <span>Vendor: {po.client}</span>
                <span>{formatDate(po.createdDate)}</span>
              </div>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-slate-500">
                  Delivery: {formatDate(po.deliveryDate)}
                </span>
                <span className="font-semibold text-slate-800">
                  ₱{Number(po.amount).toLocaleString('en-PH', 
                    {minimumFractionDigits: 2})}
                </span>
              </div>
              <div className="flex justify-end gap-2">
                {isAdmin && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => handleEditClick(po)}>
                      <Edit className="size-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handlePrintPO(po)}>
                      <Printer className="size-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDeletePO(po)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="size-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No purchase orders found</h3>
              <p className="text-slate-500">Create your first purchase order to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create PO Modal */}
      {showCreateModal && (
        <CreatePurchaseOrderModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            setRefreshKey(prev => prev + 1);
          }}
        />
      )}
    </div>
    
    {/* Edit PO Modal */}
    {isEditing && selectedPO && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Edit Purchase Order</h2>
            <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600">
              <X className="size-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">PO Number</label>
                <input
                  type="text"
                  value={selectedPO.poNumber}
                  disabled
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="RECEIVED">Received</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter description..."
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
                {loading ? 'Updating...' : 'Update PO'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}
