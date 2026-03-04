import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { FileText, Plus, ShoppingCart, Package, Edit, Trash2, Filter, Printer } from 'lucide-react';
import { toast } from 'sonner';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorName: string;
  vendorAddress: string;
  vendorContact: string;
  poDate: string;
  deliveryDate: string;
  poType: 'domestic' | 'foreign';
  paymentTerms: string;
  vatType: 'vatable' | 'non-vatable';
  lineItems: Array<{
    id: string;
    no: number;
    description: string;
    quantity: number;
    unit: string;
    unitCost: number;
    amount: number;
  }>;
  subTotal: number;
  ewt: number;
  vatAmount: number;
  totalAmount: number;
  termsAndConditions: string;
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
  status: 'pending' | 'approved' | 'received';
  createdDate: string;
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

  useEffect(() => {
    // Simulate loading purchase orders
    setTimeout(() => {
      setPurchaseOrders([
        {
          id: '1',
          poNumber: 'KTCI-2026-0001',
          vendorName: 'ABC Supplies Corp',
          vendorAddress: '123 Supplier St, Manila',
          vendorContact: 'Tel: 555-1234',
          poDate: '2026-03-04',
          deliveryDate: '2026-03-15',
          poType: 'domestic',
          paymentTerms: '30 days from delivery',
          vatType: 'vatable',
          lineItems: [
            {
              id: '1',
              no: 1,
              description: 'Office Supplies',
              quantity: 10,
              unit: 'box',
              unitCost: 500,
              amount: 5000
            }
          ],
          subTotal: 5000,
          ewt: 0,
          vatAmount: 600,
          totalAmount: 5600,
          termsAndConditions: 'Standard terms apply',
          preparedBy: 'John Doe',
          reviewedBy: 'Jane Smith',
          approvedBy: 'LEO TAGLE',
          status: 'pending',
          createdDate: '2026-03-04'
        }
      ]);
      setLoading(false);
    }, 1000);
  }, []);

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

  const filteredPOs = purchaseOrders.filter(po => {
    const matchesFilter = filter === 'all' || po.status === filter;
    const matchesSearch = searchTerm === '' || 
      po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.vendorName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Loading purchase orders...</div>
      </div>
    );
  }

  return (
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
                        <span className="font-medium">Vendor:</span> {po.vendorName}
                      </div>
                      <div>
                        <span className="font-medium">Date:</span> {po.poDate}
                      </div>
                      <div>
                        <span className="font-medium">Delivery:</span> {po.deliveryDate}
                      </div>
                      <div>
                        <span className="font-medium">Total:</span> {formatCurrency(po.totalAmount)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <>
                        <Button variant="outline" size="sm">
                          <Edit className="size-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Printer className="size-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
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
  );
}
