import { useState, useEffect } from 'react';
import { FileText, Plus, ShoppingCart, Package, Edit, Trash2, Filter, Printer, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../lib/confirm';
import { fetchApi, updatePurchaseOrder, deletePurchaseOrder } from '../api/client';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { CreatePurchaseOrderModal } from './CreatePurchaseOrderModal';
import { printPurchaseOrder } from '../lib/orderPrint';
import { nextDeptFor } from '../lib/nextDept';

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
  status: 'pending' | 'accounting-approved' | 'rejected' | 'approved' | 'in-progress' | 'RECEIVED' | 'cancelled';
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

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; bgColor: string; borderColor: string; }> = {
      'pending': {
        color: '#d97706',
        bgColor: '#fffbeb',
        borderColor: '#fed7aa'
      },
      // Accounting has passed it; awaiting admin. Same amber family as pending — still in-queue.
      'accounting-approved': {
        color: '#b45309',
        bgColor: '#fffbeb',
        borderColor: '#fed7aa'
      },
      // Sent back to Purchasing to revise & resubmit.
      'rejected': {
        color: '#dc2626',
        bgColor: '#fef2f2',
        borderColor: '#fecaca'
      },
      'approved': {
        color: '#d1b01b', 
        bgColor: '#ececec', 
        borderColor: '#e3ca63'
      },
      // Logistics marks an approved order as an ongoing delivery.
      'in-progress': {
        color: '#d1b01b',
        bgColor: '#ececec',
        borderColor: '#e3ca63'
      },
      'RECEIVED': {
        color: '#059669',
        bgColor: '#f0fdf4',
        borderColor: '#bbf7d0'
      },
      'cancelled': {
        color: '#8a8a8a',
        bgColor: '#f4f4f4',
        borderColor: '#d6d6d6'
      },
    };
    // The fallback is why every status needs an entry above: an unmapped one silently renders
    // in Pending's colours, so a cancelled order would read as awaiting approval.
    return configs[status] || configs['pending'];
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const config = getStatusConfig(status);
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500',
        color: config.color,
        backgroundColor: config.bgColor,
        border: `1px solid ${config.borderColor}`,
        fontFamily: 'Poppins, sans-serif'
      }}>
        {status === 'accounting-approved' ? 'Awaiting admin'
          : status === 'pending' ? 'Awaiting accounting'
          : status.charAt(0).toUpperCase() + status.slice(1)}
      </div>
    );
  };

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
    <div style={{
      padding: '32px',
      fontFamily: 'Poppins, sans-serif',
      backgroundColor: '#ffffff',
      minHeight: '100vh'
    }}>
      {/* HEADER */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '32px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: '#d1b01b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 6px -1px rgba(209, 176, 27, 0.3)'
          }}>
            <ShoppingCart style={{ width: '24px', height: '24px', color: '#000000' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#000000',
              margin: '0 0 8px 0',
              fontFamily: 'Poppins, sans-serif'
            }}>
              Purchase Orders Management
            </h1>
            <p style={{
              fontSize: '14px',
              color: '#5a5a5a',
              margin: '0',
              fontFamily: 'Poppins, sans-serif'
            }}>
              Manage purchases from vendors and suppliers
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              backgroundColor: '#d1b01b',
              color: '#000000',
              padding: '12px 20px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '14px',
              fontWeight: '500',
              fontFamily: 'Poppins, sans-serif',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#d1b01b';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#d1b01b';
            }}
          >
            <Plus style={{ width: '16px', height: '16px' }} />
            New PO
          </button>
        )}
      </div>

      {/* METRIC CARDS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginBottom: '32px'
      }}>
        <div style={{
          background: '#ffffff',
          border: '1px solid #d6d6d6',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#ececec',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShoppingCart style={{ width: '24px', height: '24px', color: '#d1b01b' }} />
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#000000',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {purchaseOrders.length}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#5a5a5a',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Total POs
          </p>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #fffbeb',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#fffbeb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Package style={{ width: '24px', height: '24px', color: '#d97706' }} />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#d97706',
              backgroundColor: '#fffbeb',
              fontFamily: 'Poppins, sans-serif'
            }}>
              Pending
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#d97706',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {pendingCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#92400e',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Pending
          </p>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #d6d6d6',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#ececec',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FileText style={{ width: '24px', height: '24px', color: '#d1b01b' }} />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#d1b01b',
              backgroundColor: '#ececec',
              fontFamily: 'Poppins, sans-serif'
            }}>
              Approved
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#d1b01b',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {approvedCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#7a6a0c',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Approved
          </p>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #fffbeb',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#f0fdf4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Package style={{ width: '24px', height: '24px', color: '#059669' }} />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#059669',
              backgroundColor: '#f0fdf4',
              fontFamily: 'Poppins, sans-serif'
            }}>
              Received
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#059669',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {receivedCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#065f46',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Received
          </p>
        </div>
      </div>

      {/* FILTERS */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #d6d6d6',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        marginBottom: '32px'
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'center'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Filter style={{ width: '16px', height: '16px', color: '#5a5a5a' }} />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                padding: '12px 40px 12px 16px',
                borderRadius: '8px',
                border: '1px solid #d6d6d6',
                fontSize: '14px',
                fontFamily: 'Poppins, sans-serif',
                appearance: 'none',
                backgroundColor: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative'
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
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="in-progress">Ongoing delivery</option>
              <option value="RECEIVED">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <input
              type="text"
              placeholder="Search PO number or vendor..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid #d6d6d6',
                fontSize: '14px',
                fontFamily: 'Poppins, sans-serif',
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
            />
          </div>
        </div>
      </div>

      {/* PURCHASE ORDERS LIST */}
      {filteredPOs.length === 0 ? (
        <div style={{
          background: '#ffffff',
          border: '1px solid #d6d6d6',
          borderRadius: '16px',
          padding: '48px',
          textAlign: 'center',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}>
          <Package style={{ 
            width: '64px', 
            height: '64px', 
            color: '#c9c9c9',
            marginBottom: '16px',
            margin: '0 auto 16px'
          }} />
          <h3 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#262626',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            No purchase orders found
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#5a5a5a',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Create your first purchase order to get started.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gap: '16px'
        }}>
          {filteredPOs.map((po) => (
            <div
              key={po.id}
              style={{
                background: '#ffffff',
                border: '1px solid #d6d6d6',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '12px'
              }}>
                <span style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#000000',
                  fontFamily: 'Poppins, sans-serif'
                }}>
                  {po.poNumber}
                  {po.prNumber && (
                    <span style={{ fontSize: '12px', fontWeight: '500', color: '#5a5a5a', marginLeft: '8px', fontFamily: 'Poppins, sans-serif' }}>
                      for {po.prNumber}
                    </span>
                  )}
                </span>
                <StatusBadge status={po.status} />
                {nextDeptFor(po.status, 'po') && (
                  <span style={{ fontSize: '11px', color: '#8a8a8a', fontFamily: 'Poppins, sans-serif' }}>{nextDeptFor(po.status, 'po')}</span>
                )}
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '14px',
                color: '#5a5a5a',
                marginBottom: '8px',
                fontFamily: 'Poppins, sans-serif'
              }}>
                <span>Vendor: {po.client}</span>
                <span>{formatDate(po.createdDate)}</span>
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '14px',
                marginBottom: '20px'
              }}>
                <span style={{
                  color: '#5a5a5a',
                  fontFamily: 'Poppins, sans-serif'
                }}>
                  Delivery: {formatDate(po.deliveryDate)}
                </span>
                <span style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#000000',
                  fontFamily: 'Poppins, sans-serif'
                }}>
                  {formatCurrency(po.amount)}
                </span>
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px'
              }}>
                {isAdmin && (
                  <>
                    {po.status === 'accounting-approved' && (
                      <>
                        <button
                          onClick={() => handleApprove(po, 'approved')}
                          disabled={approvingId === po.id}
                          style={{
                            padding: '8px 12px', borderRadius: '6px', border: 'none',
                            backgroundColor: '#16a34a', color: 'white', fontSize: '12px',
                            fontWeight: '500', fontFamily: 'Poppins, sans-serif',
                            cursor: approvingId === po.id ? 'default' : 'pointer',
                            opacity: approvingId === po.id ? 0.6 : 1,
                            display: 'flex', alignItems: 'center', gap: '6px',
                          }}
                        >
                          <Check style={{ width: '14px', height: '14px' }} />
                          Approve
                        </button>
                        <button
                          onClick={() => handleApprove(po, 'disapproved')}
                          disabled={approvingId === po.id}
                          style={{
                            padding: '8px 12px', borderRadius: '6px', border: '1px solid #d6d6d6',
                            backgroundColor: 'white', color: '#dc2626', fontSize: '12px',
                            fontWeight: '500', fontFamily: 'Poppins, sans-serif',
                            cursor: approvingId === po.id ? 'default' : 'pointer',
                            opacity: approvingId === po.id ? 0.6 : 1,
                            display: 'flex', alignItems: 'center', gap: '6px',
                          }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleEditClick(po)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d6d6d6',
                        backgroundColor: 'white',
                        color: '#d1b01b',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Poppins, sans-serif',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#fbf7e8';
                        e.currentTarget.style.borderColor = '#d1b01b';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                        e.currentTarget.style.borderColor = '#d6d6d6';
                      }}
                    >
                      <Edit style={{ width: '14px', height: '14px' }} />
                      Edit
                    </button>
                    <button
                      onClick={() => handlePrintPO(po)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d6d6d6',
                        backgroundColor: 'white',
                        color: '#d1b01b',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Poppins, sans-serif',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#fbf7e8';
                        e.currentTarget.style.borderColor = '#d1b01b';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                        e.currentTarget.style.borderColor = '#d6d6d6';
                      }}
                    >
                      <Printer style={{ width: '14px', height: '14px' }} />
                      Print
                    </button>
                    <button
                      onClick={() => handleDeletePO(po)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #fecaca',
                        backgroundColor: 'white',
                        color: '#dc2626',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Poppins, sans-serif',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#fef2f2';
                        e.currentTarget.style.borderColor = '#dc2626';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                        e.currentTarget.style.borderColor = '#fecaca';
                      }}
                    >
                      <Trash2 style={{ width: '14px', height: '14px' }} />
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
