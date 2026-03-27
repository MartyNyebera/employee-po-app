import { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle, XCircle, User, Calendar, Tag, Filter, Search, RefreshCw, X } from 'lucide-react';
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
    const matchesFilter = filter === 'all' || request.status === filter;
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
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    completed: requests.filter(r => r.status === 'completed').length,
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
            {['all', 'pending', 'approved', 'rejected', 'completed'].map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  fontSize: '14px',
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  backgroundColor: filter === status ? '#dbeafe' : 'white',
                  color: filter === status ? '#1e40af' : '#374151',
                  fontWeight: '500'
                }}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
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
                        <StatusBadge status={request.status} />
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
                    {request.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleReview(request.id, 'approved')}
                          disabled={processingId === request.id}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#059669',
                            color: 'white',
                            fontSize: '12px',
                            fontWeight: '500',
                            fontFamily: 'Inter, sans-serif',
                            cursor: processingId === request.id ? 'not-allowed' : 'pointer',
                            opacity: processingId === request.id ? 0.5 : 1,
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {processingId === request.id ? 'Processing...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReview(request.id, 'rejected')}
                          disabled={processingId === request.id}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#dc2626',
                            color: 'white',
                            fontSize: '12px',
                            fontWeight: '500',
                            fontFamily: 'Inter, sans-serif',
                            cursor: processingId === request.id ? 'not-allowed' : 'pointer',
                            opacity: processingId === request.id ? 0.5 : 1,
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {processingId === request.id ? 'Processing...' : 'Reject'}
                        </button>
                      </>
                    )}
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
