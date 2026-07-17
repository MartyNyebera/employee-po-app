import { useState, useEffect } from 'react';
import { fetchTransactions, createTransaction } from '../api/client';
import { fetchVehicles, type Vehicle } from '../api/fleet';
import { CreateTransactionModal } from './CreateTransactionModal';
import { Receipt, Plus, DollarSign, Calendar, Fuel, Wrench, Package, Truck as TruckIcon, Filter, X } from 'lucide-react';
import { toast } from 'sonner';

interface Transaction {
  id: string;
  poNumber: string;
  type: 'fuel' | 'maintenance' | 'parts' | 'rental';
  description: string;
  amount: number;
  assetId: string;
  date: string;
  receipt?: string;
}

interface TransactionsListProps {
  isAdmin: boolean;
}

export function TransactionsList({ isAdmin }: TransactionsListProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterVehicle, setFilterVehicle] = useState('all');

  useEffect(() => {
    Promise.all([
      fetchTransactions()
        .then(data => {
          if (!Array.isArray(data)) {
            throw new Error('API returned non-array data');
          }
          setTransactions(data);
          setError(null);
        })
        .catch(err => {
          setError(err.message || 'Failed to load transactions');
          setTransactions([]);
        }),
      fetchVehicles()
        .then(data => {
          if (!Array.isArray(data)) {
            throw new Error('API returned non-array data');
          }
          setVehicles(data);
        })
        .catch(() => setVehicles([])),
    ]).finally(() => setLoading(false));
  }, []);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'fuel':
        return <Fuel style={{ width: '16px', height: '16px', color: '#d97706' }} />;
      case 'maintenance':
        return <Wrench style={{ width: '16px', height: '16px', color: '#d1b01b' }} />;
      case 'parts':
        return <Package style={{ width: '16px', height: '16px', color: '#d1b01b' }} />;
      case 'rental':
        return <TruckIcon style={{ width: '16px', height: '16px', color: '#059669' }} />;
      default:
        return <Receipt style={{ width: '16px', height: '16px', color: '#5a5a5a' }} />;
    }
  };

  const getTypeConfig = (type: string) => {
    const configs: Record<string, { color: string; bgColor: string; borderColor: string; }> = {
      'fuel': { 
        color: '#d97706', 
        bgColor: '#fffbeb', 
        borderColor: '#fed7aa'
      },
      'maintenance': { 
        color: '#d1b01b', 
        bgColor: '#ececec', 
        borderColor: '#e3ca63'
      },
      'parts': { 
        color: '#d1b01b', 
        bgColor: '#ececec', 
        borderColor: '#c4b5fd'
      },
      'rental': { 
        color: '#059669', 
        bgColor: '#f0fdf4', 
        borderColor: '#bbf7d0'
      },
    };
    return configs[type] || configs['fuel'];
  };

  const TypeBadge = ({ type }: { type: string }) => {
    const config = getTypeConfig(type);
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
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </div>
    );
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

  const totalAmount = transactions.reduce((sum, txn) => sum + txn.amount, 0);
  const fuelAmount = transactions.filter(t => t.type === 'fuel').reduce((sum, t) => sum + t.amount, 0);
  const maintenanceAmount = transactions.filter(t => t.type === 'maintenance').reduce((sum, t) => sum + t.amount, 0);
  const partsAmount = transactions.filter(t => t.type === 'parts').reduce((sum, t) => sum + t.amount, 0);
  const rentalAmount = transactions.filter(t => t.type === 'rental').reduce((sum, t) => sum + t.amount, 0);

  const filteredTransactions = transactions.filter(txn => {
    const matchesType = filterType === 'all' || txn.type === filterType;
    const matchesVehicle = filterVehicle === 'all' || txn.assetId === filterVehicle;
    return matchesType && matchesVehicle;
  });

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
          borderTopColor: '#f97316',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{
          fontSize: '16px',
          fontWeight: '500',
          color: '#5a5a5a',
          fontFamily: 'Poppins, sans-serif'
        }}>
          Loading transactions...
        </div>
      </div>
    );
  }

  if (error) {
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
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: '#fef2f2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Receipt style={{ width: '32px', height: '32px', color: '#dc2626' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#dc2626',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Error Loading Transactions
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#7f1d1d',
            margin: '0 0 16px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 20px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#dc2626',
              color: 'white',
              fontSize: '14px',
              fontWeight: '500',
              fontFamily: 'Poppins, sans-serif',
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
            Retry
          </button>
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
            backgroundColor: '#f97316',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 6px -1px rgba(249, 115, 22, 0.3)'
          }}>
            <Receipt style={{ width: '24px', height: '24px', color: 'white' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#000000',
              margin: '0 0 8px 0',
              fontFamily: 'Poppins, sans-serif'
            }}>
              Miscellaneous Transactions
            </h1>
            <p style={{
              fontSize: '14px',
              color: '#5a5a5a',
              margin: '0',
              fontFamily: 'Poppins, sans-serif'
            }}>
              Track miscellaneous transactions and entries
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              backgroundColor: '#f97316',
              color: 'white',
              padding: '12px 20px',
              borderRadius: '8px',
              border: 'none',
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
              e.currentTarget.style.backgroundColor = '#ea580c';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#f97316';
            }}
          >
            <Plus style={{ width: '16px', height: '16px' }} />
            New Transaction
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
              backgroundColor: '#fffbeb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Receipt style={{ width: '24px', height: '24px', color: '#f97316' }} />
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#000000',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {formatCurrency(totalAmount)}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#5a5a5a',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Total Amount
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
              <Fuel style={{ width: '24px', height: '24px', color: '#d97706' }} />
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
              Fuel
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#d97706',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {formatCurrency(fuelAmount)}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#78350f',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Fuel Expenses
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
              <Wrench style={{ width: '24px', height: '24px', color: '#d1b01b' }} />
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
              Maintenance
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#d1b01b',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {formatCurrency(maintenanceAmount)}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#7a6a0c',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Maintenance
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
              <Package style={{ width: '24px', height: '24px', color: '#d1b01b' }} />
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
              Parts
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#d1b01b',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {formatCurrency(partsAmount)}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#4d4308',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Parts
          </p>
        </div>
      </div>

      {/* FILTERS */}
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
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'center'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Filter style={{ width: '16px', height: '16px', color: '#5a5a5a' }} />
            <span style={{
              fontSize: '14px',
              color: '#5a5a5a',
              fontFamily: 'Poppins, sans-serif'
            }}>
              Filter
            </span>
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: '12px 40px 12px 16px',
              borderRadius: '8px',
              border: '1px solid #d6d6d6',
              fontSize: '14px',
              fontFamily: 'Poppins, sans-serif',
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
              e.currentTarget.style.borderColor = '#d6d6d6';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <option value="all">All Types</option>
            <option value="fuel">Fuel</option>
            <option value="maintenance">Maintenance</option>
            <option value="parts">Parts</option>
            <option value="rental">Rental</option>
          </select>
          <select
            value={filterVehicle}
            onChange={(e) => setFilterVehicle(e.target.value)}
            style={{
              padding: '12px 40px 12px 16px',
              borderRadius: '8px',
              border: '1px solid #d6d6d6',
              fontSize: '14px',
              fontFamily: 'Poppins, sans-serif',
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
              e.currentTarget.style.borderColor = '#d6d6d6';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <option value="all">All Vehicles</option>
            {vehicles.map(vehicle => (
              <option key={vehicle.id} value={vehicle.id}>{vehicle.unit_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* TRANSACTIONS LIST */}
      {filteredTransactions.length === 0 ? (
        <div style={{
          background: '#ffffff',
          border: '1px solid #d6d6d6',
          borderRadius: '16px',
          padding: '48px',
          textAlign: 'center',
          boxShadow: 'none'
        }}>
          <Receipt style={{ 
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
            No transactions yet
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#5a5a5a',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Create your first transaction to get started.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gap: '16px'
        }}>
          {filteredTransactions.map((txn) => {
            const vehicle = vehicles.find(v => v.id === txn.assetId);
            const vehicleName = vehicle ? vehicle.unit_name : `Asset ${txn.assetId}`;

            return (
              <div
                key={txn.id}
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
                  marginBottom: '16px',
                  gap: '16px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    flex: 1
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      backgroundColor: '#fffbeb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {getTypeIcon(txn.type)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{
                        fontSize: '18px',
                        fontWeight: '600',
                        color: '#000000',
                        margin: '0 0 4px 0',
                        fontFamily: 'Poppins, sans-serif'
                      }}>
                        {txn.description}
                      </h3>
                      <p style={{
                        fontSize: '14px',
                        color: '#5a5a5a',
                        margin: '0',
                        fontFamily: 'Poppins, sans-serif'
                      }}>
                        PO: {txn.poNumber}
                      </p>
                    </div>
                  </div>
                  <TypeBadge type={txn.type} />
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '16px',
                  marginBottom: '16px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fed7aa'
                  }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: '#fbbf24',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <DollarSign style={{ width: '16px', height: '16px', color: '#f97316' }} />
                    </div>
                    <div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#d97706',
                        fontFamily: 'Poppins, sans-serif'
                      }}>
                        {formatCurrency(txn.amount)}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#78350f',
                        fontFamily: 'Poppins, sans-serif'
                      }}>
                        Amount
                      </div>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#ececec',
                    border: '1px solid #e3ca63'
                  }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: '#d1b01b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Calendar style={{ width: '16px', height: '16px', color: '#000000' }} />
                    </div>
                    <div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#d1b01b',
                        fontFamily: 'Poppins, sans-serif'
                      }}>
                        {formatDate(txn.date)}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#7a6a0c',
                        fontFamily: 'Poppins, sans-serif'
                      }}>
                        Date
                      </div>
                    </div>
                  </div>
                </div>

                {vehicleName && (
                  <div style={{
                    paddingTop: '16px',
                    borderTop: '1px solid #e6e6e6',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: '#e6e6e6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <TruckIcon style={{ width: '16px', height: '16px', color: '#5a5a5a' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#262626',
                        fontFamily: 'Poppins, sans-serif'
                      }}>
                        {vehicleName}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#5a5a5a',
                        fontFamily: 'Poppins, sans-serif'
                      }}>
                        {txn.assetId}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* Create Transaction Modal */}
      {showCreateModal && (
        <CreateTransactionModal 
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            // Refresh transactions
            fetchTransactions()
              .then(data => {
                if (Array.isArray(data)) {
                  setTransactions(data);
                }
              })
              .catch(() => setTransactions([]));
          }}
        />
      )}
    </div>
  );
}
