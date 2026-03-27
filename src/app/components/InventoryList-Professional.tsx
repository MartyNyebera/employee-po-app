import { useState, useEffect } from 'react';
import { Package, Plus, Search, Filter, ArrowUpDown, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../api/client';
import { CreateInventoryItemModal } from './CreateInventoryItemModal';
import { EditInventoryItemModal } from './EditInventoryItemModal';

interface InventoryItem {
  id: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  unit: string;
  location: string;
  supplier: string;
  unitCost: number;
  lastUpdated: string;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
}

interface InventoryListProps {
  isAdmin: boolean;
}

export function InventoryList({ isAdmin }: InventoryListProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'in-stock' | 'low-stock' | 'out-of-stock'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'itemCode' | 'itemName' | 'quantity'>('itemCode');

  const determineStockStatus = (quantity: number): 'in-stock' | 'low-stock' | 'out-of-stock' => {
    if (quantity === 0) return 'out-of-stock';
    if (quantity <= 10) return 'low-stock'; // Default reorder level of 10
    return 'in-stock';
  };

  const fetchInventory = async () => {
    try {
      const data = await fetchApi<any[]>('/inventory');
      
      // Transform API data to match component interface
      const transformedData = data.map((item: any) => ({
        id: item.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        description: item.description || '',
        quantity: item.quantity || 0,
        unit: item.unit || 'pcs',
        location: item.location || '',
        supplier: item.supplier || '',
        unitCost: item.unitCost || 0,
        lastUpdated: item.last_updated || item.created_date || new Date().toISOString().split('T')[0],
        status: item.status || determineStockStatus(item.quantity)
      }));
      
      setInventory(transformedData);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; bgColor: string; borderColor: string; }> = {
      'in-stock': { 
        color: '#059669', 
        bgColor: '#f0fdf4', 
        borderColor: '#bbf7d0'
      },
      'low-stock': { 
        color: '#d97706', 
        bgColor: '#fffbeb', 
        borderColor: '#fed7aa'
      },
      'out-of-stock': { 
        color: '#dc2626', 
        bgColor: '#fef2f2', 
        borderColor: '#fecaca'
      },
    };
    return configs[status] || configs['in-stock'];
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
        {status === 'in-stock' ? 'In Stock' : status === 'low-stock' ? 'Low Stock' : 'Out of Stock'}
      </div>
    );
  };

  const filteredInventory = inventory
    .filter(item => {
      const matchesFilter = filter === 'all' || item.status === filter;
      const matchesSearch = searchTerm === '' || 
        item.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFilter && matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'itemCode':
          return a.itemCode.localeCompare(b.itemCode);
        case 'itemName':
          return a.itemName.localeCompare(b.itemName);
        case 'quantity':
          return b.quantity - a.quantity;
        default:
          return 0;
      }
    });

  useEffect(() => {
    fetchInventory();
  }, [refreshKey]);

  // Real-time refresh - listen for inventory updates
  useEffect(() => {
    const handleInventoryUpdated = () => {
      fetchInventory();
    };

    window.addEventListener('inventoryUpdated', handleInventoryUpdated);
    return () => window.removeEventListener('inventoryUpdated', handleInventoryUpdated);
  }, []);

  const totalItems = inventory.length;
  const inStockCount = inventory.filter(item => item.status === 'in-stock').length;
  const lowStockCount = inventory.filter(item => item.status === 'low-stock').length;
  const outOfStockCount = inventory.filter(item => item.status === 'out-of-stock').length;

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
          borderTopColor: '#8b5cf6',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{
          fontSize: '16px',
          fontWeight: '500',
          color: '#6b7280',
          fontFamily: 'Inter, sans-serif'
        }}>
          Loading inventory...
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
            backgroundColor: '#8b5cf6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 6px -1px rgba(139, 92, 246, 0.3)'
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
              Inventory Management
            </h1>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0',
              fontFamily: 'Inter, sans-serif'
            }}>
              Manage items and track stock levels
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              backgroundColor: '#8b5cf6',
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
              e.currentTarget.style.backgroundColor = '#7c3aed';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#8b5cf6';
            }}
          >
            <Plus style={{ width: '16px', height: '16px' }} />
            Add Item
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
              backgroundColor: '#ede9fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Package style={{ width: '24px', height: '24px', color: '#8b5cf6' }} />
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {totalItems}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Total Items
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
              In Stock
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#059669',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {inStockCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#065f46',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            In Stock
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
              Low Stock
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#d97706',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {lowStockCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#78350f',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Low Stock
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
              <Package style={{ width: '24px', height: '24px', color: '#dc2626' }} />
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
              Out of Stock
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#dc2626',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {outOfStockCount}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#7f1d1d',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Out of Stock
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
              placeholder="Search items..."
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
            alignItems: 'center',
            gap: '8px'
          }}>
            <Filter style={{ width: '16px', height: '16px', color: '#6b7280' }} />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              style={{
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
                e.currentTarget.style.borderColor = '#8b5cf6';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <option value="all">All Items</option>
              <option value="in-stock">In Stock</option>
              <option value="low-stock">Low Stock</option>
              <option value="out-of-stock">Out of Stock</option>
            </select>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <ArrowUpDown style={{ width: '16px', height: '16px', color: '#6b7280' }} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
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
                e.currentTarget.style.borderColor = '#8b5cf6';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <option value="itemCode">Item Code</option>
              <option value="itemName">Item Name</option>
              <option value="quantity">Quantity</option>
            </select>
          </div>
        </div>
      </div>

      {/* INVENTORY LIST */}
      {filteredInventory.length === 0 ? (
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
            No inventory items found
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Add your first item to get started.
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
                    Item Code
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
                    Item Name
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
                    Description
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Quantity
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Unit
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
                    Location
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'center',
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
                    textAlign: 'center',
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
                {filteredInventory.map((item) => (
                  <tr
                    key={item.id}
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
                    <td style={{ padding: '16px', fontSize: '14px', fontWeight: '500', color: '#111827', fontFamily: 'Inter, sans-serif' }}>
                      {item.itemCode}
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#374151', fontFamily: 'Inter, sans-serif' }}>
                      {item.itemName}
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#6b7280', fontFamily: 'Inter, sans-serif' }}>
                      {item.description}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: item.status === 'out-of-stock' ? '#dc2626' : 
                               item.status === 'low-stock' ? '#d97706' : '#059669',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        {item.quantity}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', fontSize: '14px', color: '#374151', fontFamily: 'Inter, sans-serif' }}>
                      {item.unit}
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#374151', fontFamily: 'Inter, sans-serif' }}>
                      {item.location}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <StatusBadge status={item.status} />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <button
                        onClick={() => setSelectedItem(item)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid #ede9fe',
                          backgroundColor: 'white',
                          color: '#8b5cf6',
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
                          e.currentTarget.style.backgroundColor = '#f3f4f6';
                          e.currentTarget.style.borderColor = '#8b5cf6';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                          e.currentTarget.style.borderColor = '#ede9fe';
                        }}
                      >
                        <Eye style={{ width: '14px', height: '14px' }} />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Item Detail Modal */}
      {selectedItem && (
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
            padding: '32px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px'
            }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#111827',
                margin: '0',
                fontFamily: 'Inter, sans-serif'
              }}>
                Item Details
              </h2>
              <button
                onClick={() => setSelectedItem(null)}
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
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
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
                  Item Code
                </label>
                <p style={{
                  fontSize: '14px',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {selectedItem.itemCode}
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
                  Item Name
                </label>
                <p style={{
                  fontSize: '14px',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {selectedItem.itemName}
                </p>
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
                  Description
                </label>
                <p style={{
                  fontSize: '14px',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {selectedItem.description}
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
                  {selectedItem.quantity} {selectedItem.unit}
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
                  Location
                </label>
                <p style={{
                  fontSize: '14px',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {selectedItem.location}
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
                  Last Updated
                </label>
                <p style={{
                  fontSize: '14px',
                  color: '#111827',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {selectedItem.lastUpdated}
                </p>
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
                  Status
                </label>
                <div style={{ marginTop: '4px' }}>
                  <StatusBadge status={selectedItem.status} />
                </div>
              </div>
            </div>
            
            <div style={{
              display: 'flex',
              gap: '12px',
              marginTop: '24px'
            }}>
              <button
                onClick={() => setSelectedItem(null)}
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
                Close
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowEditModal(true)}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#8b5cf6',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '500',
                    fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    flex: 1
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#7c3aed';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#8b5cf6';
                  }}
                >
                  Edit Item
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Item Modal */}
      {showCreateModal && (
        <CreateInventoryItemModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            setRefreshKey(prev => prev + 1);
          }}
        />
      )}

      {/* Edit Item Modal */}
      {showEditModal && selectedItem && (
        <EditInventoryItemModal
          item={selectedItem}
          onClose={() => {
            setShowEditModal(false);
            setSelectedItem(null);
          }}
          onUpdated={() => {
            setShowEditModal(false);
            setSelectedItem(null);
            setRefreshKey(prev => prev + 1);
          }}
        />
      )}
    </div>
  );
}
