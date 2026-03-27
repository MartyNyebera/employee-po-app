import { useEffect, useState } from 'react';
import { fetchPmsReminders, type Vehicle } from '../api/fleet';
import { AlertTriangle, Clock, Wrench, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface PMSRemindersProps {
  onSelectVehicle: (id: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  'Dump Truck': '🚛', 'Mini Dump': '🚚', 'Backhoe': '🚜', 'Boom Truck': '🏗️', 'L3 Loader': '⚙️',
};

export function PMSReminders({ onSelectVehicle }: PMSRemindersProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPmsReminders()
      .then(data => {
        if (!Array.isArray(data)) {
          throw new Error('API returned non-array data');
        }
        setVehicles(data);
      })
      .catch(err => {
        toast.error('Failed to load reminders: ' + err.message);
        setVehicles([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const overdue = vehicles.filter(v => v.pms_status === 'OVERDUE');
  const dueSoon = vehicles.filter(v => v.pms_status === 'DUE_SOON');

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
          Loading maintenance reminders...
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
        marginBottom: '32px'
      }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: '#111827',
          margin: '0 0 8px 0',
          fontFamily: 'Plus Jakarta Sans, Inter, sans-serif'
        }}>
          PMS Reminders
        </h1>
        <p style={{
          fontSize: '14px',
          color: '#6b7280',
          margin: '0',
          fontFamily: 'Inter, sans-serif'
        }}>
          Vehicles requiring maintenance attention
        </p>
      </div>

      {/* METRIC CARDS */}
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
              backgroundColor: '#f0fdf4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircle style={{ width: '24px', height: '24px', color: '#059669' }} />
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
              Critical
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#dc2626',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {overdue.length}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#7f1d1d',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Overdue Maintenance
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
            {dueSoon.length}
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

      {/* VEHICLE LISTS */}
      {vehicles.length === 0 ? (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '48px',
          textAlign: 'center',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}>
          <CheckCircle style={{ 
            width: '64px', 
            height: '64px', 
            color: '#10b981',
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
            All Vehicles OK
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            No vehicles are overdue or due soon for maintenance.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gap: '32px'
        }}>
          {/* OVERDOE SECTION */}
          {overdue.length > 0 && (
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '20px'
              }}>
                <AlertTriangle style={{ width: '24px', height: '24px', color: '#dc2626' }} />
                <h2 style={{
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#dc2626',
                  margin: '0',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  Overdue Maintenance ({overdue.length})
                </h2>
              </div>
              <div style={{
                display: 'grid',
                gap: '16px'
              }}>
                {overdue.map(v => (
                  <VehicleReminderCard key={v.id} vehicle={v} onSelect={onSelectVehicle} />
                ))}
              </div>
            </div>
          )}

          {/* DUE SOON SECTION */}
          {dueSoon.length > 0 && (
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '20px'
              }}>
                <Clock style={{ width: '24px', height: '24px', color: '#d97706' }} />
                <h2 style={{
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#d97706',
                  margin: '0',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  Due Soon ({dueSoon.length})
                </h2>
              </div>
              <div style={{
                display: 'grid',
                gap: '16px'
              }}>
                {dueSoon.map(v => (
                  <VehicleReminderCard key={v.id} vehicle={v} onSelect={onSelectVehicle} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VehicleReminderCard({ vehicle, onSelect }: { vehicle: Vehicle; onSelect: (id: string) => void }) {
  const isOverdue = vehicle.pms_status === 'OVERDUE';
  
  return (
    <div
      style={{
        background: '#ffffff',
        border: isOverdue ? '1px solid #fecaca' : '1px solid #fed7aa',
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
          <div style={{ flex: 1 }}>
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
              margin: '0 0 8px 0',
              fontFamily: 'Inter, sans-serif'
            }}>
              {vehicle.vehicle_type}
            </p>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              fontSize: '13px'
            }}>
              {vehicle.next_due_date && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: isOverdue ? '#dc2626' : '#d97706',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  <span>📅</span>
                  <span>Due: {vehicle.next_due_date}</span>
                </div>
              )}
              {vehicle.next_due_odometer && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: isOverdue ? '#dc2626' : '#d97706',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  <span>🔢</span>
                  <span>Due at: {Number(vehicle.next_due_odometer).toLocaleString()} km</span>
                </div>
              )}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginTop: '8px',
              fontFamily: 'Inter, sans-serif'
            }}>
              Current odometer: {Number(vehicle.current_odometer).toLocaleString()} km
            </div>
          </div>
        </div>
        
        <button
          onClick={() => onSelect(vehicle.id)}
          style={{
            backgroundColor: isOverdue ? '#dc2626' : '#d97706',
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
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = isOverdue ? '#b91c1c' : '#b45309';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = isOverdue ? '#dc2626' : '#d97706';
          }}
        >
          <Wrench style={{ width: '16px', height: '16px' }} />
          Maintain
        </button>
      </div>
    </div>
  );
}
