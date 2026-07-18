import { useState, useEffect } from 'react';
import { fetchPurchaseOrders, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, deleteSalesOrder, fetchSalesOrders, createSalesOrder, updateSalesOrder, fetchApi } from '../api/client';
import { fetchVehicles, type Vehicle } from '../api/fleet';
import { printSalesOrder } from '../lib/orderPrint';
import { CreateSOModal } from './CreatePOModal';
import { FileText, Plus, DollarSign, Calendar, Building2, Truck, Edit, Filter, Printer, Trash2, X, Search, Check, Package, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../lib/confirm';
import { S, peso, toneText } from './crm/crmKit';
import { SummaryStats } from './SummaryStats';

const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

interface PurchaseOrderData {
  id: string;
  poNumber: string;
  client: string;
  description: string;
  amount: number;
  status: 'pending' | 'rejected' | 'approved' | 'in-progress' | 'PAID' | 'completed';
  createdDate: string;
  deliveryDate: string;
  assignedAssets: string[];
  orderType?: string;
}

interface PurchaseOrder {
  id: string;
  soNumber: string;  // Changed from poNumber
  client: string;
  description: string;
  amount: number;
  status: 'pending' | 'rejected' | 'approved' | 'in-progress' | 'PAID' | 'completed';
  createdDate: string;
  deliveryDate: string;
  assignedAssets: string[];
  driverName?: string;
  driverContact?: string;
  vehicleName?: string;
  plateNumber?: string;
  deliveryStatus?: string;
  deliveryId?: string;
}

interface SalesOrdersListProps {
  isAdmin: boolean;
}

export function SalesOrdersList({ isAdmin = false }: SalesOrdersListProps) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editForm, setEditForm] = useState({
    status: '',
    description: '',
    customerName: '',
    customerAddress: '',
    customerContact: '',
    preparedBy: '',
    reviewedBy: '',
    // CRM / trading details
    customerId: '',
    amount: '' as number | string,
    costAmount: '' as number | string,
    line: '',
    source: '',
    // editable PDF header fields
    docDate: '',
    paymentTerms: '',
    termsAndConditions: '',
  });

  const [customers, setCustomers] = useState<Array<{ id: string; name: string; location?: string; contactPerson?: string; phone?: string }>>([]);
  useEffect(() => {
    fetchApi<any[]>('/customers').then(setCustomers).catch(() => setCustomers([]));
  }, []);

  const SO_LINES = ['Sheet metal (panels)', 'Sheet metal (branded)', 'Trading (electrical)', 'Trading (mechanical)', 'Fabrication (subcon)'];
  const SO_SOURCES = ['Referral', 'Facebook', 'Marketplace', 'Ad', 'Walk-in', 'Website', 'Existing contact'];

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchSalesOrders();
        setOrders(data);
      } catch (error) {
        console.error('Failed to fetch sales orders:', error);
        setOrders([]);
        toast.error('Failed to load sales orders. Please try again later.');
      }
    };

    const loadPurchaseOrders = async () => {
      try {
        const data = await fetchPurchaseOrders() as PurchaseOrderData[];
        const purePurchaseOrders = data.filter((item: PurchaseOrderData) => 
          item.orderType === 'purchase' || 
          (item.poNumber && item.poNumber.toLowerCase().includes('po'))
        );
        setPurchaseOrders(purePurchaseOrders as unknown as PurchaseOrder[]);
      } catch (error) {
        console.error('Failed to fetch purchase orders:', error);
        setPurchaseOrders([]);
        toast.error('Failed to load purchase orders. Please try again later.');
      }
    };

    const loadVehicles = async () => {
      try {
        const data = await fetchVehicles();
        setVehicles(data);
      } catch (error) {
        console.error('Failed to fetch vehicles:', error);
        setVehicles([]);
      }
    };

    loadData();
    loadPurchaseOrders();
    loadVehicles();
    
    // Set loading to false after all data is loaded
    Promise.all([loadData(), loadPurchaseOrders(), loadVehicles()]).finally(() => {
      setLoading(false);
    });
  }, [refreshKey]);

  // [removed] getStatusConfig/StatusBadge — the table now renders status as tone-coloured text
  // (toneText), so the old green/gold pill config is dead. Kept out to stay on-palette.

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount);
  };

  // #3 — admin rejects a sales order. A rejected SO is the ONLY state an admin may then edit
  // (mirrors the purchase-order rule); until then the order is locked.
  const handleReject = async (po: PurchaseOrder) => {
    if (!(await confirmDialog({ title: `Reject SO ${po.soNumber}?`, message: 'It can then be edited and re-issued.', confirmLabel: 'Reject', tone: 'danger' }))) return;
    try {
      await updateSalesOrder(po.id, { status: 'rejected' });
      setOrders(prev => prev.map(o => o.id === po.id ? { ...o, status: 'rejected' } : o));
      toast.success(`${po.soNumber} rejected`);
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
    } catch (e: any) { toast.error('Failed to reject: ' + (e?.message || 'unknown error')); }
  };

  const handleEditClick = (po: PurchaseOrder) => {
    setSelectedPO(po);

    // Debug: Log the raw description
    console.log('🔍 RAW DESCRIPTION DEBUG:');
    console.log('Description:', JSON.stringify(po.description));
    console.log('Description split by lines:', po.description.split('\n'));
    
    // Parse the description to extract customer info
    let customerName = po.client;
    let customerAddress = '';
    let customerContact = '';
    let preparedBy = '';
    let reviewedBy = '';
    let description = '';
    let lineItems = [];
    
    try {
      // Try to extract structured data from description
      const lines = po.description.split('\n');
      let foundLineItems = false;
      let firstNonEmptyLine = true;
      
      lines.forEach(line => {
        const trimmedLine = line.trim();
        
        if (trimmedLine.includes('Address:')) {
          customerAddress = trimmedLine.replace('Address:', '').trim();
        } else if (trimmedLine.includes('Contact:')) {
          customerContact = trimmedLine.replace('Contact:', '').trim();
        } else if (trimmedLine.includes('Prepared By:')) {
          preparedBy = trimmedLine.replace('Prepared By:', '').trim();
        } else if (trimmedLine.includes('Reviewed By:')) {
          reviewedBy = trimmedLine.replace('Reviewed By:', '').trim();
        } else if (trimmedLine.includes('Line Items:')) {
          foundLineItems = true;
          // Parse line items JSON
          try {
            const lineItemsStr = trimmedLine.replace('Line Items:', '').trim();
            if (lineItemsStr) {
              lineItems = JSON.parse(lineItemsStr);
            }
          } catch (e) {
            console.error('Error parsing line items:', e);
          }
        } else if (trimmedLine && !foundLineItems && 
                   trimmedLine !== 'Address: [Customer Address]' && 
                   trimmedLine !== 'Contact: [Customer Contact]' && 
                   trimmedLine !== 'Prepared By: [Prepared By]' && 
                   trimmedLine !== 'Reviewed By: [Reviewed By]') {
          
          // If this is the first non-empty line and we don't have an address yet, treat it as address
          if (firstNonEmptyLine && !customerAddress) {
            customerAddress = trimmedLine;
            firstNonEmptyLine = false;
          }
          // Otherwise, collect as description (but skip structured fields)
          else if (!firstNonEmptyLine || customerAddress) {
            if (description) description += '\n' + trimmedLine;
            else description = trimmedLine;
          }
        }
      });
    } catch (error) {
      console.error('Error parsing description:', error);
      description = po.description;
    }
    
    // Debug: Log parsed values
    console.log('🔍 PARSED VALUES DEBUG:');
    console.log('Customer Address:', JSON.stringify(customerAddress));
    console.log('Customer Contact:', JSON.stringify(customerContact));
    console.log('Prepared By:', JSON.stringify(preparedBy));
    console.log('Reviewed By:', JSON.stringify(reviewedBy));
    console.log('Description:', JSON.stringify(description));
    console.log('Line Items:', lineItems);
    
    setEditForm({
      status: po.status,
      description: description || '',
      customerName: customerName,
      // prefer the real columns; fall back to values parsed out of the old description
      customerAddress: (po as any).customerAddress || customerAddress,
      customerContact: (po as any).customerContact || customerContact,
      preparedBy: (po as any).preparedBy || preparedBy,
      reviewedBy: (po as any).reviewedBy || reviewedBy,
      customerId: (po as any).customerId || '',
      amount: (po as any).amount ?? '',
      costAmount: (po as any).costAmount ?? '',
      line: (po as any).line || '',
      source: (po as any).source || '',
      docDate: ((po as any).docDate || (po as any).createdDate || '').slice(0, 10),
      paymentTerms: (po as any).paymentTerms || '',
      termsAndConditions: (po as any).termsAndConditions || '',
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedPO) return;
    
    try {
      console.log('🔧 Updating Sales Order:', selectedPO.id, 'with status:', editForm.status);
      
      // Reconstruct the description with customer info
      let newDescription = editForm.description;
      if (editForm.customerAddress || editForm.customerContact) {
        newDescription = `${editForm.description}\n\nAddress: ${editForm.customerAddress}\nContact: ${editForm.customerContact}`;
      }
      
      // Update backend first
      const updated = await updateSalesOrder(selectedPO.id, {
        status: editForm.status,
        description: newDescription,
        client: editForm.customerName,
        customerId: editForm.customerId || null,
        amount: editForm.amount === '' ? undefined : Number(editForm.amount),
        costAmount: editForm.costAmount === '' ? null : Number(editForm.costAmount),
        line: editForm.line || null,
        source: editForm.source || null,
        // editable PDF header fields
        docDate: editForm.docDate || null,
        preparedBy: editForm.preparedBy || null,
        reviewedBy: editForm.reviewedBy || null,
        customerAddress: editForm.customerAddress || null,
        customerContact: editForm.customerContact || null,
        paymentTerms: editForm.paymentTerms || null,
        termsAndConditions: editForm.termsAndConditions || null,
      });
      
      console.log('🔧 Updated Sales Order response:', updated);
      
      // Then refresh data from server
      await fetchSalesOrders();
      
      setIsEditing(false);
      toast.success('Sales order updated successfully');
      
      // Trigger Overview refresh
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('salesOrderUpdated', { 
        detail: { orderId: selectedPO.id, status: editForm.status } 
      }));
      setTimeout(() => {
        setRefreshKey(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('❌ Error updating sales order:', error);
      toast.error('Failed to update sales order');
      
      // Revert optimistic update on error
      setRefreshKey(prev => prev + 1);
    }
  };

  const handleDeletePO = async (po: PurchaseOrder) => {
    if (!(await confirmDialog({ title: `Delete SO ${po.soNumber}?`, message: 'This action cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) {
      return;
    }

    // Set loading state for this specific item
    setOrders(prev => prev.map(order => 
      order.id === po.id 
        ? { ...order, status: 'deleting' as any }
        : order
    ));

    try {
      const startTime = Date.now();
      await deleteSalesOrder(po.id);
      const duration = Date.now() - startTime;
      
      // Remove from local state immediately
      setOrders(prev => prev.filter(p => p.id !== po.id));
      
      toast.success(`Sales order deleted in ${duration}ms`);
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('salesOrderUpdated', { 
        detail: { orderId: po.id, action: 'deleted' } 
      }));
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Error deleting sales order:', error);
      
      // Restore original status
      setOrders(prev => prev.map(order => 
        order.id === po.id 
          ? { ...order, status: po.status }
          : order
      ));
      
      toast.error('Failed to delete sales order');
    }
  };

  // The document itself lives in lib/orderPrint — the sales portal prints the same order,
  // and one template means one thing to keep correct.
  const handlePrintSO = (so: any) => {
    const r = printSalesOrder(so);
    if (!r.ok) toast.error(r.error || 'Failed to open the print window');
  };

  const statusLabel = (s: string) => ({ 'pending': 'Pending', 'rejected': 'Rejected', 'approved': 'Approved', 'in-progress': 'In progress', 'PAID': 'PAID', 'completed': 'Completed' }[s] || s);

  const filteredOrders = orders.filter(po => {
    const matchesFilter = statusFilter === 'all' || po.status === statusFilter;
    const matchesSearch = searchTerm === '' || 
      po.soNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.client.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Financial Calculations
  const totalRevenue = orders.reduce((sum, po) => sum + po.amount, 0);
  const totalExpenses = purchaseOrders.reduce((sum, po) => sum + po.amount, 0);
  const netProfit = totalRevenue - totalExpenses;
  
  const totalAmount = totalRevenue; // Keep for backward compatibility
  const pendingCount = orders.filter(po => po.status === 'pending').length;
  const approvedCount = orders.filter(po => po.status === 'approved').length;
  const inProgressCount = orders.filter(po => po.status === 'in-progress').length;
  const paidCount = orders.filter(po => po.status === 'PAID').length;
  const completedCount = orders.filter(po => po.status === 'completed').length;
  const rejectedCount = orders.filter(po => po.status === 'rejected').length;

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          border: '4px solid #d6d6d6',
          borderTopColor: '#d1b01b',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{
          fontSize: '16px',
          fontWeight: '500',
          color: '#5a5a5a',
          fontFamily: 'Poppins, sans-serif'
        }}>
          Loading sales orders...
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={S.h1}>Sales Orders</h1>
          <p style={S.sub}>Track sales orders and client deliveries.</p>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...S.input, width: 'auto', cursor: 'pointer' }}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="in-progress">In progress</option>
          <option value="PAID">PAID</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <SummaryStats items={[
        { label: 'Total SOs', value: orders.length },
        { label: 'Pending', value: pendingCount, accent: true },
        { label: 'Approved', value: approvedCount },
        { label: 'In progress', value: inProgressCount },
        { label: 'PAID', value: paidCount },
        { label: 'Completed', value: completedCount },
        { label: 'Rejected', value: rejectedCount },
      ]} />

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>SO #</th>
            <th style={S.th}>Client</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Amount</th>
            <th style={S.th}>Status</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={5}>No sales orders.</td></tr>
            ) : filteredOrders.map(po => (
              <tr key={po.id}>
                <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>{po.soNumber}</td>
                <td style={S.td}>{po.client}</td>
                <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: '#000000' }}>{peso(po.amount)}</td>
                <td style={S.td}>
                  <span style={{ color: toneText(po.status), fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{statusLabel(po.status)}</span>
                </td>
                <td style={S.td}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', flexWrap: 'wrap' }}>
                    <button className="crm-row-btn" title="Print" style={{ ...S.rowBtn, marginLeft: 0 }} onClick={() => handlePrintSO(po)}><Printer size={13} /></button>
                    {/* #3 — reject is offered while the order is still open (not yet rejected,
                        paid, or completed); a rejected order is the only one that can be edited. */}
                    {isAdmin && po.status !== 'rejected' && po.status !== 'PAID' && po.status !== 'completed' && (
                      <button className="crm-action-btn" title="Reject" style={{ ...S.rowBtn, marginLeft: 0, color: '#b91c1c' }} onClick={() => handleReject(po)}><X size={13} /></button>
                    )}
                    {isAdmin && po.status === 'rejected' && (
                      <button className="crm-row-btn" title="Edit" style={{ ...S.rowBtn, marginLeft: 0 }} onClick={() => handleEditClick(po)}><Edit size={13} /></button>
                    )}
                    {isAdmin && (
                      <button className="crm-row-btn" title="Delete" style={{ ...S.rowBtn, marginLeft: 0, color: '#b91c1c' }} onClick={() => handleDeletePO(po)}><Trash2 size={13} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create SO Modal */}
      {showCreateModal && (
        <CreateSOModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            setRefreshKey(prev => prev + 1);
          }}
        />
      )}

      {/* Edit SO Modal */}
      {isEditing && selectedPO && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            width: '100%',
            maxWidth: '500px',
            maxHeight: 'calc(100vh - 32px)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px',
              borderBottom: '1px solid #d6d6d6',
              flexShrink: 0
            }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#000000',
                margin: '0',
                fontFamily: 'Poppins, sans-serif'
              }}>
                Edit Sales Order
              </h2>
              <button
                onClick={() => setIsEditing(false)}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#e6e6e6',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <X style={{ width: '20px', height: '20px', color: '#5a5a5a' }} />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} style={{ padding: '24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#262626',
                    marginBottom: '6px',
                    fontFamily: 'Poppins, sans-serif'
                  }}>
                    SO Number
                  </label>
                  <input
                    type="text"
                    value={selectedPO.soNumber}
                    disabled
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid #d6d6d6',
                      backgroundColor: '#ececec',
                      color: '#8a8a8a',
                      fontFamily: 'Poppins, sans-serif'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#262626',
                    marginBottom: '6px',
                    fontFamily: 'Poppins, sans-serif'
                  }}>
                    Client Name
                  </label>
                  <input
                    type="text"
                    value={editForm.customerName}
                    onChange={e => setEditForm({ ...editForm, customerName: e.target.value })}
                    placeholder="Enter client name..."
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid #d6d6d6',
                      fontSize: '14px',
                      fontFamily: 'Poppins, sans-serif',
                      backgroundColor: 'white',
                      transition: 'all 0.2s ease'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#262626',
                    marginBottom: '6px',
                    fontFamily: 'Poppins, sans-serif'
                  }}>
                    Client Address
                  </label>
                  <textarea
                    value={editForm.customerAddress}
                    onChange={e => setEditForm({ ...editForm, customerAddress: e.target.value })}
                    rows={2}
                    placeholder="Enter client address..."
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid #d6d6d6',
                      fontSize: '14px',
                      fontFamily: 'Poppins, sans-serif',
                      backgroundColor: 'white',
                      transition: 'all 0.2s ease',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#262626',
                    marginBottom: '6px',
                    fontFamily: 'Poppins, sans-serif'
                  }}>
                    Client Contact
                  </label>
                  <input
                    type="text"
                    value={editForm.customerContact}
                    onChange={e => setEditForm({ ...editForm, customerContact: e.target.value })}
                    placeholder="Enter client contact..."
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid #d6d6d6',
                      fontSize: '14px',
                      fontFamily: 'Poppins, sans-serif',
                      backgroundColor: 'white',
                      transition: 'all 0.2s ease'
                    }}
                  />
                </div>

                {customers.length > 0 && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>
                      Link to client
                    </label>
                    <select
                      value={editForm.customerId}
                      onChange={e => {
                        const c = customers.find(x => x.id === e.target.value);
                        setEditForm({ ...editForm, customerId: e.target.value, customerName: c ? c.name : editForm.customerName });
                      }}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white', cursor: 'pointer' }}
                    >
                      <option value="">— not linked —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>
                      Selling price (₱)
                    </label>
                    <input
                      type="number"
                      value={editForm.amount}
                      onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                      placeholder="Client price"
                      style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>
                      Cost / COGS (₱)
                    </label>
                    <input
                      type="number"
                      value={editForm.costAmount}
                      onChange={e => setEditForm({ ...editForm, costAmount: e.target.value })}
                      placeholder="Supplier cost"
                      style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white' }}
                    />
                  </div>
                </div>
                {editForm.amount !== '' && editForm.costAmount !== '' && (
                  <div style={{ fontSize: '13px', fontWeight: 600, color: (Number(editForm.amount) - Number(editForm.costAmount)) >= 0 ? '#7a6a0c' : '#dc2626', marginTop: '-6px' }}>
                    Margin: ₱{(Number(editForm.amount) - Number(editForm.costAmount)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>
                      Trading line
                    </label>
                    <select
                      value={editForm.line}
                      onChange={e => setEditForm({ ...editForm, line: e.target.value })}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white', cursor: 'pointer' }}
                    >
                      <option value="">— select line —</option>
                      {SO_LINES.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>
                      Lead source
                    </label>
                    <select
                      value={editForm.source}
                      onChange={e => setEditForm({ ...editForm, source: e.target.value })}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white', cursor: 'pointer' }}
                    >
                      <option value="">— select source —</option>
                      {SO_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {/* Document / PDF header fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>
                      Document date
                    </label>
                    <input type="date" value={editForm.docDate} onChange={e => setEditForm({ ...editForm, docDate: e.target.value })}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>
                      Prepared By
                    </label>
                    <input type="text" value={editForm.preparedBy} onChange={e => setEditForm({ ...editForm, preparedBy: e.target.value })} placeholder="Kim Karen D. Tagle"
                      style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white' }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>
                    Payment terms
                  </label>
                  <input type="text" value={editForm.paymentTerms} onChange={e => setEditForm({ ...editForm, paymentTerms: e.target.value })} placeholder="30 days from receipt/acceptance"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>
                    Terms &amp; conditions
                  </label>
                  <textarea value={editForm.termsAndConditions} onChange={e => setEditForm({ ...editForm, termsAndConditions: e.target.value })} rows={3} placeholder="One per line; leave blank to use the standard terms"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white', resize: 'vertical' }} />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#262626',
                    marginBottom: '6px',
                    fontFamily: 'Poppins, sans-serif'
                  }}>
                    Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid #d6d6d6',
                      fontSize: '14px',
                      fontFamily: 'Poppins, sans-serif',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="in-progress">In Progress</option>
                    <option value="PAID">PAID</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#262626',
                    marginBottom: '6px',
                    fontFamily: 'Poppins, sans-serif'
                  }}>
                    Description
                  </label>
                  <textarea
                    value={editForm.description}
                    onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3}
                    placeholder="Enter description..."
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid #d6d6d6',
                      fontSize: '14px',
                      fontFamily: 'Poppins, sans-serif',
                      backgroundColor: 'white',
                      transition: 'all 0.2s ease',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                paddingTop: '8px'
              }}>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '8px',
                    border: '1px solid #c9c9c9',
                    backgroundColor: 'white',
                    color: '#5a5a5a',
                    fontSize: '14px',
                    fontWeight: '500',
                    fontFamily: 'Poppins, sans-serif',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    flex: 1
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '12px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#d1b01b',
                    color: '#000000',
                    fontSize: '14px',
                    fontWeight: '500',
                    fontFamily: 'Poppins, sans-serif',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    flex: 1
                  }}
                >
                  Update SO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
