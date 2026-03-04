import { useState, useEffect } from 'react';
import { fetchPurchaseOrders, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder } from '../api/client';
import { fetchVehicles, type Vehicle } from '../api/fleet';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { CreateSOModal } from './CreatePOModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { FileText, Plus, DollarSign, Calendar, Building2, Truck, Edit, Filter, Printer, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  client: string;
  description: string;
  amount: number;
  status: 'pending' | 'approved' | 'in-progress' | 'PAID' | 'completed';
  createdDate: string;
  deliveryDate: string;
  assignedAssets: string[];
}

interface PurchaseOrdersListProps {
  isAdmin: boolean;
}

export function PurchaseOrdersList({ isAdmin = false }: PurchaseOrdersListProps) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editForm, setEditForm] = useState({
    status: '',
    description: '',
  });

  useEffect(() => {
    Promise.all([
      fetchPurchaseOrders()
        .then(setOrders)
        .catch(() => setOrders([])),
      fetchVehicles()
        .then(setVehicles)
        .catch(() => setVehicles([])),
    ]).finally(() => setLoading(false));
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 px-3 py-1 rounded-full font-medium text-xs">Pending</Badge>;
      case 'approved':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1 rounded-full font-medium text-xs">Approved</Badge>;
      case 'in-progress':
        return <Badge className="bg-orange-50 text-orange-700 border-orange-200 px-3 py-1 rounded-full font-medium text-xs">In Progress</Badge>;
      case 'PAID':
        return <Badge className="bg-green-50 text-green-700 border-green-200 px-3 py-1 rounded-full font-medium text-xs">PAID</Badge>;
      case 'completed':
        return <Badge className="bg-gray-50 text-gray-700 border-gray-200 px-3 py-1 rounded-full font-medium text-xs">Completed</Badge>;
      default:
        return <Badge className="bg-gray-50 text-gray-700 border-gray-200 px-3 py-1 rounded-full font-medium text-xs">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const loadOrders = async () => {
    try {
      const data = await fetchPurchaseOrders();
      setOrders(data);
    } catch (error) {
      console.error('Failed to load orders:', error);
      setOrders([]);
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
      const updated = await updatePurchaseOrder(selectedPO.id, { status: editForm.status, description: editForm.description });
      setOrders(orders.map(po => po.id === selectedPO.id ? updated : po));
      setIsEditing(false);
      toast.success('Purchase order updated successfully');
      
      // Trigger Overview refresh
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
    } catch (err: any) {
      toast.error('Failed to update purchase order: ' + err.message);
    }
  };

  const handleDeletePO = async (po: PurchaseOrder) => {
    if (!confirm(`Are you sure you want to delete PO ${po.poNumber}? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await deletePurchaseOrder(po.id);
      setOrders(orders.filter(order => order.id !== po.id));
      toast.success('Purchase order deleted successfully');
      
      // Trigger Overview refresh
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
    } catch (err: any) {
      toast.error('Failed to delete purchase order: ' + err.message);
    }
  };

  const handlePrintPO = (po: PurchaseOrder) => {
    // Create a professional print window with corrected PO template including missing fields
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print PO documents');
      return;
    }

    // Extract additional data from PO (assuming it's stored in the description or as extended fields)
    // For now, we'll use placeholder data that would come from the new form structure
    const customerData = {
      name: po.client,
      address: po.description.includes('Address:') ? po.description.split('Address:')[1].split('\n')[0].trim() : '[Customer Address]',
      contact: po.description.includes('Contact:') ? po.description.split('Contact:')[1].split('\n')[0].trim() : '[Customer Contact]',
      preparedBy: po.description.includes('Prepared By:') ? po.description.split('Prepared By:')[1].split('\n')[0].trim() : '[Prepared By]',
      reviewedBy: po.description.includes('Reviewed By:') ? po.description.split('Reviewed By:')[1].split('\n')[0].trim() : '[Reviewed By]',
    };

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
            font-size: 16pt;
            font-weight: bold;
            margin-bottom: 3px;
          }
          .company-address {
            text-align: center;
            font-size: 10pt;
            margin-bottom: 2px;
          }
          .contact-details {
            text-align: center;
            font-size: 9pt;
            margin-bottom: 2px;
          }
          .proprietor {
            text-align: center;
            font-size: 9pt;
            font-weight: bold;
            margin-bottom: 10px;
          }
          .document-title {
            text-align: center;
            font-size: 20pt;
            font-weight: bold;
            margin: 15px 0;
            border-top: 2px solid black;
            border-bottom: 2px solid black;
            padding: 10px 0;
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
            border-bottom: 1px solid black;
            padding-bottom: 3px;
          }
          .info-content {
            font-size: 9pt;
            line-height: 1.2;
          }
          
          /* Payment Terms */
          .payment-terms {
            border: 1px solid black;
            padding: 8px;
            margin-bottom: 15px;
            text-align: center;
            font-weight: bold;
          }
          
          /* Line Items Table */
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          .items-table th,
          .items-table td {
            border: 1px solid black;
            padding: 5px;
            font-size: 9pt;
            text-align: left;
          }
          .items-table th {
            font-weight: bold;
            background-color: #f0f0f0;
          }
          .items-table .number-col,
          .items-table .quantity-col,
          .items-table .unit-price-col,
          .items-table .amount-col {
            text-align: center;
            width: 60px;
          }
          .items-table .description-col {
            min-width: 200px;
          }
          
          /* Summary Section */
          .summary-section {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 15px;
          }
          .summary-box {
            width: 300px;
            border: 1px solid black;
          }
          .summary-row {
            display: flex;
            border-bottom: 1px solid black;
          }
          .summary-row:last-child {
            border-bottom: none;
          }
          .summary-label {
            flex: 1;
            padding: 5px;
            font-size: 9pt;
            border-right: 1px solid black;
          }
          .summary-value {
            width: 100px;
            padding: 5px;
            font-size: 9pt;
            text-align: right;
            font-weight: bold;
          }
          
          /* Terms & Conditions */
          .terms-section {
            border: 1px solid black;
            padding: 8px;
            margin-bottom: 15px;
            font-size: 8pt;
            line-height: 1.2;
          }
          
          /* Signature Section - NO DIAGONAL STAMP */
          .signature-section {
            margin-bottom: 15px;
          }
          .approved-header {
            text-align: center;
            font-size: 12pt;
            font-weight: bold;
            margin-bottom: 15px;
            border: 1px solid black;
            padding: 8px;
            background-color: #f9f9f9;
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
        <div class="header-date">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}     Sales Order</div>
        <div class="system-title">Kimoel Tracking System</div>
        <div class="company-name">KIMOEL TRADING & CONSTRUCTION INCORPORATED</div>
        <div class="company-address">PUROK 1, LODLOD, LIPA CITY, BATANGAS</div>
        <div class="contact-details">Tel: (043) - 741 - 2023 | Email: kimoel_leotagle@yahoo.com</div>
        <div class="proprietor">LEO TAGLE (Mobile: 0917 - 628 - 3217)</div>
        <div class="document-title">SALES ORDER</div>
        
        <!-- TOP INFO BOXES -->
        <div class="info-section">
          <div class="info-box">
            <div class="info-box-title">SUPPLIER NAME AND ADDRESS</div>
            <div class="info-content">
              KIMOEL TRADING & CONSTRUCTION INCORPORATED<br>
              PUROK 1, LODLOD, LIPA CITY, BATANGAS<br>
              Tel: (043) - 741 - 2023<br>
              Email: kimoel_leotagle@yahoo.com
            </div>
          </div>
          <div class="info-box">
            <div class="info-box-title">SHIP/DELIVER TO</div>
            <div class="info-content">
              ${customerData.name}<br>
              ${customerData.address}<br>
              ${customerData.contact}
            </div>
          </div>
          <div class="info-box">
            <div class="info-content">
              <strong>SO Date:</strong> ${formatDate(po.createdDate)}<br>
              <strong>SO Number:</strong> ${po.poNumber}<br>
              <strong>Page:</strong> 1 of 1<br>
              <strong>SO TYPE:</strong> ☑ Domestic ☐ Foreign<br>
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
            <tr>
              <td class="number-col">1</td>
              <td class="description-col">${po.description}</td>
              <td class="quantity-col">1</td>
              <td class="unit-col">Lot</td>
              <td class="unit-cost-col">${formatCurrency(po.amount)}</td>
              <td class="amount-col">${formatCurrency(po.amount)}</td>
            </tr>
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
        
        <!-- SIGNATURE SECTION - NO DIAGONAL STAMP -->
        <div class="signature-section">
          <div class="approved-header">APPROVED</div>
          <div class="signature-boxes">
            <div class="signature-box">
              <div class="signature-title">Prepared By:</div>
              <div class="signature-line"></div>
              <div class="signature-name">Name: ${customerData.preparedBy}</div>
            </div>
            <div class="signature-box">
              <div class="signature-title">Reviewed By:</div>
              <div class="signature-line"></div>
              <div class="signature-name">Name: ${customerData.reviewedBy}</div>
            </div>
            <div class="signature-box">
              <div class="signature-title">Approved By:</div>
              <div class="signature-line"></div>
              <div class="signature-name">Name: LEO TAGLE</div>
            </div>
          </div>
        </div>
        
        <div class="computer-generated">
          This is a computer generated document, no signature is required
        </div>
        
        <!-- FOOTER -->
        <div class="footer">
          Purchase Order ${po.poNumber} | Page 1 of 1 | KIMOEL TRADING & CONSTRUCTION INCORPORATED
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

  // Filter orders based on selected status (case-insensitive)
  const filteredOrders = statusFilter === 'all' 
    ? orders 
    : orders.filter(po => po.status.toLowerCase() === statusFilter.toLowerCase());

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Loading orders...</div>
      </div>
    );
  }

  return (
    <>
      <div className="p-6 space-y-6">
        {/* Enhanced Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-500/20">
                <FileText className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Sales Orders</h2>
              <p className="text-slate-600 text-sm dark:text-slate-400">Manage and track Sales Orders</p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreateModal(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="size-4 mr-2" />
              New SO
            </Button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-slate-500" />
              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="in-progress">In Progress</option>
                <option value="PAID">PAID</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="flex-1">
              <Input
                placeholder="Search SO number or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sales Orders List */}
      <div className="space-y-3">
        {filteredOrders.length > 0 ? (
          filteredOrders.map((po) => {
          const assignedAssetNames = po.assignedAssets
            .map(id => vehicles.find(v => v.id === id)?.unit_name)
            .filter(Boolean);

          return (
            <Card key={po.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <h3 className="font-semibold text-lg">{po.poNumber}</h3>
                      {getStatusBadge(po.status)}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
                      <div>
                        <span className="font-medium">Customer:</span> {po.client}
                      </div>
                      <div>
                        <span className="font-medium">Date:</span> {po.createdDate}
                      </div>
                      <div>
                        <span className="font-medium">Delivery:</span> {po.deliveryDate}
                      </div>
                      <div>
                        <span className="font-medium">Total:</span> {formatCurrency(po.amount)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => {
                          setSelectedPO(po);
                          setEditForm({ status: po.status, description: po.description });
                          setIsEditing(true);
                        }}>
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
              </CardContent>
            </Card>
          )
          })
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="size-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No sales orders found</h3>
              <p className="text-slate-500">Create your first sales order to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    
    {/* Edit PO Modal */}
    {isEditing && selectedPO && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Edit Sales Order</h2>
            <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600">
              <X className="size-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                SO Number
              </label>
              <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-900 text-sm">
                {selectedPO.poNumber}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Status <span className="text-red-500">*</span>
              </label>
              <select
                value={editForm.status}
                onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="in-progress">In Progress</option>
                <option value="PAID">PAID</option>
                <option value="completed">Completed / Done</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Project details..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                required
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
                {loading ? 'Updating...' : 'Update SO'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Create PO Modal */}
    {showCreateModal && (
      <CreateSOModal
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          setShowCreateModal(false);
          loadOrders();
        }}
      />
    )}
    </>
  );
}

/* Print Styles - Professional PO Layout */
const printStyles = `
@media print {
  /* Hide all non-print elements */
  .print-button,
  button,
  .bg-black\\/50,
  .fixed.inset-0,
  .p-4.text-center,
  .flex.items-center.justify-between.p-6,
  .border-b,
  .text-slate-400,
  .hover\\:text-slate-600,
  .text-red-600,
  .hover\\:text-red-700,
  .hover\\:bg-red-50,
  .text-blue-600,
  .hover\\:text-blue-700,
  .hover\\:bg-blue-50,
  .gap-3,
  .grid.grid-cols-2,
  .pt-4.border-t,
  .flex.flex-wrap.gap-2,
  .mb-4,
  .line-clamp-2,
  .shadow-2xl,
  .rounded-2xl,
  .bg-white,
  .dark\\:bg-slate-800,
  .dark\\:text-slate-100,
  .dark\\:text-slate-300,
  .dark\\:text-slate-400,
  .dark\\:text-slate-500,
  .dark\\:bg-slate-700\\/50,
  .dark\\:border-slate-600,
  .dark\\:border-white\\/10,
  .dark\\:bg-amber-500\\/20,
  .dark\\:text-amber-300,
  .dark\\:border-amber-500\\/30,
  .dark\\:bg-blue-500\\/20,
  .dark\\:text-blue-300,
  .dark\\:border-blue-500\\/30,
  .dark\\:bg-slate-700\\/50,
  .dark\\:text-slate-300,
  .dark\\:border-slate-600 {
    display: none !important;
  }
  
  /* Print-friendly layout */
  body {
    font-family: 'Times New Roman', serif;
    font-size: 12pt;
    line-height: 1.4;
    color: black;
    background: white;
    margin: 0;
    padding: 20px;
  }
  
  /* PO Card styling for print */
  .card {
    border: 2px solid #000 !important;
    page-break-inside: avoid;
    margin: 0 !important;
    padding: 20px !important;
    background: white !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    width: 100% !important;
    max-width: none !important;
  }
  
  /* PO Header */
  .text-xl.font-bold {
    font-size: 18pt !important;
    font-weight: bold !important;
    margin-bottom: 10px !important;
  }
  
  /* Company info */
  .text-sm.text-slate-600 {
    font-size: 10pt !important;
    margin-bottom: 15px !important;
  }
  
  /* Status badge */
  .bg-emerald-50,
  .bg-amber-50,
  .bg-blue-50,
  .bg-slate-100 {
    border: 1px solid #000 !important;
    padding: 5px 10px !important;
    margin: 5px 0 !important;
    background: white !important;
  }
  
  /* Amount and delivery sections */
  .grid.grid-cols-2 > div {
    border: 1px solid #ccc !important;
    padding: 10px !important;
    margin: 5px 0 !important;
    background: white !important;
  }
  
  /* Description */
  p.text-sm {
    font-size: 11pt !important;
    margin: 10px 0 !important;
    page-break-inside: avoid;
  }
  
  /* Company branding */
  .text-lg.font-bold {
    font-size: 16pt !important;
    font-weight: bold !important;
    text-align: center !important;
    margin-bottom: 20px !important;
  }
  
  /* Ensure text is visible */
  * {
    color: black !important;
    background: white !important;
  }
  
  /* Page setup */
  @page {
    margin: 0.5in;
    size: A4;
  }
}
`;

// Inject print styles into document
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = printStyles;
  document.head.appendChild(styleSheet);
}