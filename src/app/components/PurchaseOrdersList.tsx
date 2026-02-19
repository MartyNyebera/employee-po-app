import { useState, useEffect } from 'react';
import { mockPurchaseOrders, mockAssets } from '../data/mockData';
import { fetchPurchaseOrders, createPurchaseOrder, updatePurchaseOrder, fetchAssets } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { FileText, Plus, DollarSign, Calendar, Building2, Truck, Edit, Filter } from 'lucide-react';
import { toast } from 'sonner';

interface PurchaseOrdersListProps {
  isAdmin: boolean;
}

export function PurchaseOrdersList({ isAdmin }: PurchaseOrdersListProps) {
  const [orders, setOrders] = useState(mockPurchaseOrders);
  const [assets, setAssets] = useState(mockAssets);
  const [selectedPO, setSelectedPO] = useState<typeof mockPurchaseOrders[0] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchPurchaseOrders().then(setOrders).catch(() => {}),
      fetchAssets().then(setAssets).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);
  const [isEditing, setIsEditing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editForm, setEditForm] = useState({
    status: '',
    description: '',
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-amber-500/10 hover:bg-amber-100 transition-all duration-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30 dark:shadow-lg dark:shadow-amber-500/20 dark:hover:bg-amber-500/30">Pending</Badge>;
      case 'approved':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-blue-500/10 hover:bg-blue-100 transition-all duration-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30 dark:shadow-lg dark:shadow-blue-500/20 dark:hover:bg-blue-500/30">Approved</Badge>;
      case 'in-progress':
        return <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-yellow-500/10 hover:bg-yellow-100 transition-all duration-200 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/30 dark:shadow-lg dark:shadow-yellow-500/20 dark:hover:bg-yellow-500/30">In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-emerald-500/10 hover:bg-emerald-100 transition-all duration-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30 dark:shadow-lg dark:shadow-emerald-500/20 dark:hover:bg-emerald-500/30">Completed</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-slate-500/10 hover:bg-slate-200 transition-all duration-200 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30 dark:shadow-lg dark:shadow-slate-500/20 dark:hover:bg-slate-500/30">{status}</Badge>;
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
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleEditClick = (po: typeof mockPurchaseOrders[0]) => {
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
    } catch (e) {
      toast.error('Failed to update');
    }
  };

  const handleCreatePO = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      const newPO = await createPurchaseOrder({
        poNumber: formData.get('poNumber') as string,
        client: formData.get('client') as string,
        description: formData.get('description') as string,
        amount: Number(formData.get('amount')),
        deliveryDate: formData.get('deliveryDate') as string,
        assignedAssets: [],
      });
      setOrders([newPO, ...orders]);
      toast.success('Purchase order created successfully');
    } catch {
      toast.error('Failed to create purchase order');
    }
  };

  // Filter orders based on selected status
  const filteredOrders = statusFilter === 'all' 
    ? orders 
    : orders.filter(po => po.status === statusFilter);

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Loading orders...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-500/20">
              <FileText className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Purchase Orders</h2>
              <p className="text-slate-600 text-sm dark:text-slate-400">Manage and track procurement requests</p>
            </div>
          </div>
        </div>
        {isAdmin && (
          <Dialog>
            <DialogTrigger className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 border border-blue-500/20 inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-all duration-300 hover:-translate-y-1 px-4 py-2">
              <Plus className="size-4 mr-2" />
              New PO
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Purchase Order</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreatePO} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="poNumber">PO Number</Label>
                  <Input id="poNumber" name="poNumber" placeholder="PO-2026-XXXX" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client">Client</Label>
                  <Input id="client" name="client" placeholder="Company Name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" placeholder="Project details..." required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (PHP)</Label>
                  <Input id="amount" name="amount" type="number" placeholder="0" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deliveryDate">Delivery Date</Label>
                  <Input id="deliveryDate" name="deliveryDate" type="date" required />
                </div>
                <Button type="submit" className="w-full">Create Purchase Order</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Enhanced Filter Bar */}
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <Filter className="size-5" />
              <span className="font-medium">Filter</span>
            </div>
            <div className="flex-1">
              <Input 
                placeholder="Search orders..." 
                className="bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 dark:focus:ring-amber-500/40"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Order Count */}
      <div className="flex items-center justify-between px-2 py-2">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          <span className="font-medium">{filteredOrders.length}</span>
          <span className="text-slate-400"> of {orders.length} orders</span>
        </div>
        {statusFilter !== 'all' && (
          <button
            onClick={() => setStatusFilter('all')}
            className="text-xs text-amber-600 hover:text-amber-700 font-medium px-3 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors duration-200 dark:bg-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/30"
          >
            Clear filter
          </button>
        )}
      </div>

      <div className="space-y-3">
        {filteredOrders.map((po) => {
          const assignedAssetNames = po.assignedAssets
            .map(id => assets.find(a => a.id === id)?.name)
            .filter(Boolean);

          return (
            <Card key={po.id} className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 transition-all duration-300 dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{po.poNumber}</div>
                      <div className={`w-1 h-6 rounded-full ${
                        po.status === 'pending' ? 'bg-amber-400' :
                        po.status === 'approved' ? 'bg-blue-400' :
                        po.status === 'in-progress' ? 'bg-yellow-400' :
                        po.status === 'completed' ? 'bg-emerald-400' : 'bg-slate-400'
                      }`} />
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">{po.client}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500">
                      Created {formatDate(po.createdDate)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(po.status)}
                    {isAdmin && (
                      <Dialog open={isEditing && selectedPO?.id === po.id} onOpenChange={setIsEditing}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleEditClick(po)}
                            className="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 transition-colors duration-200"
                          >
                            <Edit className="size-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Purchase Order</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Status</Label>
                              <Select value={editForm.status} onValueChange={(value) => setEditForm({...editForm, status: value})}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="approved">Approved</SelectItem>
                                  <SelectItem value="in-progress">In Progress</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Description</Label>
                              <Textarea 
                                value={editForm.description}
                                onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                              />
                            </div>
                            <Button onClick={handleSaveEdit} className="w-full">
                              Save Changes
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>

                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 line-clamp-2">{po.description}</p>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-500/20 rounded-lg border border-amber-200 dark:border-amber-500/30">
                    <div className="p-2 bg-amber-100 dark:bg-amber-500/30 rounded-lg">
                      <DollarSign className="size-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{formatCurrency(po.amount)}</div>
                      <div className="text-xs text-amber-600 dark:text-amber-400">Amount</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-500/20 rounded-lg border border-blue-200 dark:border-blue-500/30">
                    <div className="p-2 bg-blue-100 dark:bg-blue-500/30 rounded-lg">
                      <Calendar className="size-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatDate(po.deliveryDate)}</div>
                      <div className="text-xs text-blue-600 dark:text-blue-400">Delivery</div>
                    </div>
                  </div>
                </div>

                {assignedAssetNames.length > 0 && (
                  <div className="pt-4 border-t border-slate-200/60 dark:border-white/10">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3">
                      <Truck className="size-4" />
                      <span className="font-medium">Assigned Assets</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {assignedAssetNames.map((name, idx) => (
                        <Badge key={idx} className="bg-slate-100 text-slate-700 border-slate-200 px-3 py-1 rounded-full font-medium text-xs dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}