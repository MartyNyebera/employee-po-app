import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Package, Plus, Search, Filter, ArrowUpDown, Eye } from 'lucide-react';
import { toast } from 'sonner';
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
      const response = await fetch('/api/inventory');
      const data = await response.json();
      
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

const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in-stock':
        return <Badge className="bg-green-50 text-green-700 border-green-200 px-3 py-1 rounded-full font-medium text-xs">In Stock</Badge>;
      case 'low-stock':
        return <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 px-3 py-1 rounded-full font-medium text-xs">Low Stock</Badge>;
      case 'out-of-stock':
        return <Badge className="bg-red-50 text-red-700 border-red-200 px-3 py-1 rounded-full font-medium text-xs">Out of Stock</Badge>;
      default:
        return <Badge className="bg-gray-50 text-gray-700 border-gray-200 px-3 py-1 rounded-full font-medium text-xs">{status}</Badge>;
    }
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
}, []);

  // Real-time refresh - listen for inventory updates
  useEffect(() => {
    const handleInventoryUpdated = () => {
      console.log('🔄 Inventory updated - refreshing list');
      fetchInventory();
    };

    window.addEventListener('inventoryUpdated', handleInventoryUpdated);
    return () => window.removeEventListener('inventoryUpdated', handleInventoryUpdated);
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Loading inventory...</div>
      </div>
    );
  }

  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Package className="size-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Inventory</h2>
              <p className="text-slate-600 text-sm">Manage items and track stock levels</p>
            </div>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="size-4 mr-2" />
            Add Item
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{inventory.length}</p>
          <p className="text-sm text-slate-500">Total Items</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{inventory.filter(item => item.status === 'in-stock').length}</p>
          <p className="text-sm text-slate-500">In Stock</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-yellow-500">{inventory.filter(item => item.status === 'low-stock').length}</p>
          <p className="text-sm text-slate-500">Low Stock</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{inventory.filter(item => item.status === 'out-of-stock').length}</p>
          <p className="text-sm text-slate-500">Out of Stock</p>
        </div>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-slate-500" />
              <Input
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-slate-500" />
              <select 
                value={filter} 
                onChange={(e) => setFilter(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="all">All Items</option>
                <option value="in-stock">In Stock</option>
                <option value="low-stock">Low Stock</option>
                <option value="out-of-stock">Out of Stock</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="size-4 text-slate-500" />
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="itemCode">Item Code</option>
                <option value="itemName">Item Name</option>
                <option value="quantity">Quantity</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left p-4 font-medium text-sm text-slate-700">Item Code</th>
                  <th className="text-left p-4 font-medium text-sm text-slate-700">Item Name</th>
                  <th className="text-left p-4 font-medium text-sm text-slate-700">Description</th>
                  <th className="text-center p-4 font-medium text-sm text-slate-700">Quantity</th>
                  <th className="text-center p-4 font-medium text-sm text-slate-700">Unit</th>
                  <th className="text-left p-4 font-medium text-sm text-slate-700">Location</th>
                  <th className="text-center p-4 font-medium text-sm text-slate-700">Status</th>
                  <th className="text-center p-4 font-medium text-sm text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.length > 0 ? (
                  filteredInventory.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-4 font-medium text-sm">{item.itemCode}</td>
                    <td className="p-4 text-sm">{item.itemName}</td>
                    <td className="p-4 text-sm text-slate-600">{item.description}</td>
                    <td className="p-4 text-sm text-center">
                      <span className={`font-medium ${
                        item.status === 'out-of-stock' ? 'text-red-600' :
                        item.status === 'low-stock' ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {item.quantity}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-center">{item.unit}</td>
                    <td className="p-4 text-sm">{item.location}</td>
                    <td className="p-4 text-center">{getStatusBadge(item.status)}</td>
                    <td className="p-4 text-center">
                      <Button variant="outline" size="sm" onClick={() => setSelectedItem(item)}>
                        <Eye className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-12 text-center">
                      <Package className="size-12 text-slate-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">No inventory items found</h3>
                      <p className="text-slate-500">Add your first inventory item to get started.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Item Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
            <h3 className="text-lg font-semibold mb-4">Item Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Item Code</label>
                <p className="text-sm text-slate-900">{selectedItem.itemCode}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Item Name</label>
                <p className="text-sm text-slate-900">{selectedItem.itemName}</p>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-slate-700">Description</label>
                <p className="text-sm text-slate-900">{selectedItem.description}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Quantity</label>
                <p className="text-sm text-slate-900">{selectedItem.quantity} {selectedItem.unit}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Location</label>
                <p className="text-sm text-slate-900">{selectedItem.location}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Last Updated</label>
                <p className="text-sm text-slate-900">{selectedItem.lastUpdated}</p>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-slate-700">Status</label>
                <div className="mt-1">{getStatusBadge(selectedItem.status)}</div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setSelectedItem(null)}>
                Close
              </Button>
              {isAdmin && (
                <Button onClick={() => setShowEditModal(true)}>
                  Edit Item
                </Button>
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
            fetchInventory();
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
            fetchInventory();
          }}
        />
      )}
    </div>
  );
}
