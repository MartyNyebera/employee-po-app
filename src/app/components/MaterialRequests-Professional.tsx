import { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle, XCircle, User, Calendar, Tag, Filter, Search, RefreshCw, X, Trash2, Printer } from 'lucide-react';
import { fetchApi, getStoredAuth } from '../api/client';

interface MaterialRequest {
  id: number;
  request_number: string;
  employee_id: number;
  employee_name: string;
  item_name: string;
  item_code?: string;
  quantity_requested: number;
  unit: string;
  purpose: string;
  urgency: 'low' | 'normal' | 'high';
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  created_at: string;
  admin_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

interface MaterialRequestsProps {
  onBack?: () => void;
}

export function MaterialRequests({ onBack }: MaterialRequestsProps) {
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<MaterialRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Delete a material request
  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this material request?')) {
      return;
    }

    try {
      setProcessingId(id);
      await fetchApi(`/material-requests/${id}`, { method: 'DELETE' });
      setRequests(prev => prev.filter(req => req.id !== id));
    } catch (error) {
      console.error('Error deleting request:', error);
      alert('Failed to delete request. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  // Print Purchase Request
  const handlePrintPurchaseRequest = (request: MaterialRequest) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print Purchase Request documents');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>PURCHASE REQUEST - ${request.request_number}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Times New Roman', serif;
            font-size: 12px;
            line-height: 1.4;
            color: #000;
            background: white;
          }
          
          .page {
            width: 8.5in;
            height: 11in;
            padding: 0.3in;
            margin: 0 auto;
            overflow: hidden;
          }
          
          .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
          }
          
          .company-name {
            font-size: 24px;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 4px;
            letter-spacing: 1px;
          }
          
          .company-address {
            font-size: 10px;
            margin-bottom: 2px;
            font-weight: 500;
          }
          
          .company-contact {
            font-size: 10px;
            margin-bottom: 2px;
            font-weight: 500;
          }
          
          .proprietor {
            font-size: 10px;
            font-style: italic;
            font-weight: 500;
          }
          
          .document-title {
            font-size: 18px;
            font-weight: bold;
            text-align: center;
            margin: 20px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
            border: 2px solid #000;
            padding: 8px;
            background-color: #f5f5f5;
          }
          
          .info-section {
            margin-bottom: 15px;
          }
          
          .info-row {
            display: flex;
            gap: 15px;
            margin-bottom: 10px;
          }
          
          .info-box {
            flex: 1;
            border: 1px solid #000;
            padding: 8px;
            background-color: #fafafa;
          }
          
          .info-label {
            font-weight: bold;
            margin-bottom: 2px;
            font-size: 9px;
            text-transform: uppercase;
            color: #333;
          }
          
          .info-value {
            font-size: 12px;
            font-weight: 600;
          }
          
          .request-details {
            margin-bottom: 15px;
          }
          
