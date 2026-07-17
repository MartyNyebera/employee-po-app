import { useState, useEffect } from 'react';
import { fetchPurchaseOrders, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, deleteSalesOrder, fetchSalesOrders, createSalesOrder, updateSalesOrder, fetchApi } from '../api/client';
import { fetchVehicles, type Vehicle } from '../api/fleet';
import { printSalesOrder } from '../lib/orderPrint';
import { CreateSOModal } from './CreatePOModal';
import { FileText, Plus, DollarSign, Calendar, Building2, Truck, Edit, Filter, Printer, Trash2, X, Search, Check, Package } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../lib/confirm';

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
  status: 'pending' | 'approved' | 'in-progress' | 'PAID' | 'completed';
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
  status: 'pending' | 'approved' | 'in-progress' | 'PAID' | 'completed';
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

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; bgColor: string; borderColor: string; icon: React.ReactNode; }> = {
      'pending': { 
        color: '#059669', 
        bgColor: '#f0fdf4', 
        borderColor: '#bbf7d0',
        icon: <Calendar style={{ width: '16px', height: '16px' }} />
      },
      'approved': { 
        color: '#059669', 
        bgColor: '#f0fdf4', 
        borderColor: '#bbf7d0',
        icon: <Check style={{ width: '16px', height: '16px' }} />
      },
      'in-progress': { 
        color: '#d1b01b', 
        bgColor: '#fbf7e8', 
        borderColor: '#e8d89a',
        icon: <Truck style={{ width: '16px', height: '16px' }} />
      },
      'PAID': { 
        color: '#d1b01b', 
        bgColor: '#fbf7e8', 
        borderColor: '#e8d89a',
        icon: <DollarSign style={{ width: '16px', height: '16px' }} />
      },
      'completed': { 
        color: '#065f46', 
        bgColor: '#ecfdf5', 
        borderColor: '#a7f3d0',
        icon: <Check style={{ width: '16px', height: '16px' }} />
      },
      'deleting': { 
        color: '#dc2626', 
        bgColor: '#fef2f2', 
        borderColor: '#fecaca',
        icon: <div style={{ width: '16px', height: '16px' }}>⏳</div>
      }
    };
    return configs[status] || configs.pending;
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
        {config.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount);
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
    <div style={{
      padding: '32px',
      fontFamily: 'Poppins, sans-serif',
      backgroundColor: '#ffffff',
      minHeight: '100vh',
      maxWidth: '100vw',
      overflow: 'hidden',
      boxSizing: 'border-box'
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
            <FileText style={{ width: '24px', height: '24px', color: '#000000' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#000000',
              margin: '0 0 8px 0',
              fontFamily: 'Poppins, sans-serif'
            }}>
              Sales Orders Management
            </h1>
            <p style={{
              fontSize: '14px',
              color: '#5a5a5a',
              margin: '0',
              fontFamily: 'Poppins, sans-serif'
            }}>
              Track sales orders and customer deliveries
            </p>
          </div>
        </div>
        {isAdmin && (
          <div style={{
            display: 'flex',
            gap: '16px'
          }}>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                backgroundColor: '#d1b01b',
                color: '#000000',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontFamily: 'Poppins, sans-serif',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#d1b01b';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#d1b01b';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <Plus style={{ width: '16px', height: '16px' }} />
              Add Sales Order
            </button>
            <button
              onClick={() => {
                setRefreshKey(prev => prev + 1);
              }}
              style={{
                backgroundColor: '#e6e6e6',
                color: '#262626',
                border: '1px solid #c9c9c9',
                borderRadius: '8px',
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontFamily: 'Poppins, sans-serif',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#d6d6d6';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#e6e6e6';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              🔄 Refresh
            </button>
          </div>
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
          boxShadow: 'none',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = 'none';
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
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#000000',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {orders.length}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#5a5a5a',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Total SOs
          </p>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #fffbeb',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: 'none',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = 'none';
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
          boxShadow: 'none',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = 'none';
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
          border: '1px solid #f0fdf4',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: 'none',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = 'none';
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
              <Check style={{ width: '24px', height: '24px', color: '#059669' }} />
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
              PAID
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#059669',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {paidCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#065f46',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            PAID
          </p>
        </div>
      </div>

      {/* SEARCH AND FILTER BAR */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flex: 1,
          minWidth: '300px'
        }}>
          <Search style={{ width: '16px', height: '16px', color: '#5a5a5a' }} />
          <input
            type="text"
            placeholder="Search sales orders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid #c9c9c9',
              fontSize: '14px',
              fontFamily: 'Poppins, sans-serif',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#d1b01b';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(209, 176, 27, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#c9c9c9';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <Filter style={{ width: '16px', height: '16px', color: '#5a5a5a' }} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '12px 40px 12px 16px',
              borderRadius: '8px',
              border: '1px solid #c9c9c9',
              fontSize: '14px',
              fontFamily: 'Poppins, sans-serif',
              backgroundColor: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundSize: '16px'
            }}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="in-progress">In Progress</option>
            <option value="PAID">PAID</option>
          </select>
        </div>
      </div>

      {/* SALES ORDERS LIST */}
      {filteredOrders.length === 0 ? (
        <div style={{
          background: '#ffffff',
          border: '1px solid #d6d6d6',
          borderRadius: '16px',
          padding: '48px',
          textAlign: 'center',
          boxShadow: 'none'
        }}>
          <FileText style={{ 
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
            No sales orders found
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#5a5a5a',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Create your first sales order to get started.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          width: '100%',
          maxWidth: '100%'
        }}>
          {filteredOrders.map((po) => (
            <div
              key={po.id}
              style={{
                background: '#ffffff',
                border: '1px solid #d6d6d6',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: 'none',
                transition: 'all 0.2s ease',
                overflow: 'hidden',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                wordBreak: 'break-word',
                hyphens: 'auto'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '12px',
                gap: '16px'
              }}>
                <span style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#000000',
                  fontFamily: 'Poppins, sans-serif'
                }}>
                  {po.soNumber}
                </span>
                <StatusBadge status={po.status} />
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '14px',
                color: '#5a5a5a',
                marginBottom: '8px',
                fontFamily: 'Poppins, sans-serif'
              }}>
                <span>Customer: {po.client}</span>
                <span>{formatDate(po.createdDate)}</span>
              </div>
              
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginBottom: '20px',
                width: '100%',
                boxSizing: 'border-box',
                overflow: 'hidden'
              }}>
                <span style={{
                  color: '#5a5a5a',
                  fontFamily: 'Poppins, sans-serif',
                  fontSize: '14px',
                  display: 'block',
                  width: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  Delivery: {formatDate(po.deliveryDate)}
                </span>
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  width: '100%',
                  overflow: 'hidden',
                  flexShrink: 0
                }}>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#000000',
                    fontFamily: 'Poppins, sans-serif',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                    lineHeight: '1.2'
                  }}>
                    {formatCurrency(po.amount)}
                  </span>
                </div>
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px'
              }}>
                {isAdmin && (
                  <>
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
                    >
                      <Edit style={{ width: '14px', height: '14px' }} />
                      Edit
                    </button>
                    <button
                      onClick={() => handlePrintSO(po)}
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
                    Customer Name
                  </label>
                  <input
                    type="text"
                    value={editForm.customerName}
                    onChange={e => setEditForm({ ...editForm, customerName: e.target.value })}
                    placeholder="Enter customer name..."
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
                    Customer Address
                  </label>
                  <textarea
                    value={editForm.customerAddress}
                    onChange={e => setEditForm({ ...editForm, customerAddress: e.target.value })}
                    rows={2}
                    placeholder="Enter customer address..."
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
                    Customer Contact
                  </label>
                  <input
                    type="text"
                    value={editForm.customerContact}
                    onChange={e => setEditForm({ ...editForm, customerContact: e.target.value })}
                    placeholder="Enter customer contact..."
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
                      Link to customer
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
                  <div style={{ fontSize: '13px', fontWeight: 600, color: (Number(editForm.amount) - Number(editForm.costAmount)) >= 0 ? '#059669' : '#dc2626', marginTop: '-6px' }}>
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
