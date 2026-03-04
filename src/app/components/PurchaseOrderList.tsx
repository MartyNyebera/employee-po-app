import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { FileText, Plus, ShoppingCart, Package, Edit, Trash2, Filter, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { updatePurchaseOrder, deletePurchaseOrder } from '../api/client';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  client: string;
  description: string;
  amount: number;
  status: 'pending' | 'approved' | 'received';
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
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'received'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    status: '',
    description: '',
  });

  const fetchPurchaseOrders = async () => {
  try {
    const response = await fetch('/api/purchase-orders');
    const data = await response.json();
    
    // Transform API data to match component interface
    const transformedData = data.map((po: any) => ({
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 px-3 py-1 rounded-full font-medium text-xs">Pending</Badge>;
      case 'approved':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1 rounded-full font-medium text-xs">Approved</Badge>;
      case 'received':
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
      const updated = await updatePurchaseOrder(selectedPO.id, { status: editForm.status, description: editForm.description });
      setPurchaseOrders(purchaseOrders.map(po => po.id === selectedPO.id ? updated : po));
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
      
      // Trigger Overview refresh
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      toast.error('Failed to delete purchase order');
    }
  };

  const handlePrintPO = (po: PurchaseOrder) => {
    // Create a professional print window with PO template
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Could not open print window');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Order ${po.poNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .po-info { margin-bottom: 20px; }
          .field { margin-bottom: 10px; }
          .label { font-weight: bold; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PURCHASE ORDER</h1>
          <h2>${po.poNumber}</h2>
        </div>
        <div class="po-info">
          <div class="field"><span class="label">Client:</span> ${po.client}</div>
          <div class="field"><span class="label">Status:</span> ${po.status}</div>
          <div class="field"><span class="label">Date:</span> ${po.createdDate}</div>
          <div class="field"><span class="label">Delivery Date:</span> ${po.deliveryDate}</div>
          <div class="field"><span class="label">Total Amount:</span> ${formatCurrency(po.amount)}</div>
          <div class="field"><span class="label">Description:</span> ${po.description}</div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
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
}, []);

  // Real-time refresh - listen for order updates
  useEffect(() => {
    const handleOrdersUpdated = () => {
      console.log('🔄 Purchase Orders updated - refreshing list');
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
          <Button onClick={() => setShowCreateModal(true)} className="bg-blue-600 hover:bg-blue-700">
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
                <option value="received">Received</option>
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
                        <span className="font-medium">Vendor:</span> {po.client}
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
              </CardContent>
            </Card>
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

      {/* Create PO Modal - Placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
            <h3 className="text-lg font-semibold mb-4">Create Purchase Order</h3>
            <p className="text-slate-600 mb-4">Purchase Order creation form will be implemented here.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowCreateModal(false)}>
                Create PO
              </Button>
            </div>
          </div>
        </div>
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
                  <option value="received">Received</option>
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
