import { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { UserCheck, Plus, Pencil, Trash2, Car, AlertCircle, X, ChevronDown } from 'lucide-react';

interface Driver {
  id: string;
  driver_name: string;
  contact: string;
  email: string | null;
  license_number: string;
  license_expiry: string;
  assigned_vehicle_id: string | null;
  vehicle_name: string | null;
  plate_number: string | null;
  status: 'Active' | 'Inactive' | 'On Leave';
  join_date: string;
  created_at: string;
}

interface Vehicle {
  id: string;
  unit_name: string;
  plate_number: string;
  vehicle_type: string;
}

const emptyForm = {
  driver_name: '', contact: '', email: '', license_number: '',
  license_expiry: '', assigned_vehicle_id: '', status: 'Active', join_date: '',
};

export function DriversList({ isAdmin }: { isAdmin: boolean }) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editDriver, setEditDriver] = useState<Driver | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchDrivers = async () => {
    try {
      const data = await fetchApi<Driver[]>('/drivers');
      setDrivers(Array.isArray(data) ? data : []);
    } catch { setDrivers([]); }
    setLoading(false);
  };

  const fetchVehicles = async () => {
    try {
      const data = await fetchApi<Vehicle[]>('/fleet/vehicles');
      setVehicles(Array.isArray(data) ? data : []);
    } catch { setVehicles([]); }
  };

  useEffect(() => { fetchDrivers(); fetchVehicles(); }, []);

  const openCreate = () => {
    setEditDriver(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (d: Driver) => {
    setEditDriver(d);
    setForm({
      driver_name: d.driver_name, contact: d.contact, email: d.email || '',
      license_number: d.license_number,
      license_expiry: d.license_expiry ? d.license_expiry.split('T')[0] : '',
      assigned_vehicle_id: d.assigned_vehicle_id || '',
      status: d.status,
      join_date: d.join_date ? d.join_date.split('T')[0] : '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.driver_name || !form.contact || !form.license_number || !form.license_expiry || !form.join_date) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = { ...form, assigned_vehicle_id: form.assigned_vehicle_id || null, email: form.email || null };
      if (editDriver) {
        await fetchApi(`/drivers/${editDriver.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await fetchApi('/drivers', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModalOpen(false);
      fetchDrivers();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save driver.');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetchApi(`/drivers/${id}`, { method: 'DELETE' });
      setDeleteConfirm(null);
      fetchDrivers();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete driver.');
    }
  };

  const isLicenseExpiringSoon = (expiry: string) => {
    const exp = new Date(expiry);
    const now = new Date();
    const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff >= 0;
  };

  const isLicenseExpired = (expiry: string) => new Date(expiry) < new Date();

  const filtered = drivers.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.driver_name.toLowerCase().includes(q) || d.contact.includes(q) || d.license_number.toLowerCase().includes(q);
    const matchStatus = !filterStatus || d.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const activeDrivers = drivers.filter(d => d.status === 'Active').length;
  const inactiveDrivers = drivers.filter(d => d.status === 'Inactive').length;
  const onLeaveDrivers = drivers.filter(d => d.status === 'On Leave').length;
  const expiringLicenses = drivers.filter(d => isLicenseExpiringSoon(d.license_expiry)).length;
  const expiredLicenses = drivers.filter(d => isLicenseExpired(d.license_expiry)).length;

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
          Loading drivers...
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
            <UserCheck style={{ width: '24px', height: '24px', color: 'white' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#111827',
              margin: '0 0 8px 0',
              fontFamily: 'Plus Jakarta Sans, Inter, sans-serif'
            }}>
              Drivers Management
            </h1>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0',
              fontFamily: 'Inter, sans-serif'
            }}>
              {drivers.length} registered driver{drivers.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
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
            New Driver
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
              <UserCheck style={{ width: '24px', height: '24px', color: '#3b82f6' }} />
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {drivers.length}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Total Drivers
          </p>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #bbf7d0',
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
              <UserCheck style={{ width: '24px', height: '24px', color: '#059669' }} />
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
              Active
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#059669',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {activeDrivers}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#065f46',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Active Now
          </p>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #fecaca',
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
              backgroundColor: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertCircle style={{ width: '24px', height: '24px', color: '#dc2626' }} />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#dc2626',
              backgroundColor: '#fef2f2',
              fontFamily: 'Inter, sans-serif'
            }}>
              Alert
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#dc2626',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {expiredLicenses}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#7f1d1d',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Expired Licenses
          </p>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #fed7aa',
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
              <AlertCircle style={{ width: '24px', height: '24px', color: '#d97706' }} />
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
              Warning
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#d97706',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {expiringLicenses}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#78350f',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Expiring Soon
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
          <div style={{ flex: 1, minWidth: '250px' }}>
            <input
              type="text"
              placeholder="Search name, contact, license…"
              value={search}
              onChange={e => setSearch(e.target.value)}
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
          <div style={{ position: 'relative', minWidth: '150px' }}>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 40px 12px 16px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                fontSize: '14px',
                fontFamily: 'Inter, sans-serif',
                appearance: 'none',
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
              <option value="">All Statuses</option>
              <option>Active</option>
              <option>Inactive</option>
              <option>On Leave</option>
            </select>
            <ChevronDown style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '16px',
              height: '16px',
              color: '#6b7280',
              pointerEvents: 'none'
            }} />
          </div>
        </div>
      </div>

      {/* DRIVER LIST */}
      {filtered.length === 0 ? (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '48px',
          textAlign: 'center',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}>
          <UserCheck style={{ 
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
            {search || filterStatus ? 'No drivers match filters.' : 'No drivers yet.'}
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            {search || filterStatus ? 'Try adjusting your search criteria.' : 'Add your first driver to get started.'}
          </p>
        </div>
      ) : (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          overflow: 'hidden'
        }}>
          <div style={{
            overflowX: 'auto'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr style={{
                  backgroundColor: '#f9fafb',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Driver
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Contact
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Assigned Vehicle
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    License
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Status
                  </th>
                  {isAdmin && (
                    <th style={{
                      padding: '16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontFamily: 'Inter, sans-serif'
                    }}>
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr
                    key={d.id}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'background-color 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td style={{ padding: '16px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          backgroundColor: '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: '600',
                          fontSize: '16px',
                          fontFamily: 'Inter, sans-serif'
                        }}>
                          {d.driver_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: '#111827',
                            fontFamily: 'Inter, sans-serif'
                          }}>
                            {d.driver_name}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: '#6b7280',
                            fontFamily: 'Inter, sans-serif'
                          }}>
                            Joined {new Date(d.join_date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div>
                        <div style={{
                          fontSize: '14px',
                          color: '#374151',
                          fontFamily: 'Inter, sans-serif'
                        }}>
                          {d.contact}
                        </div>
                        {d.email && (
                          <div style={{
                            fontSize: '12px',
                            color: '#6b7280',
                            fontFamily: 'Inter, sans-serif'
                          }}>
                            {d.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      {d.vehicle_name ? (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '14px',
                          color: '#374151',
                          fontFamily: 'Inter, sans-serif'
                        }}>
                          <Car style={{ width: '14px', height: '14px', color: '#3b82f6' }} />
                          <span>{d.vehicle_name}</span>
                          {d.plate_number && (
                            <span style={{
                              fontSize: '12px',
                              color: '#6b7280',
                              fontFamily: 'Inter, sans-serif'
                            }}>
                              ({d.plate_number})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{
                          fontSize: '12px',
                          color: '#9ca3af',
                          fontStyle: 'italic',
                          fontFamily: 'Inter, sans-serif'
                        }}>
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div>
                        <div style={{
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          color: '#374151'
                        }}>
                          {d.license_number}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          marginTop: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: isLicenseExpired(d.license_expiry) ? '#dc2626' : 
                                isLicenseExpiringSoon(d.license_expiry) ? '#d97706' : '#6b7280',
                          fontWeight: isLicenseExpired(d.license_expiry) ? '600' : '400',
                          fontFamily: 'Inter, sans-serif'
                        }}>
                          {(isLicenseExpired(d.license_expiry) || isLicenseExpiringSoon(d.license_expiry)) && (
                            <AlertCircle style={{ width: '12px', height: '12px' }} />
                          )}
                          Exp: {new Date(d.license_expiry).toLocaleDateString()}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Inter, sans-serif',
                        backgroundColor: d.status === 'Active' ? '#f0fdf4' : 
                                      d.status === 'On Leave' ? '#fffbeb' : '#f3f4f6',
                        color: d.status === 'Active' ? '#059669' : 
                               d.status === 'On Leave' ? '#d97706' : '#6b7280',
                        border: d.status === 'Active' ? '1px solid #bbf7d0' : 
                               d.status === 'On Leave' ? '1px solid #fed7aa' : '1px solid #d1d5db'
                      }}>
                        {d.status}
                      </div>
                    </td>
                    {isAdmin && (
                      <td style={{ padding: '16px' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <button
                            onClick={() => openEdit(d)}
                            style={{
                              padding: '8px',
                              borderRadius: '6px',
                              border: '1px solid #dbeafe',
                              backgroundColor: 'white',
                              color: '#3b82f6',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#eff6ff';
                              e.currentTarget.style.borderColor = '#3b82f6';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'white';
                              e.currentTarget.style.borderColor = '#dbeafe';
                            }}
                            title="Edit"
                          >
                            <Pencil style={{ width: '14px', height: '14px' }} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(d.id)}
                            style={{
                              padding: '8px',
                              borderRadius: '6px',
                              border: '1px solid #fecaca',
                              backgroundColor: 'white',
                              color: '#dc2626',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#fef2f2';
                              e.currentTarget.style.borderColor = '#dc2626';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'white';
                              e.currentTarget.style.borderColor = '#fecaca';
                            }}
                            title="Delete"
                          >
                            <Trash2 style={{ width: '14px', height: '14px' }} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODALS */}
      {/* Create/Edit Modal */}
      {modalOpen && (
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
              <h3 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#111827',
                margin: '0',
                fontFamily: 'Inter, sans-serif'
              }}>
                {editDriver ? 'Edit Driver' : 'New Driver'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
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
            
            <div style={{ padding: '24px' }}>
              {formError && (
                <div style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  fontSize: '14px',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '20px',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {formError}
                </div>
              )}
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '20px'
              }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Driver Name <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={form.driver_name}
                    onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                    placeholder="Full name"
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
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Phone <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={form.contact}
                    onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                    placeholder="+63 9XX XXXX XXXX"
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
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="Optional"
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
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    License No. <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={form.license_number}
                    onChange={e => setForm(f => ({ ...f, license_number: e.target.value }))}
                    placeholder="License number"
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
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    License Expiry <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={form.license_expiry}
                    onChange={e => setForm(f => ({ ...f, license_expiry: e.target.value }))}
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
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Join Date <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={form.join_date}
                    onChange={e => setForm(f => ({ ...f, join_date: e.target.value }))}
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
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
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
                    <option>Active</option>
                    <option>Inactive</option>
                    <option>On Leave</option>
                  </select>
                </div>
                
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Assigned Vehicle
                  </label>
                  <select
                    value={form.assigned_vehicle_id}
                    onChange={e => setForm(f => ({ ...f, assigned_vehicle_id: e.target.value }))}
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
                    <option value="">None</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.unit_name}{v.plate_number ? ` (${v.plate_number})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '24px',
              borderTop: '1px solid #e5e7eb'
            }}>
              <button
                onClick={() => setModalOpen(false)}
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
                  transition: 'all 0.2s ease'
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
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  fontFamily: 'Inter, sans-serif',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  if (!saving) {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                  }
                }}
                onMouseOut={(e) => {
                  if (!saving) {
                    e.currentTarget.style.backgroundColor = '#3b82f6';
                  }
                }}
              >
                {saving ? 'Saving…' : editDriver ? 'Update Driver' : 'Create Driver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
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
            maxWidth: '400px',
            padding: '32px'
          }}>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#111827',
              margin: '0 0 12px 0',
              fontFamily: 'Inter, sans-serif'
            }}>
              Delete Driver?
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0 0 24px 0',
              fontFamily: 'Inter, sans-serif'
            }}>
              This action cannot be undone. The driver will be removed from all deliveries.
            </p>
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                onClick={() => setDeleteConfirm(null)}
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
                  transition: 'all 0.2s ease'
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
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#b91c1c';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#dc2626';
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
