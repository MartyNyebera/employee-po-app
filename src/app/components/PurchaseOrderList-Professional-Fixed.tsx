import { useState, useEffect } from 'react';
import { FileText, Plus, ShoppingCart, Package, Edit, Trash2, Filter, Printer, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../lib/confirm';
import { fetchApi, updatePurchaseOrder, deletePurchaseOrder } from '../api/client';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { CreatePurchaseOrderModal } from './CreatePurchaseOrderModal';
import { printPurchaseOrder } from '../lib/orderPrint';
import { nextDeptFor } from '../lib/nextDept';
import { SummaryStats } from './SummaryStats';
import { S, peso, toneText } from './crm/crmKit';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  client: string;
  description: string;
  amount: number;
  // Section C — #12: a PO clears two gates — 'pending' (awaiting Accounting) →
  // 'accounting-approved' (awaiting Admin) → 'approved'; 'rejected' sends it back to Purchasing.
  // 'in-progress' / 'RECEIVED' / 'cancelled' are set on the delivery leg once approved
  // (PUT /api/purchase-orders/:id/delivery). 'RECEIVED' is what counts as an expense.
  status: 'pending' | 'accounting-approved' | 'rejected' | 'approved' | 'in-progress' | 'partially-received' | 'RECEIVED' | 'cancelled';
  createdDate: string;
  deliveryDate: string;
  assignedAssets: string[];
  // Set when this order was raised against a purchase request (the /purchasing portal).
  // Approving the order is what approves that request.
  purchaseRequestId?: string | null;
  prNumber?: string | null;
  prStatus?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  // From the linked supplier record; printed in the document's supplier block.
  supplierTin?: string | null;
}

interface PurchaseOrderListProps {
  isAdmin: boolean;
}

const statusLabel = (s: string) => ({ 'pending':'Pending','accounting-approved':'Accounting-approved','rejected':'Rejected','approved':'Approved','in-progress':'In progress','partially-received':'Partially received','RECEIVED':'Received','cancelled':'Cancelled' }[s] || s);

