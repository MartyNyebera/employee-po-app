import { useState, useEffect } from 'react';
import { fetchPurchaseOrders, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder } from '../api/client';
import { fetchVehicles, type Vehicle } from '../api/fleet';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { CreatePOModal } from './CreatePOModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { FileText, Plus, DollarSign, Calendar, Building2, Truck, Edit, Filter, Printer, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  client: string;
  description: string;
  amount: number;
  status: 'pending' | 'approved' | 'in-progress' | 'completed';
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
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
    } catch (err: any) {
      toast.error('Failed to delete purchase order: ' + err.message);
    }
  };

  const handlePrintPO = (po: PurchaseOrder) => {
    // Create a clean print window with PO document
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print PO documents');
      return;
    }

    const assignedAssetNames = po.assignedAssets.map(id => {
      const vehicle = vehicles.find(v => v.id === id);
      return vehicle ? vehicle.unit_name : id;
    });

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
            font-size: 12pt;
            line-height: 1.4;
            color: black;
            margin: 0;
            padding: 20px;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #000;
            padding-bottom: 20px;
          }
          .company-name {
            font-size: 18pt;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .document-title {
            font-size: 16pt;
            font-weight: bold;
            margin-bottom: 20px;
          }
          .po-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
          }
          .info-box {
            border: 1px solid #000;
            padding: 10px;
          }
          .info-label {
            font-weight: bold;
            margin-bottom: 5px;
          }
          .status {
            display: inline-block;
            padding: 5px 10px;
            border: 1px solid #000;
            font-weight: bold;
            text-transform: uppercase;
          }
          .description {
            margin: 20px 0;
            padding: 15px;
            border: 1px solid #ccc;
            min-height: 60px;
          }
          .amount-delivery {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
          }
          .amount-box, .delivery-box {
            border: 1px solid #000;
            padding: 10px;
          }
          .assets {
            margin-top: 20px;
            padding: 10px;
            border: 1px solid #ccc;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10pt;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">KIMOEL TRADING & CONSTRUCTION INCORPORATED</div>
          <div class="document-title">PURCHASE ORDER</div>
        </div>
        
        <div class="po-info">
          <div class="info-box">
            <div class="info-label">PO Number:</div>
            <div>${po.poNumber}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Date:</div>
            <div>${formatDate(po.createdDate)}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Client:</div>
            <div>${po.client}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Status:</div>
            <div class="status">${po.status.replace('-', ' ').toUpperCase()}</div>
          </div>
        </div>
        
        <div class="description">
          <div class="info-label">Description:</div>
          <div>${po.description}</div>
        </div>
        
        <div class="amount-delivery">
          <div class="amount-box">
            <div class="info-label">Amount:</div>
            <div style="font-size: 14pt; font-weight: bold;">${formatCurrency(po.amount)}</div>
          </div>
          <div class="delivery-box">
            <div class="info-label">Delivery Date:</div>
            <div>${formatDate(po.deliveryDate)}</div>
          </div>
        </div>
        
        ${assignedAssetNames.length > 0 ? `
        <div class="assets">
          <div class="info-label">Assigned Assets:</div>
          <div>${assignedAssetNames.join(', ')}</div>
        </div>
        ` : ''}
        
        <div class="footer">
          Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
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
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Purchase Orders</h2>
              <p className="text-slate-600 text-sm dark:text-slate-400">Manage and track procurement requests</p>
            </div>
          </div>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setShowCreateModal(true)}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 border border-blue-500/20 inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-all duration-300 hover:-translate-y-1 px-4 py-2"
          >
            <Plus className="size-4 mr-2" />
            New PO
          </button>
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
        {filteredOrders.length > 0 ? (
          filteredOrders.map((po) => {
          const assignedAssetNames = po.assignedAssets
            .map(id => vehicles.find(v => v.id === id)?.unit_name)
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
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handlePrintPO(po)}
                      className="print-button"
                      title="Print P.O."
                    >
                      <Printer className="size-4" />
                    </Button>
                    {isAdmin && (
                      <>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            setSelectedPO(po);
                            setEditForm({ status: po.status, description: po.description });
                            setIsEditing(true);
                          }}
                          title="Edit PO"
                        >
                          <Edit className="size-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDeletePO(po)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Delete PO"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
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
          )
          })
        ) : (
          <div className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center dark:bg-slate-700/50">
                <FileText className="size-8 text-slate-400 dark:text-slate-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No purchase orders yet</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Create your first purchase order to get started.</p>
              </div>
            </div>
          </div>
        )}
      </div>
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
          <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                PO Number
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
              <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                Update PO
              </Button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Create PO Modal */}
    {showCreateModal && (
      <CreatePOModal 
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          setShowCreateModal(false);
          // Refresh orders
          fetchPurchaseOrders()
            .then(setOrders)
            .catch(() => setOrders([]));
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