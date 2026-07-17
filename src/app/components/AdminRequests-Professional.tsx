import { useState, useEffect } from 'react';
import { UserCheck, X, Check, Search, RefreshCw, Mail, Phone, Calendar, User, Shield, Building2, AlertTriangle, Clock } from 'lucide-react';
import { fetchAdminRequests, approveAdminRequest, rejectAdminRequest } from '../api/client';
import { toast } from 'sonner';

interface AdminApprovalRequest {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  admin_notes?: string;
}

interface AdminRequestsProps {
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  userName?: string;
}

export function AdminRequests({ onApprove, onReject, userName }: AdminRequestsProps) {
  const [adminRequests, setAdminRequests] = useState<AdminApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchAdminRequests()
      .then(setAdminRequests)
      .catch(() => toast.error('Failed to load admin requests'))
      .finally(() => setLoading(false));
  }, []);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await approveAdminRequest(id, userName || 'Admin');
      toast.success('Admin request approved');
      setAdminRequests(prev => prev.filter(r => r.id !== id));
      onApprove?.(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve admin request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      await rejectAdminRequest(id, userName || 'Admin');
      toast.success('Admin request rejected');
      setAdminRequests(prev => prev.filter(r => r.id !== id));
      onReject?.(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject admin request');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredRequests = adminRequests.filter(request =>
    request.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    request.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    request.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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
          Loading admin requests...
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
            backgroundColor: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.3)'
          }}>
            <Building2 style={{ width: '24px', height: '24px', color: 'white' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#000000',
              margin: '0 0 8px 0',
              fontFamily: 'Poppins, sans-serif'
            }}>
              Admin Request Approvals
            </h1>
            <p style={{
              fontSize: '14px',
              color: '6b7280',
              margin: '0',
              fontFamily: 'Poppins, sans-serif'
            }}>
              Review and approve admin account requests
            </p>
          </div>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            fontSize: '14px',
            color: '#5a5a5a',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {adminRequests.length} pending
          </div>
          <button
            onClick={() => {
              setLoading(true);
              fetchAdminRequests()
                .then(setAdminRequests)
                .catch(() => toast.error('Failed to refresh'))
                .finally(() => setLoading(false));
            }}
            style={{
              backgroundColor: 'white',
              color: '#262626',
              padding: '12px 20px',
              borderRadius: '8px',
              border: '1px solid #d6d6d6',
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
              e.currentTarget.style.backgroundColor = '#ececec';
              e.currentTarget.style.borderColor = '#c9c9c9';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
              e.currentTarget.style.borderColor = '#d6d6d6';
            }}
          >
            <RefreshCw style={{ width: '16px', height: '16px', color: '#5a5a5a' }} />
            Refresh
          </button>
        </div>
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
              backgroundColor: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Building2 style={{ width: '24px', height: '24px', color: '#dc2626' }} />
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#000000',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {adminRequests.length}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#5a5a5a',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Pending Requests
          </p>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #d6d6d6',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: 'none',
        marginBottom: '32px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flex: 1,
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #d6d6d6',
          backgroundColor: '#ececec'
        }}>
          <Search style={{ width: '16px', height: '16px', color: '#5a5a5a' }} />
          <input
            type="text"
            placeholder="Search by name, email, or department..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              fontFamily: 'Poppins, sans-serif',
              backgroundColor: 'transparent',
              color: '#000000'
            }}
          />
        </div>
      </div>

      {/* ADMIN REQUESTS LIST */}
      {filteredRequests.length === 0 ? (
        <div style={{
          background: '#ffffff',
          border: '1px solid #d6d6d6',
          borderRadius: '16px',
          padding: '48px',
          textAlign: 'center',
          boxShadow: 'none',
        }}>
          <AlertTriangle style={{ 
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
            No Pending Admin Requests
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#5a5a5a',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            All admin requests have been reviewed
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
                      backgroundColor: '#fef2f2'
                    }}>
                      <Building2 style={{ width: '20px', height: '20px', color: '#dc2626' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{
                        fontSize: '18px',
                        fontWeight: '600',
                        color: '#000000',
                        margin: '0 0 4px 0',
                        fontFamily: 'Poppins, sans-serif'
                      }}>
                        {request.full_name}
                      </h3>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginBottom: '8px'
                      }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#dc2626',
                          backgroundColor: '#fffbeb',
                          border: '1px solid #fecaca',
                          fontFamily: 'Poppins, sans-serif'
                        }}>
                          <Shield style={{ width: '12px', height: '12px' }} />
                          Pending
                        </div>
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '12px',
                        marginBottom: '12px'
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <Mail style={{ width: '14px', height: '14px', color: '#5a5a5a' }} />
                          <span style={{
                            fontSize: '14px',
                            color: '#5a5a5a',
                            fontFamily: 'Poppins, sans-serif'
                          }}>
                            {request.email}
                          </span>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <Phone style={{ width: '14px', height: '14px', color: '#5a5a5a' }} />
                          <span style={{
                            fontSize: '14px',
                            color: '#5a5a5a',
                            fontFamily: 'Poppins, sans-serif'
                          }}>
                            {request.phone}
                          </span>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <Shield style={{ width: '14px', height: '14px', color: '#5a5a5a' }} />
                            <span style={{
                              fontSize: '14px',
                              color: '#5a5a5a',
                              fontFamily: 'Poppins, sans-serif'
                            }}>
                              {request.department}
                            </span>
                          </div>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <Calendar style={{ width: '14px', height: '14px', color: '#5a5a5a' }} />
                          <span style={{
                            fontSize: '14px',
                            color: '#5a5a5a',
                            fontFamily: 'Poppins, sans-serif'
                          }}>
                            {formatDate(request.requested_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center'
                  }}>
                    <button
                      onClick={() => handleApprove(request.id)}
                      disabled={processingId === request.id}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#059669',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Poppins, sans-serif',
                        cursor: processingId === request.id ? 'not-allowed' : 'pointer',
                        opacity: processingId === request.id ? 0.5 : 1,
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Check style={{ width: '14px', height: '14px' }} />
                      {processingId === request.id ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      disabled={processingId === request.id}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#dc2626',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Poppins, sans-serif',
                        cursor: processingId === request.id ? 'not-allowed' : 'pointer',
                        opacity: processingId === request.id ? 0.5 : 1,
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <X style={{ width: '14px', height: '14px' }} />
                      {processingId === request.id ? 'Processing...' : 'Reject'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
