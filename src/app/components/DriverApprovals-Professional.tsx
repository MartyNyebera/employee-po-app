import { useState, useEffect } from 'react';
import { UserCheck, X, Check, Search, RefreshCw, Mail, Phone, Calendar, User, Shield, Truck } from 'lucide-react';
import { fetchPendingDrivers, approveDriver, rejectDriver } from '../api/client';
import { toast } from 'sonner';

interface DriverRegistration {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  license_number: string;
  vehicle_assigned: string;
  hire_date: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface DriverApprovalsProps {
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  userName?: string;
}

export function DriverApprovals({ onApprove, onReject, userName }: DriverApprovalsProps) {
  const [pendingDrivers, setPendingDrivers] = useState<DriverRegistration[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchPendingDrivers()
      .then(setPendingDrivers)
      .catch(() => toast.error('Failed to load driver registrations'))
      .finally(() => setLoading(false));
  }, []);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await approveDriver(id, userName || 'Admin');
      toast.success('Driver registration approved');
      setPendingDrivers(prev => prev.filter(r => r.id !== id));
      onApprove?.(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve driver');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      await rejectDriver(id, userName || 'Admin');
      toast.success('Driver registration rejected');
      setPendingDrivers(prev => prev.filter(r => r.id !== id));
      onReject?.(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject driver');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredDrivers = pendingDrivers.filter(driver =>
    driver.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.license_number.toLowerCase().includes(searchTerm.toLowerCase())
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
          Loading driver registrations...
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
            <Truck style={{ width: '24px', height: '24px', color: 'white' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#111827',
              margin: '0 0 8px 0',
              fontFamily: 'Plus Jakarta Sans, Inter, sans-serif'
            }}>
              Driver Registration Approvals
            </h1>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0',
              fontFamily: 'Inter, sans-serif'
            }}>
              Review and approve driver account requests
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
            color: '#6b7280',
            fontFamily: 'Inter, sans-serif'
          }}>
            {pendingDrivers.length} pending
          </div>
          <button
            onClick={() => {
              setLoading(true);
              fetchPendingDrivers()
                .then(setPendingDrivers)
                .catch(() => toast.error('Failed to refresh'))
                .finally(() => setLoading(false));
            }}
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
              backgroundColor: '#d1fae5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Truck style={{ width: '24px', height: '24px', color: '#10b981' }} />
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {pendingDrivers.length}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Pending Registrations
          </p>
        </div>
      </div>

      {/* SEARCH BAR */}
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
          alignItems: 'center',
          gap: '12px',
          flex: 1,
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb'
        }}>
          <Search style={{ width: '16px', height: '16px', color: '#6b7280' }} />
          <input
            type="text"
            placeholder="Search by name, email, or license number..."
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
      </div>

      {/* DRIVERS LIST */}
      {filteredDrivers.length === 0 ? (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '48px',
          textAlign: 'center',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}>
          <Truck style={{ 
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
            No Pending Driver Registrations
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            All driver registrations have been reviewed
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gap: '20px'
        }}>
          {filteredDrivers.map((driver) => (
            <div
              key={driver.id}
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
                      backgroundColor: '#d1fae5'
                    }}>
                      <Truck style={{ width: '20px', height: '20px', color: '#10b981' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{
                        fontSize: '18px',
                        fontWeight: '600',
                        color: '#111827',
                        margin: '0 0 4px 0',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        {driver.full_name}
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
                          color: '#d97706',
                          backgroundColor: '#fffbeb',
                          border: '1px solid #fed7aa',
                          fontFamily: 'Inter, sans-serif'
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
                          <Mail style={{ width: '14px', height: '14px', color: '#6b7280' }} />
                          <span style={{
                            fontSize: '14px',
                            color: '#6b7280',
                            fontFamily: 'Inter, sans-serif'
                          }}>
                            {driver.email}
                          </span>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <Phone style={{ width: '14px', height: '14px', color: '#6b7280' }} />
                          <span style={{
                            fontSize: '14px',
                            color: '#6b7280',
                            fontFamily: 'Inter, sans-serif'
                          }}>
                            {driver.phone}
                          </span>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <Shield style={{ width: '14px', height: '14px', color: '#6b7280' }} />
                          <span style={{
                            fontSize: '14px',
                            color: '#6b7280',
                            fontFamily: 'Inter, sans-serif'
                          }}>
                            {driver.license_number}
                          </span>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <Calendar style={{ width: '14px', height: '14px', color: '#6b7280' }} />
                          <span style={{
                            fontSize: '14px',
                            color: '#6b7280',
                            fontFamily: 'Inter, sans-serif'
                          }}>
                            {formatDate(driver.created_at)}
                          </span>
                        </div>
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12px',
                        color: '#6b7280',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#f3f4f6'
                        }}>
                          {driver.vehicle_assigned || 'Not assigned'}
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          Hire Date: {formatDate(driver.hire_date)}
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
                      onClick={() => handleApprove(driver.id)}
                      disabled={processingId === driver.id}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#059669',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Inter, sans-serif',
                        cursor: processingId === driver.id ? 'not-allowed' : 'pointer',
                        opacity: processingId === driver.id ? 0.5 : 1,
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Check style={{ width: '14px', height: '14px' }} />
                      {processingId === driver.id ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleReject(driver.id)}
                      disabled={processingId === driver.id}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#dc2626',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Inter, sans-serif',
                        cursor: processingId === driver.id ? 'not-allowed' : 'pointer',
                        opacity: processingId === driver.id ? 0.5 : 1,
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <X style={{ width: '14px', height: '14px' }} />
                      {processingId === driver.id ? 'Processing...' : 'Reject'}
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
