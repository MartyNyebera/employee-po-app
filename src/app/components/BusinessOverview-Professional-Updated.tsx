import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ShoppingCart, 
  FileText, 
  Package, 
  AlertTriangle,
  Plus,
  Download,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { ProperLineChart } from './ProperLineChart';
import { 
  fetchSalesOrders,
  fetchPurchaseOrders
} from '../api/client';
import {
  ProfessionalCard,
  ProfessionalButton,
  ProfessionalBadge,
  ProfessionalMetricCard,
  ProfessionalSkeleton,
  ProfessionalProgress
} from './ProfessionalUI';

// Helper function to check if order is PAID (case-insensitive)
const isOrderPaid = (order: any): boolean => {
  return order.status?.toString().trim().toUpperCase() === 'PAID';
};

interface PurchaseOrderData {
  id: string;
  poNumber: string;
  client: string;
  description: string;
  amount: number;
  status: 'pending' | 'approved' | 'in-progress' | 'PAID' | 'completed';
  createdDate: string;
  deliveryDate: string;
  assignedAssets: string[];
  orderType?: string;
}

interface SalesOrder {
  id: string;
  soNumber: string;
  client: string;
  description: string;
  amount: number;
  status: 'pending' | 'approved' | 'in-progress' | 'PAID' | 'completed';
  createdDate: string;
  deliveryDate: string;
  assignedAssets: string[];
}

interface BusinessOverviewProps {
  isAdmin: boolean;
}

