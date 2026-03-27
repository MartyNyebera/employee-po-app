import { useEffect, useState } from 'react';
import { fetchVehicles, deleteVehicle, type Vehicle, type PmsStatus } from '../api/fleet';
import { Plus, Trash, Truck, AlertTriangle, CheckCircle, Clock, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { AddVehicleModal } from './AddVehicleModal';

interface FleetListProps {
  onSelectVehicle: (id: string) => void;
}

function PmsBadge({ status }: { status: PmsStatus | undefined }) {
  if (status === 'OVERDUE') return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: '600',
      color: '#dc2626',
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      fontFamily: 'Inter, sans-serif'
    }}>
      <AlertTriangle style={{ width: '12px', height: '12px' }} />
      Overdue
    </div>
  );
  if (status === 'DUE_SOON') return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: '600',
      color: '#d97706',
      backgroundColor: '#fffbeb',
      border: '1px solid #fed7aa',
      fontFamily: 'Inter, sans-serif'
    }}>
      <Clock style={{ width: '12px', height: '12px' }} />
      Due Soon
    </div>
  );
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: '600',
      color: '#059669',
      backgroundColor: '#f0fdf4',
      border: '1px solid #bbf7d0',
      fontFamily: 'Inter, sans-serif'
    }}>
      <CheckCircle style={{ width: '12px', height: '12px' }} />
      OK
    </div>
  );
}

const TYPE_ICONS: Record<string, string> = {
  'Dump Truck': '🚛',
  'Mini Dump': '🚚',
  'Backhoe': '🚜',
  'Boom Truck': '🏗️',
  'L3 Loader': '⚙️',
};

export function FleetList({ onSelectVehicle }: FleetListProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  
  const load = async () => {
    try {
      setLoading(true);
      fetchVehicles()
        .then(data => {
          if (!Array.isArray(data)) {
            throw new Error('API returned non-array data');
          }
          setVehicles(data);
        })
        .catch(err => {
          toast.error('Failed to load vehicles: ' + err.message);
          setVehicles([]);
        })
        .finally(() => setLoading(false));
    } catch (err: any) {
      toast.error('Failed to load vehicles: ' + err.message);
      setVehicles([]);
    }
  };

  const handleDeleteVehicle = async (vehicleId: string, vehicleName: string) => {
    if (!confirm(`Are you sure you want to delete "${vehicleName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteVehicle(vehicleId);
      toast.success(`Vehicle "${vehicleName}" deleted successfully`);
      load(); // Refresh the list
    } catch (error: any) {
      toast.error('Failed to delete vehicle: ' + error.message);
    }
  };

  useEffect(() => { load(); }, []);

  const overdue = vehicles.filter(v => v.pms_status === 'OVERDUE').length;
  const dueSoon = vehicles.filter(v => v.pms_status === 'DUE_SOON').length;

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
          Loading vehicles...
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
        <div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, sans-serif'
          }}>
            Fleet Management
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            {vehicles.length} vehicles registered
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
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
          Add Vehicle
        </button>
      </div>

      {/* METRIC CARDS */}
      {vehicles.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
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
                <Truck style={{ width: '24px', height: '24px', color: '#3b82f6' }} />
              </div>
            </div>
            <h3 style={{
              fontSize: '32px',
              fontWeight: '700',
              color: '#111827',
              margin: '0 0 8px 0',
              fontFamily: 'Plus Jakarta Sans, Inter, monospace'
            }}>
              {vehicles.length}
            </h3>
            <p style={{
              fontSize: '14px',
              fontWeight: '500',
              color: '#6b7280',
              margin: '0',
              fontFamily: 'Inter, sans-serif'
            }}>
              Total Vehicles
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
                <AlertTriangle style={{ width: '24px', height: '24px', color: '#dc2626' }} />
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
                <AlertTriangle style={{ width: '16px', height: '16px' }} />
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
              {overdue}
            </h3>
            <p style={{
              fontSize: '14px',
              fontWeight: '500',
              color: '#7f1d1d',
              margin: '0',
              fontFamily: 'Inter, sans-serif'
            }}>
              Overdue PMS
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
                <Clock style={{ width: '24px', height: '24px', color: '#d97706' }} />
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
                <Clock style={{ width: '16px', height: '16px' }} />
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
              {dueSoon}
            </h3>
            <p style={{
              fontSize: '14px',
              fontWeight: '500',
              color: '#78350f',
              margin: '0',
              fontFamily: 'Inter, sans-serif'
            }}>
              Due Soon
            </p>
          </div>
        </div>
      )}

      {/* VEHICLE LIST */}
      {vehicles.length === 0 ? (
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
            No Vehicles Yet
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '0 0 24px 0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Add your first vehicle to get started.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
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
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Plus style={{ width: '16px', height: '16px' }} />
            Add Your First Vehicle
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gap: '16px'
        }}>
          {vehicles.map(vehicle => (
            <div
              key={vehicle.id}
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
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
              onClick={() => onSelectVehicle(vehicle.id)}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '24px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  flex: 1
                }}>
                  <div style={{
                    fontSize: '48px',
                    lineHeight: '1'
                  }}>
                    {TYPE_ICONS[vehicle.vehicle_type] || '🚗'}
                  </div>
                  <div>
                    <h3 style={{
                      fontSize: '18px',
                      fontWeight: '600',
                      color: '#111827',
                      margin: '0 0 4px 0',
                      fontFamily: 'Inter, sans-serif'
                    }}>
                      {vehicle.unit_name}
                    </h3>
                    <p style={{
                      fontSize: '14px',
                      color: '#6b7280',
                      margin: '0',
                      fontFamily: 'Inter, sans-serif'
                    }}>
                      {vehicle.vehicle_type}
                      {vehicle.plate_number && ` · ${vehicle.plate_number}`}
                    </p>
                  </div>
                </div>
                
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '24px'
                }}>
                  <div style={{
                    textAlign: 'right'
                  }}>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#111827',
                      fontFamily: 'Inter, sans-serif'
                    }}>
                      {Number(vehicle.current_odometer).toLocaleString()} km
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      fontFamily: 'Inter, sans-serif'
                    }}>
                      Current Odometer
                    </div>
                  </div>
                  
                  <PmsBadge status={vehicle.pms_status} />
                  
                  <div style={{
                    display: 'flex',
                    gap: '8px'
                  }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVehicle(vehicle.id);
                      }}
                      style={{
                        backgroundColor: '#ffffff',
                        color: '#374151',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Inter, sans-serif',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                        e.currentTarget.style.borderColor = '#9ca3af';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#ffffff';
                        e.currentTarget.style.borderColor = '#d1d5db';
                      }}
                    >
                      View Details
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteVehicle(vehicle.id, vehicle.unit_name);
                      }}
                      style={{
                        backgroundColor: '#ffffff',
                        color: '#dc2626',
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #fecaca',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'Inter, sans-serif',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#fef2f2';
                        e.currentTarget.style.borderColor = '#fca5a5';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#ffffff';
                        e.currentTarget.style.borderColor = '#fecaca';
                      }}
                    >
                      <Trash style={{ width: '14px', height: '14px' }} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddVehicleModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); load(); }}
        />
      )}
    </div>
  );
}
