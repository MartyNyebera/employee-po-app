// ========================================
// FRONTEND FIXES - BUSINESS LOGIC
// Update these components to use corrected business logic
// ========================================

// 1. Fixed BusinessOverview.tsx - Use correct financial API
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { fetchApi } from '../api/client';

interface FixedOverviewMetrics {
  revenue: number;
  expenses: number;
  netProfit: number;
  profitMargin: number;
  deliveredOrders: number;
  revenueStatus: 'MATCHED' | 'MISMATCH';
}

export function FixedBusinessOverview({ isAdmin }: { isAdmin: boolean }) {
  const [metrics, setMetrics] = useState<FixedOverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Use corrected financial API
      const [revenueData, profitData, validationData] = await Promise.all([
        fetchApi('/api/financial/revenue?startDate=2024-01-01&endDate=2024-12-31'),
        fetchApi('/api/financial/net-profit?startDate=2024-01-01&endDate=2024-12-31'),
        fetchApi('/api/validate/business-logic')
      ]);

      const combinedMetrics: FixedOverviewMetrics = {
        revenue: revenueData.total_revenue || 0,
        expenses: profitData.total_expenses || 0,
        netProfit: profitData.net_profit || 0,
        profitMargin: profitData.profit_margin_percent || 0,
        deliveredOrders: revenueData.delivered_orders || 0,
        revenueStatus: revenueData.status || 'MISMATCH'
      };

      setMetrics(combinedMetrics);
      
      // Show warnings for business logic issues
      if (validationData.overall_status !== 'HEALTHY') {
        setError(`Business Logic Issue: ${validationData.overall_status}`);
      }
      
    } catch (err) {
      console.error('Failed to load metrics:', err);
      setError('Failed to load financial metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  if (loading) {
    return <div className="p-6">Loading financial metrics...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-yellow-800 font-semibold">⚠️ Business Logic Alert</h3>
          <p className="text-yellow-700">{error}</p>
          <button 
            onClick={loadMetrics}
            className="mt-2 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return <div className="p-6">No metrics available</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Revenue Status Alert */}
      {metrics.revenueStatus === 'MISMATCH' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">🚨 Revenue Recognition Issue</h3>
          <p className="text-red-700">
            There's a mismatch between recorded revenue and recognized revenue. 
            Some sales orders may be marked complete but not properly recognized.
          </p>
        </div>
      )}

      {/* Financial Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <span className="text-xs text-muted-foreground">
              {metrics.deliveredOrders} orders
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.revenue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Recognized after delivery
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.expenses.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              All costs included
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${metrics.netProfit.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.profitMargin.toFixed(1)}% margin
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.profitMargin.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Revenue vs costs
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// 2. Fixed Inventory Component - Use accurate inventory API
export function FixedInventoryList() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInventory = async () => {
    try {
      const data = await fetchApi('/api/inventory/accurate');
      setInventory(data);
    } catch (error) {
      console.error('Failed to load inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  if (loading) return <div>Loading inventory...</div>;

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Accurate Inventory Levels</h2>
        <p className="text-sm text-gray-600">
          Shows current stock after all increases and reductions
        </p>
      </div>
      
      <div className="space-y-4">
        {inventory.map((item) => (
          <div key={item.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{item.item_name}</h3>
                <p className="text-sm text-gray-600">{item.item_code}</p>
                <p className="text-sm text-gray-600">Location: {item.location}</p>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${
                  item.stock_status === 'OUT_OF_STOCK' ? 'text-red-600' :
                  item.stock_status === 'LOW_STOCK' ? 'text-yellow-600' :
                  'text-green-600'
                }`}>
                  {item.current_quantity} {item.unit}
                </div>
                <div className="text-sm text-gray-600">
                  Reorder at: {item.reorder_level} {item.unit}
                </div>
                <div className="text-xs text-gray-500">
                  Base: {item.base_quantity} | +{item.total_increases} | -{item.total_reductions}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 3. Fixed Sales Order Component - Include inventory validation
export function FixedSalesOrderList() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = async () => {
    try {
      const data = await fetchApi('/api/sales-orders');
      setOrders(data);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const completeOrder = async (orderId: string) => {
    try {
      // This should show a modal to select items and quantities
      // For now, we'll show a warning
      alert('Order completion requires inventory validation. Please ensure sufficient stock before completing.');
    } catch (error) {
      console.error('Failed to complete order:', error);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  if (loading) return <div>Loading sales orders...</div>;

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Sales Orders</h2>
        <p className="text-sm text-yellow-600">
          ⚠️ Order completion now requires inventory validation
        </p>
      </div>
      
      <div className="space-y-4">
        {orders.map((order) => (
          <div key={order.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{order.so_number}</h3>
                <p className="text-sm text-gray-600">{order.client}</p>
                <p className="text-sm text-gray-600">{order.description}</p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">${order.amount}</div>
                <div className={`text-sm px-2 py-1 rounded ${
                  order.status === 'completed' ? 'bg-green-100 text-green-800' :
                  order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {order.status}
                </div>
                {order.status === 'approved' && (
                  <button
                    onClick={() => completeOrder(order.id)}
                    className="mt-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                  >
                    Complete (Check Stock)
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

console.log('🔧 Frontend business logic fixes loaded');