export function BusinessOverview({ isAdmin }: BusinessOverviewProps) {
  const [loading, setLoading] = useState(true);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderData[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load all data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [salesData, purchaseData] = await Promise.all([
        fetchSalesOrders(),
        fetchPurchaseOrders()
      ]);
      setSalesOrders([...salesData]);
      setPurchaseOrders([...purchaseData]);
      const newChartData = [
        { name: 'Revenue', value: salesData.reduce((sum: number, order: any) => sum + order.amount, 0) },
        { name: 'Expenses', value: purchaseData.reduce((sum: number, order: any) => sum + order.amount, 0) }
      ];
      setChartData(newChartData);
    } catch (error) {
      console.error('BusinessOverview load error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  // Listen for order updates and refresh data
  useEffect(() => {
    const handleOrderUpdate = () => {
      setRefreshKey(prev => prev + 1);
      loadData();
    };

    const handleOrderCreated = () => {
      setRefreshKey(prev => prev + 1);
      loadData();
    };

    const handleOrderDeleted = () => {
      setRefreshKey(prev => prev + 1);
      loadData();
    };

    // Add listeners
    window.addEventListener('salesOrderUpdated', handleOrderUpdate);
    window.addEventListener('salesOrderCreated', handleOrderCreated);
    window.addEventListener('salesOrderDeleted', handleOrderDeleted);

    // Cleanup
    return () => {
      window.removeEventListener('salesOrderUpdated', handleOrderUpdate);
      window.removeEventListener('salesOrderCreated', handleOrderCreated);
      window.removeEventListener('salesOrderDeleted', handleOrderDeleted);
    };
  }, [loadData]); // ✅ ADD loadData as dependency

  const metrics = useMemo(() => {
    const paidOrders = salesOrders.filter(isOrderPaid);
    const paidRevenue = paidOrders.reduce((sum, order) => sum + order.amount, 0);
    const totalRevenue = salesOrders.reduce((sum, order) => sum + order.amount, 0);
    const totalExpenses = purchaseOrders.reduce((sum, order) => sum + order.amount, 0);
    const paidNetProfit = paidRevenue - totalExpenses;
    return {
      totalRevenue,
      paidRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      paidNetProfit,
      profitMargin: paidRevenue > 0 ? ((paidNetProfit / paidRevenue) * 100) : 0
    };
  }, [salesOrders, purchaseOrders]);

  const orderSummary = useMemo(() => ({
    purchaseOrderTotal: purchaseOrders.length,
    purchaseOrderReceived: purchaseOrders.filter(o => o.status === 'completed' || (o.status as string) === 'RECEIVED').length,
    purchaseOrderPending: purchaseOrders.filter(o => o.status === 'pending' || o.status === 'approved').length,
    purchaseOrderOverdue: 0,
    purchaseOrderAmount: purchaseOrders.reduce((s, o) => s + o.amount, 0),
    salesOrderTotal: salesOrders.length,
    salesOrderPaid: salesOrders.filter(isOrderPaid).length,
    salesOrderPending: salesOrders.filter(o => o.status === 'pending' || o.status === 'approved').length,
    salesOrderOverdue: 0,
    salesOrderAmount: salesOrders.reduce((s, o) => s + o.amount, 0),
    miscTotal: 0,
    miscCompleted: 0,
    miscPending: 0,
    miscCancelled: 0,
    miscAmount: 0,
    pendingApprovalPO: purchaseOrders.filter(o => o.status === 'pending').length,
    pendingApprovalSO: salesOrders.filter(o => o.status === 'pending').length,
    pendingApprovalMisc: 0,
  }), [salesOrders, purchaseOrders]);

  const inventorySummary = useMemo(() => ({
    totalItems: 0,
    activeItems: 0,
    inactiveItems: 0,
    inStock: 0,
    lowStock: 0,
    outOfStock: 0,
    lowStockItems: [] as { id: string; name: string; quantity: number }[],
  }), []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format percentage
  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Time period options

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        {/* Loading Skeleton for Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <ProfessionalSkeleton key={index} lines={2} />
          ))}
        </div>
        
        {/* Loading Skeleton for Charts */}
        <div className="professional-card">
          <ProfessionalSkeleton lines={1} />
          <div className="h-64 mt-4" />
        </div>
        
        {/* Loading Skeleton for Order Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <ProfessionalSkeleton key={index} lines={3} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Business Overview
          </h1>
          <p className="text-gray-600 mt-1">
            Company financial health and operations metrics
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={loadData}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <ArrowUpRight className="w-4 h-4" />
            Refresh
          </button>
          
          <button className="btn-outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* PROFESSIONAL METRIC CARDS - FIXED */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Revenue Card */}
        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-label">
              <h6 className="metric-title">Revenue (PAID)</h6>
              <p className="metric-description">Paid Sales Orders Only</p>
            </div>
            <div className="metric-trend up">
              <ArrowUpRight className="w-4 h-4" />
              <span>{salesOrders.filter(isOrderPaid).length} Paid</span>
            </div>
          </div>
          <p className="metric-value">{formatCurrency(metrics.paidRevenue)}</p>
          <p className="metric-change">From {salesOrders.filter(isOrderPaid).length} PAID orders</p>
        </div>

        {/* Expenses Card */}
        <div className="metric-card variant-orange">
          <div className="metric-header">
            <div className="metric-label">
              <h6 className="metric-title">Expenses (PO)</h6>
              <p className="metric-description">Received Purchase Orders</p>
            </div>
            <div className="metric-trend down">
              <ArrowUpRight className="w-4 h-4" />
              <span>Live</span>
            </div>
          </div>
          <p className="metric-value">{formatCurrency(metrics.totalExpenses)}</p>
          <p className="metric-change">From Purchase Orders</p>
        </div>

        {/* Net Profit Card */}
        <div className="metric-card variant-blue">
          <div className="metric-header">
            <div className="metric-label">
              <h6 className="metric-title">Net Profit</h6>
              <p className="metric-description">Paid Revenue - Expenses</p>
            </div>
            <div className="metric-trend up">
              <ArrowUpRight className="w-4 h-4" />
              <span>Live</span>
            </div>
          </div>
          <p className="metric-value" style={{ color: metrics.paidNetProfit >= 0 ? '#10b981' : '#ef4444' }}>
            {formatCurrency(metrics.paidNetProfit)}
          </p>
          <p className="metric-change">Real-time Calculation</p>
        </div>

        {/* Profit Margin Card */}
        <div className="metric-card variant-red">
          <div className="metric-header">
            <div className="metric-label">
              <h6 className="metric-title">Profit Margin</h6>
              <p className="metric-description">Percentage</p>
            </div>
            <div className="metric-trend up">
              <ArrowUpRight className="w-4 h-4" />
              <span>Live</span>
            </div>
          </div>
          <p className="metric-value">
            {formatPercentage(metrics.paidRevenue > 0 ? ((metrics.paidNetProfit / metrics.paidRevenue) * 100) : 0)}
          </p>
          <p className="metric-change">(Paid Net Profit / Paid Revenue) × 100</p>
        </div>

      </div>

      {/* DELIVERY METRICS SECTION */}
      <div className="professional-card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Delivery Metrics</h2>
          <span className="text-sm text-gray-500">Real-time status</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4">
            <p className="text-3xl font-bold text-blue-600">0</p>
            <p className="text-sm text-gray-600 mt-2">Total</p>
          </div>
          <div className="text-center p-4">
            <p className="text-3xl font-bold text-orange-600">0</p>
            <p className="text-sm text-gray-600 mt-2">In Transit</p>
          </div>
          <div className="text-center p-4">
            <p className="text-3xl font-bold text-green-600">0</p>
            <p className="text-sm text-gray-600 mt-2">Completed Today</p>
          </div>
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            <strong>Status Breakdown:</strong> Pending: 0 | Assigned: 0 | Picked Up: 0 | Arrived: 0
          </p>
        </div>
      </div>

      {/* CHART SECTION */}
      <div className="professional-card">
        <h2 className="text-xl font-bold mb-6">Expenses vs Revenue Trend</h2>
        <ProperLineChart data={chartData} />
      </div>

      {/* ORDER SUMMARY SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Purchase Orders */}
        <div className="professional-card">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
              <ShoppingCart className="w-5 h-5 text-orange-600" />
            </div>
            <h3 className="font-semibold">Purchase Orders</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{orderSummary?.purchaseOrderTotal || 0}</p>
          <div className="text-sm text-gray-600 mt-4 space-y-1">
            <p><span className="text-green-600">●</span> Received: {orderSummary?.purchaseOrderReceived || 0}</p>
            <p><span className="text-yellow-600">●</span> Pending/Approved: {orderSummary?.purchaseOrderPending || 0}</p>
            <p><span className="text-red-600">●</span> Overdue: {orderSummary?.purchaseOrderOverdue || 0}</p>
          </div>
          <p className="text-sm text-gray-600 mt-4">Amount: {formatCurrency(orderSummary?.purchaseOrderAmount || 0)}</p>
        </div>

        {/* Sales Orders */}
        <div className="professional-card">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-semibold">Sales Orders</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{orderSummary?.salesOrderTotal || 0}</p>
          <div className="text-sm text-gray-600 mt-4 space-y-1">
            <p><span className="text-green-600">●</span> Paid: {orderSummary?.salesOrderPaid || 0}</p>
            <p><span className="text-yellow-600">●</span> Pending/Approved: {orderSummary?.salesOrderPending || 0}</p>
            <p><span className="text-red-600">●</span> Overdue: {orderSummary?.salesOrderOverdue || 0}</p>
          </div>
          <p className="text-sm text-gray-600 mt-4">Amount: {formatCurrency(orderSummary?.salesOrderAmount || 0)}</p>
        </div>

        {/* Miscellaneous */}
        <div className="professional-card">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold">Miscellaneous</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{orderSummary?.miscTotal || 0}</p>
          <div className="text-sm text-gray-600 mt-4 space-y-1">
            <p><span className="text-green-600">●</span> Completed: {orderSummary?.miscCompleted || 0}</p>
            <p><span className="text-yellow-600">●</span> Pending: {orderSummary?.miscPending || 0}</p>
            <p><span className="text-red-600">●</span> Cancelled: {orderSummary?.miscCancelled || 0}</p>
          </div>
          <p className="text-sm text-gray-600 mt-4">Amount: {formatCurrency(orderSummary?.miscAmount || 0)}</p>
        </div>

        {/* Pending Approval */}
        <div className="professional-card border-red-200 bg-red-50">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mr-3">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <h3 className="font-semibold text-red-900">Pending Approval</h3>
          </div>
          <p className="text-3xl font-bold text-red-600">1 items</p>
          <div className="text-sm text-red-700 mt-4 space-y-1">
            <p>PO: {orderSummary?.pendingApprovalPO || 0}</p>
            <p>SO: {orderSummary?.pendingApprovalSO || 0}</p>
            <p>Misc: {orderSummary?.pendingApprovalMisc || 0}</p>
          </div>
        </div>

      </div>

      {/* INVENTORY SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Total Inventory */}
        <div className="professional-card">
          <h3 className="font-semibold mb-6">Total Inventory</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total Items</span>
              <span className="text-2xl font-bold text-blue-600">{inventorySummary?.totalItems || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Active Items</span>
              <span className="text-2xl font-bold text-green-600">{inventorySummary?.activeItems || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Inactive</span>
              <span className="text-2xl font-bold text-gray-600">{inventorySummary?.inactiveItems || 0}</span>
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-gray-200 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-600"></div>
              <span className="text-sm text-gray-600">In Stock: {inventorySummary?.inStock || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-600"></div>
              <span className="text-sm text-gray-600">Low Stock: {inventorySummary?.lowStock || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-600"></div>
              <span className="text-sm text-gray-600">Out of Stock: {inventorySummary?.outOfStock || 0}</span>
            </div>
          </div>
        </div>

        {/* Inventory Alerts */}
        <div className="professional-card lg:col-span-2">
          <h3 className="font-semibold mb-6">Inventory Alerts</h3>
          <div className="space-y-3">
            {inventorySummary?.lowStockItems && inventorySummary.lowStockItems.length > 0 ? (
              <>
                {inventorySummary.lowStockItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                    <span className="text-sm text-yellow-800">{item.name} ({item.quantity} units)</span>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-gray-500">No low stock alerts</p>
            )}
          </div>
        </div>

      </div>

      {/* ACTION BUTTONS */}
      <div className="professional-card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="btn-primary w-full py-3">
            <Plus className="w-4 h-4 mr-2 inline" />
            New Sales Order
          </button>
          <button className="btn-primary w-full py-3" style={{ backgroundColor: '#f97316' }}>
            <Plus className="w-4 h-4 mr-2 inline" />
            New Purchase Order
          </button>
          <button className="btn-primary w-full py-3" style={{ backgroundColor: '#7c3aed' }}>
            <Plus className="w-4 h-4 mr-2 inline" />
            Add Inventory
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <button className="btn-secondary w-full py-3">View All Orders</button>
          <button className="btn-secondary w-full py-3">View Analytics</button>
        </div>
        
        <div className="mt-4">
          <button className="btn-secondary w-full py-3">Download Report</button>
        </div>
      </div>

    </div>
  );
}