          .section-title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 8px;
            text-transform: uppercase;
            border-bottom: 1px solid #000;
            padding-bottom: 3px;
          }
          
          .request-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
            border: 1px solid #000;
          }
          
          .request-table th {
            background-color: #e8e8e8;
            font-weight: bold;
            text-align: center;
            padding: 6px 4px;
            border: 1px solid #000;
            font-size: 10px;
            text-transform: uppercase;
          }
          
          .request-table td {
            padding: 6px 4px;
            text-align: left;
            border: 1px solid #000;
            font-size: 11px;
          }
          
          .quantity {
            text-align: center;
            font-weight: 600;
          }
          
          .unit {
            text-align: center;
            font-weight: 600;
          }
          
          .urgency {
            text-align: center;
            font-weight: 600;
            text-transform: uppercase;
          }
          
          .urgency-high {
            color: #d32f2f;
            font-weight: bold;
          }
          
          .urgency-normal {
            color: #1976d2;
          }
          
          .urgency-low {
            color: #388e3c;
          }
          
          .purpose-section {
            margin-bottom: 20px;
          }
          
          .purpose-box {
            border: 1px solid #000;
            padding: 8px;
            min-height: 40px;
            background-color: #fafafa;
            font-size: 11px;
            line-height: 1.3;
          }
          
          .signature-section {
            display: flex;
            justify-content: space-between;
            margin-top: 30px;
            gap: 20px;
          }
          
          .signature-box {
            flex: 1;
            border: 1px solid #000;
            padding: 8px;
            text-align: center;
            background-color: #fafafa;
          }
          
          .signature-title {
            font-weight: bold;
            margin-bottom: 20px;
            font-size: 11px;
            text-transform: uppercase;
          }
          
          .signature-line {
            border-bottom: 1px solid #000;
            margin-bottom: 4px;
            height: 30px;
            margin-top: 10px;
          }
          
          .signature-name {
            font-weight: 600;
            font-size: 11px;
          }
          
          .approval-section {
            margin-top: 25px;
            border: 2px solid #000;
            padding: 12px;
            text-align: center;
            background-color: #f5f5f5;
          }
          
          .approval-title {
            font-weight: bold;
            margin-bottom: 10px;
            text-transform: uppercase;
            font-size: 13px;
            letter-spacing: 1px;
          }
          
          .approval-note {
            font-style: italic;
            margin-bottom: 10px;
            font-size: 9px;
            color: #666;
          }
          
          .approval-box {
            display: flex;
            justify-content: space-around;
            align-items: flex-end;
            min-height: 50px;
          }
          
          .approval-signature {
            text-align: center;
            flex: 1;
          }
          
                    
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 11px;
          }
          
          .status-pending {
            background-color: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
          }
          
          .status-approved {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
          }
          
          .status-rejected {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
          }
          
          .status-completed {
            background-color: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
          }
          
          @media print {
            .page {
              margin: 0;
              padding: 0.2in;
              height: 11in;
              overflow: hidden;
            }
            
            body {
              -webkit-print-color-adjust: exact;
              color-adjust: exact;
              margin: 0;
              padding: 0;
            }
            
            * {
              box-sizing: border-box;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="company-name">KIMOEL TRADING & CONSTRUCTION INCORPORATED</div>
            <div class="company-address">PUROK 1, LODLOD, LIPA CITY, BATANGAS</div>
            <div class="company-contact">Tel: (043) - 741 - 2023 | Email: kimoel_leotagle@yahoo.com</div>
            <div class="proprietor">LEO TAGLE (Mobile: 0917 - 628 - 3217)</div>
          </div>
          
          <div class="document-title">Purchase Request Form</div>
          
          <div class="info-section">
            <div class="info-row">
              <div class="info-box">
                <div class="info-label">Request Number</div>
                <div class="info-value">${request.request_number}</div>
              </div>
              <div class="info-box">
                <div class="info-label">Request Date</div>
                <div class="info-value">${new Date(request.created_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-box">
                <div class="info-label">Urgency Level</div>
                <div class="info-value urgency-${request.urgency}">${request.urgency.toUpperCase()}</div>
              </div>
              <div class="info-box">
                <div class="info-label">Employee Name</div>
                <div class="info-value">${request.employee_name || 'Unknown Employee'}</div>
              </div>
            </div>
          </div>
          
          <div class="request-details">
            <div class="section-title">Item Details</div>
            <table class="request-table">
              <thead>
                <tr>
                  <th style="width: 35%;">Item Name</th>
                  <th style="width: 15%;">Item Code</th>
                  <th style="width: 15%;">Quantity</th>
                  <th style="width: 10%;">Unit</th>
                  <th style="width: 25%;">Purpose</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>${request.item_name}</strong></td>
                  <td class="unit">${request.item_code || 'N/A'}</td>
                  <td class="quantity">${request.quantity_requested}</td>
                  <td class="unit">${request.unit}</td>
                  <td>${request.purpose}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div class="purpose-section">
            <div class="section-title">Detailed Purpose Description</div>
            <div class="purpose-box">${request.purpose}</div>
          </div>
          
                    
          <div class="approval-section">
            <div class="approval-title">Official Approval Required</div>
            <div class="approval-note">This request must be approved by the authorized personnel before processing</div>
            <div class="approval-box">
              <div class="approval-signature">
                <div class="signature-title">Approved By</div>
                <div class="signature-line"></div>
                <div class="signature-name">Leo Tagle</div>
                <div style="font-size: 11px; color: #666; margin-top: 5px;">Authorized Signatory</div>
              </div>
              <div class="approval-signature">
                <div class="signature-title">Date Approved</div>
                <div class="signature-line"></div>
                <div class="signature-name">_________________________</div>
                <div style="font-size: 11px; color: #666; margin-top: 5px;">MM/DD/YYYY</div>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // Fetch all material requests
  const fetchRequests = async () => {
    try {
      setLoading(true);
      const data = await fetchApi('/material-requests');
      
      // Ensure data is an array
      const requestsArray = Array.isArray(data) ? data : [];
      setRequests(requestsArray);
    } catch (error) {
      console.error('Error fetching material requests:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  // Filter requests
  const filteredRequests = requests.filter(request => {
    const matchesFilter = filter === 'all' || request.urgency === filter;
    const matchesSearch = request.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         request.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (request.item_code && request.item_code.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  // Handle approve/reject
  const handleReview = async (requestId: number, status: 'approved' | 'rejected', adminNotes?: string) => {
    setProcessingId(requestId);
    try {
      const auth = getStoredAuth();
      const adminId = auth?.user?.id ? parseInt(auth.user.id) : 1; // Fallback to ID 1
      
      await fetchApi(`/material-requests/${requestId}/review`, {
        method: 'PUT',
        body: JSON.stringify({
          status,
          admin_notes: adminNotes || '',
          reviewed_by: adminId,
        }),
      });

      // Refresh requests
      await fetchRequests();
      setShowDetailsModal(false);
      setSelectedRequest(null);
    } catch (error) {
      console.error('Error reviewing request:', error);
      alert('Failed to update request');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; bgColor: string; borderColor: string; icon: React.ReactNode; }> = {
      'approved': { 
        color: '#059669', 
        bgColor: '#f0fdf4', 
        borderColor: '#bbf7d0',
        icon: <CheckCircle style={{ width: '16px', height: '16px' }} />
      },
      'rejected': { 
        color: '#dc2626', 
        bgColor: '#fef2f2', 
        borderColor: '#fecaca',
        icon: <XCircle style={{ width: '16px', height: '16px' }} />
      },
      'completed': { 
        color: '#3b82f6', 
        bgColor: '#dbeafe', 
        borderColor: '#93c5fd',
        icon: <Package style={{ width: '16px', height: '16px' }} />
      },
      'pending': { 
        color: '#d97706', 
        bgColor: '#fffbeb', 
        borderColor: '#fed7aa',
        icon: <Clock style={{ width: '16px', height: '16px' }} />
      },
    };
    return configs[status] || configs['pending'];
  };

  const getUrgencyConfig = (urgency: string) => {
    const configs: Record<string, { color: string; bgColor: string; borderColor: string; }> = {
      'high': { 
        color: '#dc2626', 
        bgColor: '#fef2f2', 
        borderColor: '#fecaca'
      },
      'normal': { 
        color: '#3b82f6', 
        bgColor: '#dbeafe', 
        borderColor: '#93c5fd'
      },
      'low': { 
        color: '#6b7280', 
        bgColor: '#f3f4f6', 
        borderColor: '#d1d5db'
      },
    };
    return configs[urgency] || configs['low'];
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
        {config.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>
    );
  };

  const UrgencyBadge = ({ urgency }: { urgency: string }) => {
    const config = getUrgencyConfig(urgency);
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
        {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
      </div>
    );
  };

  const statusCounts = {
    all: requests.length,
    low: requests.filter(r => r.urgency === 'low').length,
    normal: requests.filter(r => r.urgency === 'normal').length,
    high: requests.filter(r => r.urgency === 'high').length,
  };

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
          borderTopColor: '#10b981',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{
          fontSize: '16px',
          fontWeight: '500',
          color: '#6b7280',
          fontFamily: 'Inter, sans-serif'
        }}>
          Loading material requests...
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
            backgroundColor: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
          }}>
            <Package style={{ width: '24px', height: '24px', color: 'white' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#111827',
              margin: '0 0 8px 0',
              fontFamily: 'Plus Jakarta Sans, Inter, sans-serif'
            }}>
              Material Requests Management
            </h1>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0',
              fontFamily: 'Inter, sans-serif'
            }}>
              Review and manage employee material requests
            </p>
          </div>
        </div>
        <button
          onClick={fetchRequests}
          style={{
            backgroundColor: 'white',
            color: '#374151',
            padding: '12px 20px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
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
            e.currentTarget.style.backgroundColor = '#f9fafb';
            e.currentTarget.style.borderColor = '#d1d5db';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
            e.currentTarget.style.borderColor = '#e5e7eb';
          }}
        >
          <RefreshCw style={{ width: '16px', height: '16px', color: '#6b7280' }} />
          Refresh
        </button>
      </div>

      {/* METRIC CARDS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginBottom: '32px'
      }}>
        {Object.entries(statusCounts).map(([status, count]) => (
          <div
            key={status}
            onClick={() => setFilter(status)}
            style={{
              background: filter === status ? '#dbeafe' : '#ffffff',
              border: `1px solid ${filter === status ? '#93c5fd' : '#e5e7eb'}`,
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
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
              fontSize: '32px',
              fontWeight: '700',
              color: filter === status ? '#1e40af' : '#111827',
              margin: '0 0 8px 0',
              fontFamily: 'Plus Jakarta Sans, Inter, monospace'
            }}>
              {count}
            </div>
            <div style={{
              fontSize: '14px',
              fontWeight: '500',
              color: filter === status ? '#1e40af' : '#6b7280',
              margin: '0',
              fontFamily: 'Inter, sans-serif',
              textTransform: 'capitalize'
            }}>
              {status}
            </div>
          </div>
        ))}
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
            gap: '12px',
            flex: 1,
            minWidth: '250px',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb'
          }}>
            <Search style={{ width: '16px', height: '16px', color: '#6b7280' }} />
            <input
              type="text"
              placeholder="Search requests..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                fontSize: '14px',
                fontFamily: 'Inter, sans-serif',
                backgroundColor: 'transparent',
                color: '#111827'
              }}
            />
          </div>
          <div style={{
            display: 'flex',
            gap: '8px'
          }}>
            {['all', 'low', 'normal', 'high'].map(urgency => (
              <button
                key={urgency}
                onClick={() => setFilter(urgency)}
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  fontSize: '14px',
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  backgroundColor: filter === urgency ? '#dbeafe' : 'white',
                  color: filter === urgency ? '#1e40af' : '#374151',
                  fontWeight: '500'
                }}
              >
                {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* REQUESTS LIST */}
      {filteredRequests.length === 0 ? (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '48px',
          textAlign: 'center',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
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
            No requests found
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gap: '20px'
        }}>
          {filteredRequests.map((request) => (
            <div
              key={request.id}
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
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '24px'
              }}>
                <div style={{
                  flex: 1
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    marginBottom: '16px'
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: getStatusConfig(request.status).bgColor
                    }}>
                      {getStatusConfig(request.status).icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{
                        fontSize: '18px',
                        fontWeight: '600',
                        color: '#111827',
                        margin: '0 0 4px 0',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        {request.item_name}
                      </h3>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginBottom: '8px'
                      }}>
                        <UrgencyBadge urgency={request.urgency} />
                      </div>
                      <div style={{
                        fontSize: '14px',
                        color: '#6b7280',
                        marginBottom: '8px',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        {request.quantity_requested} {request.unit}
                        {request.item_code && ` • ${request.item_code}`}
                      </div>
                      <p style={{
                        fontSize: '14px',
                        color: '#6b7280',
                        marginBottom: '12px',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        {request.purpose}
                      </p>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        color: '#6b7280',
                        marginBottom: '12px'
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <User style={{ width: '12px', height: '12px' }} />
                          <span>{request.employee_name}</span>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Calendar style={{ width: '12px', height: '12px' }} />
                          <span>{new Date(request.created_at).toLocaleDateString()}</span>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Tag style={{ width: '12px', height: '12px' }} />
                          <span>{request.request_number}</span>
                        </div>
                      </div>
                      {request.admin_notes && (
                        <div style={{
                          marginTop: '12px',
                          padding: '12px',
                          borderRadius: '8px',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb'
                        }}>
                          <p style={{
                            fontSize: '14px',
                            color: '#374151',
                            fontFamily: 'Inter, sans-serif'
                          }}>
                            <strong>Admin Notes:</strong> {request.admin_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center'
                  }}>
                    <button
                      onClick={() => {
                        setSelectedRequest(request);
                        setShowDetailsModal(true);
                      }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        backgroundColor: 'white',
                        color: '#374151',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Inter, sans-serif',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => handlePrintPurchaseRequest(request)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: '#374151',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Inter, sans-serif',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Printer style={{ width: '14px', height: '14px' }} />
                      Print Request
                    </button>
                    <button
                      onClick={() => handleDelete(request.id)}
                      disabled={processingId === request.id}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: '#374151',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Inter, sans-serif',
                        cursor: processingId === request.id ? 'not-allowed' : 'pointer',
                        opacity: processingId === request.id ? 0.5 : 1,
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Trash2 style={{ width: '14px', height: '14px' }} />
                      {processingId === request.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedRequest && (
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
            maxWidth: '600px',
            maxHeight: '90vh',
            overflowY: 'auto'
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
                Request Details
              </h2>
              <button
                onClick={() => setShowDetailsModal(false)}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#f3f4f6',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <X style={{ width: '20px', height: '20px', color: '#6b7280' }} />
              </button>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '20px',
              padding: '24px'
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
                  Request Number
                </label>
                <p style={{
                  fontSize: '14px',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {selectedRequest.request_number}
                </p>
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
                <div style={{ marginTop: '4px' }}>
                  <StatusBadge status={selectedRequest.status} />
                </div>
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
                  Employee
                </label>
                <p style={{
                  fontSize: '14px',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {selectedRequest.employee_name}
                </p>
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
                  Date Requested
                </label>
                <p style={{
                  fontSize: '14px',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {new Date(selectedRequest.created_at).toLocaleDateString()}
                </p>
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
                  Item
                </label>
                <p style={{
                  fontSize: '14px',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {selectedRequest.item_name}
                </p>
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
                  Quantity
                </label>
                <p style={{
                  fontSize: '14px',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {selectedRequest.quantity_requested} {selectedRequest.unit}
                </p>
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
                  Urgency
                </label>
                <div style={{ marginTop: '4px' }}>
                  <UrgencyBadge urgency={selectedRequest.urgency} />
                </div>
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
                  Item Code
                </label>
                <p style={{
                  fontSize: '14px',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {selectedRequest.item_code || 'N/A'}
                </p>
              </div>
            </div>
            
            <div style={{
              padding: '0 24px 24px'
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
                  Purpose
                </label>
                <p style={{
                  fontSize: '14px',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {selectedRequest.purpose}
                </p>
              </div>
              {selectedRequest.admin_notes && (
                <div style={{
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '12px',
                  marginTop: '16px'
                }}>
                  <p style={{
                    fontSize: '14px',
                    color: '#374151',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    <strong>Admin Notes:</strong> {selectedRequest.admin_notes}
                  </p>
                </div>
              )}
            </div>
            
            <div style={{
              display: 'flex',
              gap: '12px',
              padding: '0 24px 24px'
            }}>
              <button
                onClick={() => setShowDetailsModal(false)}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white',
                  color: '#374151',
                  fontSize: '14px',
                  fontWeight: '500',
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Close
              </button>
              {selectedRequest.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleReview(selectedRequest.id, 'approved')}
                    disabled={processingId === selectedRequest.id}
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#059669',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '500',
                      fontFamily: 'Inter, sans-serif',
                      cursor: processingId === selectedRequest.id ? 'not-allowed' : 'pointer',
                      opacity: processingId === selectedRequest.id ? 0.5 : 1,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {processingId === selectedRequest.id ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleReview(selectedRequest.id, 'rejected')}
                    disabled={processingId === selectedRequest.id}
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#dc2626',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '500',
                      fontFamily: 'Inter, sans-serif',
                      cursor: processingId === selectedRequest.id ? 'not-allowed' : 'pointer',
                      opacity: processingId === selectedRequest.id ? 0.5 : 1,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {processingId === selectedRequest.id ? 'Processing...' : 'Reject'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
