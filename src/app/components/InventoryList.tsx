import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Package, Plus, Search, Filter, ArrowUpDown, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface InventoryItem {
  id: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  location: string;
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
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'in-stock' | 'low-stock' | 'out-of-stock'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'itemCode' | 'itemName' | 'quantity'>('itemCode');

  useEffect(() => {
    // Simulate loading inventory data
    setTimeout(() => {
      setInventory([
        {
          id: '1',
          itemCode: 'ITM-001',
          itemName: 'Office Paper A4',
          description: 'High quality white office paper, 80gsm',
          quantity: 500,
          unit: 'reams',
          reorderLevel: 100,
          location: 'Storage Room A',
          lastUpdated: '2026-03-04',
          status: 'in-stock'
        },
        {
          id: '2',
          itemCode: 'ITM-002',
          itemName: 'Printer Ink',
          description: 'Black ink cartridge for HP printers',
          quantity: 15,
          unit: 'pcs',
          reorderLevel: 20,
          location: 'Storage Room B',
          lastUpdated: '2026-03-03',
          status: 'low-stock'
        },
        {
          id: '3',
          itemCode: 'ITM-003',
          itemName: 'Cleaning Supplies',
          description: 'All-purpose cleaning solution',
          quantity: 0,
          unit: 'bottles',
          reorderLevel: 10,
          location: 'Storage Room C',
          lastUpdated: '2026-03-01',
          status: 'out-of-stock'
        },
        {
          id: '4',
          itemCode: 'ITM-004',
          itemName: 'Safety Helmets',
          description: 'Construction safety helmets, yellow',
          quantity: 50,
          unit: 'pcs',
          reorderLevel: 25,
          location: 'Warehouse 1',
          lastUpdated: '2026-03-04',
          status: 'in-stock'
        }
      ]);
      setLoading(false);
    }, 1000);
  }, []);

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
          <Button onClick={() => setShowCreateModal(true)} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="size-4 mr-2" />
            Add Item
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-900">{inventory.length}</div>
              <div className="text-sm text-slate-500">Total Items</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {inventory.filter(item => item.status === 'in-stock').length}
              </div>
              <div className="text-sm text-slate-500">In Stock</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {inventory.filter(item => item.status === 'low-stock').length}
              </div>
              <div className="text-sm text-slate-500">Low Stock</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {inventory.filter(item => item.status === 'out-of-stock').length}
              </div>
              <div className="text-sm text-slate-500">Out of Stock</div>
            </div>
          </CardContent>
        </Card>
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
                  <th className="text-center p-4 font-medium text-sm text-slate-700">Reorder Level</th>
                  <th className="text-left p-4 font-medium text-sm text-slate-700">Location</th>
                  <th className="text-center p-4 font-medium text-sm text-slate-700">Status</th>
                  <th className="text-center p-4 font-medium text-sm text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item) => (
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
                    <td className="p-4 text-sm text-center">{item.reorderLevel}</td>
                    <td className="p-4 text-sm">{item.location}</td>
                    <td className="p-4 text-center">{getStatusBadge(item.status)}</td>
                    <td className="p-4 text-center">
                      <Button variant="outline" size="sm" onClick={() => setSelectedItem(item)}>
                        <Eye className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
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
                <label className="text-sm font-medium text-slate-700">Reorder Level</label>
                <p className="text-sm text-slate-900">{selectedItem.reorderLevel} {selectedItem.unit}</p>
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
                <Button>
                  Edit Item
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Item Modal - Placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
            <h3 className="text-lg font-semibold mb-4">Add Inventory Item</h3>
            <p className="text-slate-600 mb-4">Inventory item creation form will be implemented here.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowCreateModal(false)}>
                Add Item
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