export function PurchaseOrderList({ isAdmin }: PurchaseOrderListProps) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [approvingId, setApprovingId] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    status: '',
    description: '',
    customerAddress: '',
    customerContact: '',
    preparedBy: '',
    reviewedBy: '',
    poType: '',
    paymentTerms: '',
    lineItems: [],
    subTotal: 0,
    otherCharges: 0,
    vatAmount: 0,
    totalAmount: 0,
    termsAndConditions: '',
    docDate: '',
  });

  const fetchPurchaseOrders = async (trackPoId?: string, opts: { silent?: boolean } = {}) => {
    const { silent = false } = opts;
    try {
      const data = await fetchApi<any[]>('/purchase-orders');
      console.log('Raw API data:', data);
      const poData = (data || []).filter((item: any) => item.orderType !== 'sales');
      console.log('Filtered PO data:', poData);
      
      // Transform API data to match component interface
      const transformedData = poData.map((po: any) => ({
        id: po.id,
        poNumber: po.poNumber || po.po_number,
        client: po.client,
        description: po.description || '',
        amount: parseFloat(po.amount) || 0,
        status: po.status || 'pending',
        createdDate: po.createdDate || po.created_date,
        deliveryDate: po.deliveryDate || po.delivery_date,
        assignedAssets: po.assignedAssets || [],
        // editable PDF header fields — keep them on the row so edit + print read real values
        docDate: po.docDate || po.doc_date,
        preparedBy: po.preparedBy ?? po.prepared_by,
        reviewedBy: po.reviewedBy ?? po.reviewed_by,
        supplierAddress: po.supplierAddress ?? po.supplier_address,
        supplierContact: po.supplierContact ?? po.supplier_contact,
        paymentTerms: po.paymentTerms ?? po.payment_terms,
        termsAndConditions: po.termsAndConditions ?? po.terms_and_conditions,
        // Purchase-request link + approval record (drives the Approve action and the print stamp)
        purchaseRequestId: po.purchaseRequestId ?? po.purchase_request_id ?? null,
        prNumber: po.prNumber ?? po.pr_number ?? null,
        approvedBy: po.approvedBy ?? po.approved_by ?? null,
        approvedAt: po.approvedAt ?? po.approved_at ?? null,
      }));
      
      console.log('Transformed data:', transformedData);
      if (trackPoId) {
        const trackedPo = transformedData.find(po => po.id === trackPoId);
        console.log('PO with updated status (tracking ID:', trackPoId, '):', trackedPo);
      } else {
        console.log('PO with updated status:', transformedData.find(po => po.id === selectedPO?.id));
      }
      
      setPurchaseOrders(transformedData);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      // A background poll must not toast on a blip.
      if (!silent) toast.error('Failed to load purchase orders');
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

  // [removed] getStatusConfig/StatusBadge — the table now renders status as tone-coloured text
  // (toneText), so the old amber/green pill config is dead. Kept out to stay on-palette.

  const handleEditClick = (po: PurchaseOrder) => {
    console.log('Editing PO:', po);
    
    // Debug: Log the raw description
    console.log('🔍 PURCHASE ORDER RAW DESCRIPTION DEBUG:');
    console.log('Description:', JSON.stringify(po.description));
    console.log('Description split by lines:', po.description.split('\n'));
    
    // Parse the description to extract all fields
    let description = '';
    let customerAddress = '';
    let customerContact = '';
    let preparedBy = '';
    let reviewedBy = '';
    let poType = '';
    let paymentTerms = '';
    let lineItems = [];
    let subTotal = 0;
    let otherCharges = 0;
    let vatAmount = 0;
    let totalAmount = 0;
    let termsAndConditions = '';
    
    try {
      const lines = po.description.split('\n');
      let foundLineItems = false;
      let foundTerms = false;
      let firstLine = true;
      
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
        } else if (trimmedLine.includes('PO Type:')) {
          poType = trimmedLine.replace('PO Type:', '').trim();
        } else if (trimmedLine.includes('Payment Terms:')) {
          paymentTerms = trimmedLine.replace('Payment Terms:', '').trim();
        } else if (trimmedLine.includes('Line Items:')) {
          foundLineItems = true;
          try {
            const lineItemsStr = trimmedLine.replace('Line Items:', '').trim();
            if (lineItemsStr) {
              lineItems = JSON.parse(lineItemsStr);
            }
          } catch (e) {
            console.error('Error parsing line items:', e);
          }
        } else if (trimmedLine.includes('Sub Total:')) {
          subTotal = parseFloat(trimmedLine.replace('Sub Total:', '').trim().replace(/[^\d.-]/g, '')) || 0;
        } else if (trimmedLine.includes('Other Charges:')) {
          otherCharges = parseFloat(trimmedLine.replace('Other Charges:', '').trim().replace(/[^\d.-]/g, '')) || 0;
        } else if (trimmedLine.includes('VAT Amount:')) {
          vatAmount = parseFloat(trimmedLine.replace('VAT Amount:', '').trim().replace(/[^\d.-]/g, '')) || 0;
        } else if (trimmedLine.includes('Total Amount:')) {
          totalAmount = parseFloat(trimmedLine.replace('Total Amount:', '').trim().replace(/[^\d.-]/g, '')) || 0;
        } else if (trimmedLine.includes('Terms & Conditions:')) {
          foundTerms = true;
          // Start collecting terms
        } else if (foundTerms) {
          // Collect terms and conditions
          if (termsAndConditions) termsAndConditions += ' ' + trimmedLine;
          else termsAndConditions = trimmedLine;
        } else if (trimmedLine && !foundLineItems && !foundTerms && firstLine) {
          // First non-empty line is the product description
          description = trimmedLine;
          firstLine = false;
        }
      });
    } catch (error) {
      console.error('Error parsing PO description:', error);
      description = po.description;
    }
    
    // Debug: Log parsed values
    console.log('🔍 PURCHASE ORDER PARSED VALUES DEBUG:');
    console.log('Description:', JSON.stringify(description));
    console.log('Customer Address:', JSON.stringify(customerAddress));
    console.log('Customer Contact:', JSON.stringify(customerContact));
    console.log('Prepared By:', JSON.stringify(preparedBy));
    console.log('Reviewed By:', JSON.stringify(reviewedBy));
    console.log('PO Type:', JSON.stringify(poType));
    console.log('Payment Terms:', JSON.stringify(paymentTerms));
    console.log('Line Items:', lineItems);
    console.log('Sub Total:', subTotal);
    console.log('Total Amount:', totalAmount);
    
    setSelectedPO(po);
    setEditForm({
      status: po.status,
      description: description,
      // prefer the real columns; fall back to values parsed from the old description
      customerAddress: (po as any).supplierAddress || customerAddress,
      customerContact: (po as any).supplierContact || customerContact,
      preparedBy: (po as any).preparedBy || preparedBy,
      reviewedBy: (po as any).reviewedBy || reviewedBy,
      poType: poType,
      paymentTerms: (po as any).paymentTerms || paymentTerms,
      lineItems: lineItems,
      subTotal: subTotal,
      otherCharges: otherCharges,
      vatAmount: vatAmount,
      totalAmount: totalAmount,
      termsAndConditions: (po as any).termsAndConditions || termsAndConditions,
      docDate: ((po as any).docDate || (po as any).createdDate || '').slice(0, 10),
    });
    setIsEditing(true);
  };

  // Admin approval — the SECOND, final gate (Section C — #12). The order must already be
  // 'accounting-approved'. Approving flips the linked request to 'approved' (releasing the
  // withdrawal) in the same server transaction; rejecting sends the ORDER back to Purchasing to
  // revise & resubmit, and leaves the request untouched.
  const handleApprove = async (po: PurchaseOrder, status: 'approved' | 'disapproved') => {
    const what = po.prNumber ? `${po.poNumber} (for ${po.prNumber})` : po.poNumber;
    const ok = status === 'approved'
      ? await confirmDialog({ title: `Approve ${what}?`, message: po.prNumber ? 'This also approves the purchase request, releasing it for withdrawal.' : undefined, confirmLabel: 'Approve' })
      : await confirmDialog({ title: `Reject ${what}?`, message: 'The order goes back to Purchasing to revise and resubmit.', confirmLabel: 'Reject', tone: 'danger' });
    if (!ok) return;
    setApprovingId(po.id);
    try {
      await fetchApi(`/purchase-orders/${po.id}/approve`, { method: 'PUT', body: JSON.stringify({ status }) });
      toast.success(status === 'approved' ? 'Purchase order approved' : 'Purchase order rejected');
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      toast.error('Failed: ' + (e?.message || 'unknown error'));
    } finally { setApprovingId(''); }
  };

  const handleSaveEdit = async () => {
    if (!selectedPO) return;
    
    const poId = selectedPO.id;
    const newStatus = editForm.status;
    console.log('Saving edit with status:', newStatus);
    
    try {
      // Only update backend - UI is already updated by dropdown onChange
      const updated = await updatePurchaseOrder(selectedPO.id, {
        status: newStatus,
        description: editForm.description,
        // editable PDF header fields (real columns)
        docDate: editForm.docDate || null,
        preparedBy: editForm.preparedBy || null,
        reviewedBy: editForm.reviewedBy || null,
        supplierAddress: editForm.customerAddress || null,
        supplierContact: editForm.customerContact || null,
        paymentTerms: editForm.paymentTerms || null,
        termsAndConditions: editForm.termsAndConditions || null,
      });
      console.log('Backend updated:', updated);

      // Merge the saved row back into the visible list so the UI reflects the edit
      if (updated && (updated as any).id) {
        setPurchaseOrders(prev => prev.map(p =>
          p.id === poId ? { ...p, ...(updated as any) } : p
        ));
        setSelectedPO(prev => (prev ? { ...prev, ...(updated as any) } : prev));
      }

      setIsEditing(false);
      toast.success('Purchase order updated successfully');
      
      // Trigger Overview refresh to ensure consistency
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
    } catch (error) {
      console.error('Error updating purchase order:', error);
      toast.error('Failed to update purchase order');
      // Revert on error
      fetchPurchaseOrders();
    }
  };

  const handleDeletePO = async (po: PurchaseOrder) => {
    if (!(await confirmDialog({ title: `Delete PO ${po.poNumber}?`, message: 'This action cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) {
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

  // The document itself lives in lib/orderPrint — the purchasing and logistics portals print
  // the same order, and one template means one thing to keep correct. Signatures are fetched
  // per document (they are ~20KB each and are deliberately not on the list payload).
  const handlePrintPO = async (po: PurchaseOrder) => {
    const r = await printPurchaseOrder(po as any, () => fetchApi(`/purchase-orders/${po.id}/signatures`));
    if (!r.ok) toast.error(r.error || 'Failed to open the print window');
  };

  const filteredPOs = purchaseOrders.filter(po => {
    const matchesFilter = filter === 'all' || po.status === filter;
    const matchesSearch = searchTerm === '' || 
      po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.client.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const pendingCount = purchaseOrders.filter(po => po.status === 'pending').length;
  const accountingApprovedCount = purchaseOrders.filter(po => po.status === 'accounting-approved').length;
  const approvedCount = purchaseOrders.filter(po => po.status === 'approved').length;
  const receivedCount = purchaseOrders.filter(po => po.status === 'RECEIVED').length;

  useEffect(() => {
    fetchPurchaseOrders();
  }, [refreshKey]);

  // Real-time refresh - listen for order updates (but don't auto-fetch to avoid conflicts)
  useEffect(() => {
    const handleOrdersUpdated = () => {
      // Don't auto-fetch here - let the instant UI updates handle it
      console.log('ordersUpdated event received, but not auto-fetching to avoid conflicts');
    };

    window.addEventListener('ordersUpdated', handleOrdersUpdated);
    return () => window.removeEventListener('ordersUpdated', handleOrdersUpdated);
  }, []);

  // Live refresh — silent, and PAUSED whenever a create/edit modal is open or an approval is in
  // flight. This is the fragile screen: it does optimistic deletes and edits, so a background
  // refetch mid-action could revert an optimistic change or stomp an open editor. Gating on
  // those states is what keeps that from happening.
  useLiveRefresh(
    () => fetchPurchaseOrders(undefined, { silent: true }),
    { enabled: !showCreateModal && !selectedPO && !approvingId },
  );

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
          Loading purchase orders...
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={S.h1}>Purchase Orders</h1>
          <p style={S.sub}>Vendor & supplier orders — Accounting reviews, then an admin approves.</p>
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...S.input, width: 'auto', cursor: 'pointer' }}>
          <option value="all">All statuses</option>
          <option value="pending">Pending (accounting)</option>
          <option value="accounting-approved">Accounting-approved (admin)</option>
          <option value="approved">Approved</option>
          <option value="in-progress">In progress</option>
          <option value="partially-received">Partially received</option>
          <option value="RECEIVED">Received</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <SummaryStats items={[
        { label: 'Total POs', value: purchaseOrders.length },
        { label: 'Pending', value: pendingCount },
        { label: 'For admin', value: accountingApprovedCount, accent: true },
        { label: 'Approved', value: approvedCount },
        { label: 'Received', value: receivedCount },
      ]} />

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>PO #</th>
            <th style={S.th}>Supplier</th>
            <th style={S.th}>PR #</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Amount</th>
            <th style={S.th}>Status</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {filteredPOs.length === 0 ? (
              <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={6}>No purchase orders.</td></tr>
            ) : filteredPOs.map(po => (
              <tr key={po.id}>
                <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>{po.poNumber}</td>
                <td style={S.td}>{po.client}</td>
                <td style={S.td}>{po.prNumber || '—'}</td>
                <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: '#000000' }}>{peso(po.amount)}</td>
                <td style={S.td}>
                  <span style={{ color: toneText(po.status), fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{statusLabel(po.status)}</span>
                  {nextDeptFor(po.status, 'po') && <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '2px' }}>{nextDeptFor(po.status, 'po')}</div>}
                </td>
                <td style={S.td}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', flexWrap: 'wrap' }}>
                    <button className="crm-row-btn" title="Print" style={{ ...S.rowBtn, marginLeft: 0 }} onClick={() => handlePrintPO(po)}><Printer size={13} /></button>
                    {isAdmin && po.status === 'accounting-approved' && (
                      <>
                        <button className="crm-row-btn" title="Approve" style={{ ...S.rowBtn, marginLeft: 0, backgroundColor: '#d1b01b', border: '1px solid #d1b01b', color: '#000000' }} disabled={approvingId === po.id} onClick={() => handleApprove(po, 'approved')}><Check size={13} /></button>
                        <button className="crm-row-btn" title="Reject" style={{ ...S.rowBtn, marginLeft: 0, color: '#b91c1c' }} disabled={approvingId === po.id} onClick={() => handleApprove(po, 'disapproved')}><X size={13} /></button>
                      </>
                    )}
                    {/* #3 — an order can only be edited once it has been rejected (by the admin or
                        accounting); an in-flight or approved order is locked. */}
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

      {/* Edit PO Modal */}
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
                Edit Purchase Order
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
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#d6d6d6';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#e6e6e6';
                }}
              >
                <X style={{ width: '20px', height: '20px', color: '#5a5a5a' }} />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} style={{ padding: '24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
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
                    PO Number
                  </label>
                  <input
                    type="text"
                    value={selectedPO.poNumber}
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
                    Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={e => {
                      // Only stage the change on the edit form. The list, selectedPO,
                      // and Overview-refresh events are committed in handleSaveEdit()
                      // AFTER the backend confirms — doing it here made Cancel leave a
                      // phantom status and Overview recompute from an unsaved value.
                      setEditForm({ ...editForm, status: e.target.value });
                    }}
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
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#d1b01b';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(209, 176, 27, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d6d6d6';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="RECEIVED">Received</option>
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
                      resize: 'none',
                      transition: 'all 0.2s ease'
                    }}
                  />
                </div>

                {/* Document / PDF header fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>Document date</label>
                    <input type="date" value={editForm.docDate} onChange={e => setEditForm({ ...editForm, docDate: e.target.value })}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>Prepared By</label>
                    <input type="text" value={editForm.preparedBy} onChange={e => setEditForm({ ...editForm, preparedBy: e.target.value })} placeholder="Kim Karen D. Tagle"
                      style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white' }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>Supplier address</label>
                  <textarea value={editForm.customerAddress} onChange={e => setEditForm({ ...editForm, customerAddress: e.target.value })} rows={2}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white', resize: 'vertical' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>Supplier contact</label>
                  <input type="text" value={editForm.customerContact} onChange={e => setEditForm({ ...editForm, customerContact: e.target.value })}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>Payment terms</label>
                  <input type="text" value={editForm.paymentTerms} onChange={e => setEditForm({ ...editForm, paymentTerms: e.target.value })} placeholder="30 days from receipt/acceptance"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#262626', marginBottom: '6px', fontFamily: 'Poppins, sans-serif' }}>Terms &amp; conditions</label>
                  <textarea value={editForm.termsAndConditions} onChange={e => setEditForm({ ...editForm, termsAndConditions: e.target.value })} rows={3} placeholder="One per line; leave blank to use the standard terms"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d6d6d6', fontSize: '14px', fontFamily: 'Poppins, sans-serif', backgroundColor: 'white', resize: 'vertical' }} />
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
                    border: '1px solid #d6d6d6',
                    backgroundColor: 'white',
                    color: '#262626',
                    fontSize: '14px',
                    fontWeight: '500',
                    fontFamily: 'Poppins, sans-serif',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    flex: 1
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#ececec';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
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
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                    transition: 'all 0.2s ease',
                    flex: 1
                  }}
                >
                  {loading ? 'Updating...' : 'Update PO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
