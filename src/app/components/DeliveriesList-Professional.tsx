import { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { Truck, Plus, X, ChevronDown, Clock, CheckCircle2, AlertCircle, Navigation } from 'lucide-react';

interface Delivery {
  id: string;
  so_number: string;
  vehicle_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_name: string | null;
  plate_number: string | null;
  customer_name: string;
  customer_address: string;
  delivery_date: string;
  status: string;
  assigned_time: string | null;
  picked_up_time: string | null;
  in_transit_time: string | null;
  arrived_time: string | null;
  completed_time: string | null;
  proof_of_delivery_url: string | null;
  notes: string | null;
  created_at: string;
}

interface Driver { id: string; driver_name: string; contact: string; }
interface Vehicle { id: string; unit_name: string; plate_number: string; }
interface SalesOrder { id: string; so_number: string; client: string; description: string; }

const STATUS_FLOW = ['Pending', 'Assigned', 'Picked Up', 'In Transit', 'Arrived', 'Completed'];

const emptyForm = {
  so_number: '', vehicle_id: '', driver_id: '',
  customer_name: '', customer_address: '', delivery_date: '', notes: '',
};

export function DeliveriesList({ isAdmin }: { isAdmin: boolean }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailDelivery, setDetailDelivery] = useState<Delivery | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      const [d, dr, v, so] = await Promise.all([
        fetchApi<Delivery[]>('/deliveries'),
        fetchApi<Driver[]>('/drivers'),
        fetchApi<Vehicle[]>('/fleet/vehicles'),
        fetchApi<any[]>('/sales-orders'),
      ]);
      setDeliveries(Array.isArray(d) ? d : []);
      setDrivers(Array.isArray(dr) ? dr : []);
      setVehicles(Array.isArray(v) ? v : []);
      setSalesOrders(Array.isArray(so) ? so : []);
    } catch { setDeliveries([]); }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.so_number || !form.customer_name || !form.customer_address || !form.delivery_date) {
      setFormError('SO Number, Customer Name, Address, and Delivery Date are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await fetchApi('/deliveries', {
        method: 'POST',
        body: JSON.stringify({ ...form, vehicle_id: form.vehicle_id || null, driver_id: form.driver_id || null }),
      });
      setModalOpen(false);
      fetchAll();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create delivery.');
    }
    setSaving(false);
  };

  const updateStatus = async (delivery: Delivery, newStatus: string) => {
    setStatusUpdating(delivery.id);
    try {
      await fetchApi(`/deliveries/${delivery.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchAll();
      if (detailDelivery?.id === delivery.id) {
        const updated = await fetchApi<Delivery>(`/deliveries/${delivery.id}`);
        setDetailDelivery(updated);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to update status.');
    }
    setStatusUpdating(null);
  };

  const getNextStatus = (current: string) => {
    const idx = STATUS_FLOW.indexOf(current);
    return idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
  };

  const filtered = deliveries.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.so_number.toLowerCase().includes(q) ||
      d.customer_name.toLowerCase().includes(q) ||
      (d.driver_name || '').toLowerCase().includes(q);
    const matchStatus = !filterStatus || d.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; bgColor: string; borderColor: string; icon: React.ReactNode }> = {
      'Pending': { 
        color: '#6b7280', 
        bgColor: '#f3f4f6', 
        borderColor: '#d1d5db',
        icon: <Clock style={{ width: '12px', height: '12px' }} /> 
      },
      'Assigned': { 
        color: '#3b82f6', 
        bgColor: '#dbeafe', 
        borderColor: '#93c5fd',
        icon: <Truck style={{ width: '12px', height: '12px' }} /> 
      },
      'Picked Up': { 
        color: '#6366f1', 
        bgColor: '#e0e7ff', 
        borderColor: '#a5b4fc',
        icon: <Truck style={{ width: '12px', height: '12px' }} /> 
      },
      'In Transit': { 
        color: '#d97706', 
        bgColor: '#fffbeb', 
        borderColor: '#fed7aa',
        icon: <Navigation style={{ width: '12px', height: '12px' }} /> 
      },
      'Arrived': { 
        color: '#06b6d4', 
        bgColor: '#ecfeff', 
        borderColor: '#a5f3fc',
        icon: <CheckCircle2 style={{ width: '12px', height: '12px' }} /> 
      },
      'Completed': { 
        color: '#059669', 
        bgColor: '#f0fdf4', 
        borderColor: '#bbf7d0',
        icon: <CheckCircle2 style={{ width: '12px', height: '12px' }} /> 
      },
      'Cancelled': { 
        color: '#dc2626', 
        bgColor: '#fef2f2', 
        borderColor: '#fecaca',
        icon: <AlertCircle style={{ width: '12px', height: '12px' }} /> 
      },
    };
    return configs[status] || configs['Pending'];
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const config = getStatusConfig(status);
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: '500',
        color: config.color,
        backgroundColor: config.bgColor,
        border: `1px solid ${config.borderColor}`,
        fontFamily: 'Inter, sans-serif'
      }}>
        {config.icon}
        {status}
      </div>
    );
  };

  const Timeline = ({ delivery }: { delivery: Delivery }) => {
    const steps = [
      { label: 'Created', time: delivery.created_at },
      { label: 'Assigned', time: delivery.assigned_time },
      { label: 'Picked Up', time: delivery.picked_up_time },
      { label: 'In Transit', time: delivery.in_transit_time },
      { label: 'Arrived', time: delivery.arrived_time },
      { label: 'Completed', time: delivery.completed_time },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
        {steps.map((s, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px'
          }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              flexShrink: 0,
              backgroundColor: s.time ? '#059669' : '#d1d5db'
            }} />
            <span style={{
              fontWeight: '500',
              width: '80px',
              color: s.time ? '#374151' : '#9ca3af',
              fontFamily: 'Inter, sans-serif'
            }}>
              {s.label}
            </span>
            <span style={{
              fontSize: '11px',
              color: '#6b7280',
              fontFamily: 'Inter, sans-serif'
            }}>
              {s.time ? new Date(s.time).toLocaleString() : '—'}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const pendingCount = deliveries.filter(d => d.status === 'Pending').length;
  const inTransitCount = deliveries.filter(d => d.status === 'In Transit').length;
  const completedCount = deliveries.filter(d => d.status === 'Completed').length;
  const cancelledCount = deliveries.filter(d => d.status === 'Cancelled').length;

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
          borderTopColor: '#f97316',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{
          fontSize: '16px',
          fontWeight: '500',
          color: '#6b7280',
          fontFamily: 'Inter, sans-serif'
        }}>
          Loading deliveries...
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
            backgroundColor: '#f97316',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 6px -1px rgba(249, 115, 22, 0.3)'
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
              Deliveries Management
            </h1>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0',
              fontFamily: 'Inter, sans-serif'
            }}>
              {deliveries.length} total · {inTransitCount} in transit
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            style={{
              backgroundColor: '#f97316',
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
              e.currentTarget.style.backgroundColor = '#ea580c';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#f97316';
            }}
          >
            <Plus style={{ width: '16px', height: '16px' }} />
            New Delivery
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
              backgroundColor: '#fed7aa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Truck style={{ width: '24px', height: '24px', color: '#f97316' }} />
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {deliveries.length}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Total Deliveries
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
              <Navigation style={{ width: '24px', height: '24px', color: '#3b82f6' }} />
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
              Transit
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#3b82f6',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {inTransitCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#1e40af',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            In Transit
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
              <CheckCircle2 style={{ width: '24px', height: '24px', color: '#059669' }} />
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
              Complete
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#059669',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {completedCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#065f46',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Completed
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
              Cancelled
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#dc2626',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {cancelledCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#7f1d1d',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Cancelled
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
              placeholder="Search SO, customer, driver…"
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
                e.currentTarget.style.borderColor = '#f97316';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.1)';
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
                e.currentTarget.style.borderColor = '#f97316';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <option value="">All Statuses</option>
              {Object.keys(getStatusConfig('')).map(s => <option key={s}>{s}</option>)}
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

      {/* DELIVERY LIST */}
      {filtered.length === 0 ? (
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
            {search || filterStatus ? 'No deliveries match filters.' : 'No deliveries yet.'}
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            {search || filterStatus ? 'Try adjusting your search criteria.' : 'Create your first delivery to get started.'}
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
                    SO / Customer
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
                    Vehicle
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
                    Delivery Date
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
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const next = getNextStatus(d.status);
                  const isUpdating = statusUpdating === d.id;
                  return (
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
                        <div>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: '#3b82f6',
                            fontFamily: 'Inter, sans-serif'
                          }}>
                            {d.so_number}
                          </div>
                          <div style={{
                            fontSize: '14px',
                            color: '#374151',
                            fontFamily: 'Inter, sans-serif'
                          }}>
                            {d.customer_name}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: '#6b7280',
                            maxWidth: '180px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontFamily: 'Inter, sans-serif'
                          }}>
                            {d.customer_address}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{
                          fontSize: '14px',
                          color: '#374151',
                          fontFamily: 'Inter, sans-serif'
                        }}>
                          {d.driver_name || (
                            <span style={{
                              fontSize: '12px',
                              color: '#9ca3af',
                              fontStyle: 'italic',
                              fontFamily: 'Inter, sans-serif'
                            }}>
                              Unassigned
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{
                          fontSize: '14px',
                          color: '#374151',
                          fontFamily: 'Inter, sans-serif'
                        }}>
                          {d.vehicle_name ? (
                            <span>
                              {d.vehicle_name}
                              {d.plate_number && (
                                <span style={{
                                  fontSize: '12px',
                                  color: '#6b7280',
                                  fontFamily: 'Inter, sans-serif'
                                }}>
                                  ({d.plate_number})
                                </span>
                              )}
                            </span>
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
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{
                          fontSize: '12px',
                          color: '#374151',
                          fontFamily: 'Inter, sans-serif'
                        }}>
                          {new Date(d.delivery_date).toLocaleDateString()}
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <StatusBadge status={d.status} />
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <button
                            onClick={() => setDetailDelivery(d)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid #e5e7eb',
                              backgroundColor: 'white',
                              color: '#374151',
                              fontSize: '12px',
                              fontWeight: '500',
                              fontFamily: 'Inter, sans-serif',
                              cursor: 'pointer',
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
                            View
                          </button>
                          {isAdmin && next && d.status !== 'Cancelled' && (
                            <button
                              disabled={isUpdating}
                              onClick={() => updateStatus(d, next)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                fontSize: '12px',
                                fontWeight: '500',
                                fontFamily: 'Inter, sans-serif',
                                cursor: isUpdating ? 'not-allowed' : 'pointer',
                                opacity: isUpdating ? 0.6 : 1,
                                transition: 'all 0.2s ease'
                              }}
                              onMouseOver={(e) => {
                                if (!isUpdating) {
                                  e.currentTarget.style.backgroundColor = '#2563eb';
                                }
                              }}
                              onMouseOut={(e) => {
                                if (!isUpdating) {
                                  e.currentTarget.style.backgroundColor = '#3b82f6';
                                }
                              }}
                            >
                              {isUpdating ? '…' : `→ ${next}`}
                            </button>
                          )}
                          {isAdmin && d.status !== 'Completed' && d.status !== 'Cancelled' && (
                            <button
                              disabled={isUpdating}
                              onClick={() => updateStatus(d, 'Cancelled')}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid #fecaca',
                                backgroundColor: 'white',
                                color: '#dc2626',
                                fontSize: '12px',
                                fontWeight: '500',
                                fontFamily: 'Inter, sans-serif',
                                cursor: isUpdating ? 'not-allowed' : 'pointer',
                                opacity: isUpdating ? 0.6 : 1,
                                transition: 'all 0.2s ease'
                              }}
                              onMouseOver={(e) => {
                                if (!isUpdating) {
                                  e.currentTarget.style.backgroundColor = '#fef2f2';
                                  e.currentTarget.style.borderColor = '#dc2626';
                                }
                              }}
                              onMouseOut={(e) => {
                                if (!isUpdating) {
                                  e.currentTarget.style.backgroundColor = 'white';
                                  e.currentTarget.style.borderColor = '#fecaca';
                                }
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODALS */}
      {/* Create Modal */}
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
                New Delivery
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
                    Sales Order Number <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={form.so_number}
                    onChange={e => setForm(f => ({ ...f, so_number: e.target.value }))}
                    list="so-list"
                    placeholder="SO-001"
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
                      e.currentTarget.style.borderColor = '#f97316';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <datalist id="so-list">
                    {salesOrders.map(so => (
                      <option key={so.id} value={so.so_number}>
                        {so.so_number} — {so.client}
                      </option>
                    ))}
                  </datalist>
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
                    Customer Name <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={form.customer_name}
                    onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                    placeholder="Customer name"
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
                      e.currentTarget.style.borderColor = '#f97316';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
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
                    Delivery Address <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={form.customer_address}
                    onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))}
                    placeholder="Full delivery address"
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
                      e.currentTarget.style.borderColor = '#f97316';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.1)';
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
                    Delivery Date <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={form.delivery_date}
                    onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}
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
                      e.currentTarget.style.borderColor = '#f97316';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.1)';
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
                    Driver
                  </label>
                  <select
                    value={form.driver_id}
                    onChange={e => setForm(f => ({ ...f, driver_id: e.target.value }))}
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
                      e.currentTarget.style.borderColor = '#f97316';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <option value="">None</option>
                    {drivers.filter(d => d).map(d => (
                      <option key={d.id} value={d.id}>{d.driver_name}</option>
                    ))}
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
                    Vehicle
                  </label>
                  <select
                    value={form.vehicle_id}
                    onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
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
                      e.currentTarget.style.borderColor = '#f97316';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.1)';
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
                
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Notes
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    placeholder="Optional notes"
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
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#f97316';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
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
                  backgroundColor: '#f97316',
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
                    e.currentTarget.style.backgroundColor = '#ea580c';
                  }
                }}
                onMouseOut={(e) => {
                  if (!saving) {
                    e.currentTarget.style.backgroundColor = '#f97316';
                  }
                }}
              >
                {saving ? 'Creating…' : 'Create Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailDelivery && (
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
              <div>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#111827',
                  margin: '0 0 4px 0',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {detailDelivery.so_number}
                </h3>
                <p style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  margin: '0',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {detailDelivery.id}
                </p>
              </div>
              <button
                onClick={() => setDetailDelivery(null)}
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
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px'
              }}>
                <StatusBadge status={detailDelivery.status} />
                {isAdmin && getNextStatus(detailDelivery.status) && detailDelivery.status !== 'Cancelled' && (
                  <button
                    disabled={statusUpdating === detailDelivery.id}
                    onClick={() => updateStatus(detailDelivery, getNextStatus(detailDelivery.status)!)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '500',
                      fontFamily: 'Inter, sans-serif',
                      cursor: statusUpdating === detailDelivery.id ? 'not-allowed' : 'pointer',
                      opacity: statusUpdating === detailDelivery.id ? 0.6 : 1,
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      if (statusUpdating !== detailDelivery.id) {
                        e.currentTarget.style.backgroundColor = '#2563eb';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (statusUpdating !== detailDelivery.id) {
                        e.currentTarget.style.backgroundColor = '#3b82f6';
                      }
                    }}
                  >
                    {statusUpdating === detailDelivery.id ? '…' : `Advance → ${getNextStatus(detailDelivery.status)}`}
                  </button>
                )}
              </div>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '16px',
                marginBottom: '20px'
              }}>
                <div style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '12px',
                  padding: '16px'
                }}>
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginBottom: '4px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Customer
                  </div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#111827',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    {detailDelivery.customer_name}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginTop: '4px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    {detailDelivery.customer_address}
                  </div>
                </div>
                
                <div style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '12px',
                  padding: '16px'
                }}>
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginBottom: '4px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Scheduled
                  </div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#111827',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    {new Date(detailDelivery.delivery_date).toLocaleDateString()}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginTop: '4px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    {new Date(detailDelivery.delivery_date).toLocaleTimeString()}
                  </div>
                </div>
                
                <div style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '12px',
                  padding: '16px'
                }}>
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginBottom: '4px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Driver
                  </div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#111827',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    {detailDelivery.driver_name || '—'}
                  </div>
                </div>
                
                <div style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '12px',
                  padding: '16px'
                }}>
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginBottom: '4px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Vehicle
                  </div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#111827',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    {detailDelivery.vehicle_name || '—'}
                  </div>
                  {detailDelivery.plate_number && (
                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginTop: '4px',
                      fontFamily: 'Inter, sans-serif'
                    }}>
                      {detailDelivery.plate_number}
                    </div>
                  )}
                </div>
              </div>
              
              {detailDelivery.notes && (
                <div style={{
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fed7aa',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '20px'
                }}>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#92400e',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Notes:{' '}
                  </span>
                  <span style={{
                    fontSize: '14px',
                    color: '#78350f',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    {detailDelivery.notes}
                  </span>
                </div>
              )}
              
              {detailDelivery.proof_of_delivery_url && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Proof of Delivery
                  </div>
                  <img 
                    src={detailDelivery.proof_of_delivery_url} 
                    alt="POD" 
                    style={{
                      borderRadius: '12px',
                      maxHeight: '160px',
                      objectFit: 'cover',
                      width: '100%'
                    }}
                  />
                </div>
              )}
              
              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '8px',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  Timeline
                </div>
                <Timeline delivery={detailDelivery} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
