import { useState, useEffect } from 'react';
import { FileText, Plus, ShoppingCart, Package, Edit, Trash2, Filter, Printer, X, Check } from 'lucide-react';
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

  const fetchPurchaseOrders = async (trackPoId?: string) => {
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
        assignedAssets: po.assignedAssets || []
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

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; bgColor: string; borderColor: string; }> = {
      'pending': { 
        color: '#d97706', 
        bgColor: '#fffbeb', 
        borderColor: '#fed7aa'
      },
      'approved': { 
        color: '#3b82f6', 
        bgColor: '#dbeafe', 
        borderColor: '#93c5fd'
      },
      'RECEIVED': { 
        color: '#059669', 
        bgColor: '#f0fdf4', 
        borderColor: '#bbf7d0'
      },
    };
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
        fontFamily: 'Inter, sans-serif'
      }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>
    );
  };

  const handleEditClick = (po: PurchaseOrder) => {
    console.log('Editing PO:', po);
    setSelectedPO(po);
    setEditForm({
      status: po.status,
      description: po.description,
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedPO) return;
    
    const poId = selectedPO.id;
    const newStatus = editForm.status;
    console.log('Saving edit with status:', newStatus);
    
    try {
      // Only update backend - UI is already updated by dropdown onChange
      const updated = await updatePurchaseOrder(selectedPO.id, { status: newStatus, description: editForm.description });
      console.log('Backend updated:', updated);
      
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
              <strong>PO TYPE:</strong> Domestic Foreign<br>
              <strong>VAT Type:</strong> Vatable Non-Vatable
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
          border: '4px solid #e5e7eb',
          borderTopColor: '#3b82f6',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{
          fontSize: '16px',
          fontWeight: '500',
          color: '#6b7280',
          fontFamily: 'Inter, sans-serif'
        }}>
          Loading purchase orders...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '32px',
      fontFamily: 'Inter, sans-serif',
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
            backgroundColor: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)'
          }}>
            <ShoppingCart style={{ width: '24px', height: '24px', color: 'white' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#111827',
              margin: '0 0 8px 0',
              fontFamily: 'Plus Jakarta Sans, Inter, sans-serif'
            }}>
              Purchase Orders Management
            </h1>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0',
              fontFamily: 'Inter, sans-serif'
            }}>
              Manage purchases from vendors and suppliers
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '12px 20px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '14px',
              fontWeight: '500',
              fontFamily: 'Inter, sans-serif',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#3b82f6';
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
          border: '1px solid #e5e7eb',
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
              backgroundColor: '#dbeafe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShoppingCart style={{ width: '24px', height: '24px', color: '#3b82f6' }} />
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {purchaseOrders.length}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
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
              fontFamily: 'Inter, sans-serif'
            }}>
              Pending
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#d97706',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {pendingCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#92400e',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Pending
          </p>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #dbeafe',
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
              backgroundColor: '#dbeafe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FileText style={{ width: '24px', height: '24px', color: '#3b82f6' }} />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#3b82f6',
              backgroundColor: '#dbeafe',
              fontFamily: 'Inter, sans-serif'
            }}>
              Approved
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#3b82f6',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {approvedCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#1e40af',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
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
              fontFamily: 'Inter, sans-serif'
            }}>
              Received
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#059669',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {receivedCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#065f46',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Received
          </p>
        </div>
      </div>

      {/* FILTERS */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
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
            <Filter style={{ width: '16px', height: '16px', color: '#6b7280' }} />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                padding: '12px 40px 12px 16px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                fontSize: '14px',
                fontFamily: 'Inter, sans-serif',
                appearance: 'none',
                backgroundColor: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="RECEIVED">Received</option>
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
                border: '1px solid #e5e7eb',
                fontSize: '14px',
                fontFamily: 'Inter, sans-serif',
                transition: 'all 0.2s ease'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
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
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '48px',
          textAlign: 'center',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}>
          <Package style={{ 
            width: '64px', 
            height: '64px', 
            color: '#d1d5db',
            marginBottom: '16px',
            margin: '0 auto 16px'
          }} />
          <h3 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#374151',
            margin: '0 0 8px 0',
            fontFamily: 'Inter, sans-serif'
          }}>
            No purchase orders found
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
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
                border: '1px solid #e5e7eb',
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
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {po.poNumber}
                </span>
                <StatusBadge status={po.status} />
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '14px',
                color: '#6b7280',
                marginBottom: '8px',
                fontFamily: 'Inter, sans-serif'
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
                  color: '#6b7280',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  Delivery: {formatDate(po.deliveryDate)}
                </span>
                <span style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
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
                    <button
                      onClick={() => handleEditClick(po)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #dbeafe',
                        backgroundColor: 'white',
                        color: '#3b82f6',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Inter, sans-serif',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#eff6ff';
                        e.currentTarget.style.borderColor = '#3b82f6';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                        e.currentTarget.style.borderColor = '#dbeafe';
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
                        border: '1px solid #dbeafe',
                        backgroundColor: 'white',
                        color: '#3b82f6',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Inter, sans-serif',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#eff6ff';
                        e.currentTarget.style.borderColor = '#3b82f6';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                        e.currentTarget.style.borderColor = '#dbeafe';
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
                        fontFamily: 'Inter, sans-serif',
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
            maxWidth: '500px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#111827',
                margin: '0',
                fontFamily: 'Inter, sans-serif'
              }}>
                Edit Purchase Order
              </h2>
              <button
                onClick={() => setIsEditing(false)}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#f3f4f6',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#e5e7eb';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3f4f6';
                }}
              >
                <X style={{ width: '20px', height: '20px', color: '#6b7280' }} />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} style={{ padding: '24px' }}>
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
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
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
                      border: '1px solid #e5e7eb',
                      backgroundColor: '#f9fafb',
                      color: '#9ca3af',
                      fontFamily: 'Inter, sans-serif'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={e => {
                      const newStatus = e.target.value;
                      console.log('Status changed to:', newStatus);
                      console.log('selectedPO:', selectedPO);
                      console.log('selectedPO.id:', selectedPO?.id);
                      console.log('Current purchaseOrders count:', purchaseOrders.length);
                      
                      // Update form immediately
                      setEditForm({ ...editForm, status: newStatus });
                      
                      // Update UI immediately for instant feedback
                      if (selectedPO) {
                        console.log('Updating PO with ID:', selectedPO.id, 'to status:', newStatus);
                        
                        setPurchaseOrders(prevOrders => {
                          console.log('Before update:', prevOrders.map(po => ({ id: po.id, status: po.status })));
                          const updated = prevOrders.map(po => 
                            po.id === selectedPO.id ? { ...po, status: newStatus as PurchaseOrder['status'] } : po
                          );
                          console.log('After update:', updated.map(po => ({ id: po.id, status: po.status })));
                          return updated;
                        });
                        
                        // Update selected PO as well
                        setSelectedPO(prev => {
                          console.log('Updating selectedPO from', prev?.status, 'to', newStatus);
                          return prev ? { ...prev, status: newStatus as PurchaseOrder['status'] } : null;
                        });
                        
                        // Trigger Overview refresh immediately
                        window.dispatchEvent(new CustomEvent('ordersUpdated'));
                        // Also trigger a specific refresh for expense calculation
                        window.dispatchEvent(new CustomEvent('purchaseOrderStatusChanged', { 
                          detail: { poId: selectedPO.id, newStatus: newStatus, amount: selectedPO.amount }
                        }));
                        
                        console.log('UI updated immediately for status:', newStatus);
                      } else {
                        console.error('No selectedPO found!');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      fontSize: '14px',
                      fontFamily: 'Inter, sans-serif',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
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
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
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
                      border: '1px solid #e5e7eb',
                      fontSize: '14px',
                      fontFamily: 'Inter, sans-serif',
                      resize: 'none',
                      transition: 'all 0.2s ease'
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
                    border: '1px solid #e5e7eb',
                    backgroundColor: 'white',
                    color: '#374151',
                    fontSize: '14px',
                    fontWeight: '500',
                    fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    flex: 1
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
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
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '500',
                    fontFamily: 'Inter, sans-serif',
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
