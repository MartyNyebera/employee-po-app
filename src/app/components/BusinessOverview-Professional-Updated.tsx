import { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ShoppingCart, 
  FileText, 
  Package, 
  AlertTriangle,
  Plus,
  Download,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Truck,
  DollarSign,
  TrendingDown as TrendingDownIcon,
  Users,
  Activity,
  Target
} from 'lucide-react';
import { ProperLineChart } from './ProperLineChart';
import { 
  fetchOverviewMetrics, 
  fetchOrderSummary, 
  fetchInventorySummary, 
  fetchChartData,
  type TimePeriod,
  type DateRange,
  type OverviewMetrics,
  type OrderSummary,
  type InventorySummary,
  type ChartDataPoint
} from '../api/overview';
import {
  ProfessionalCard,
  ProfessionalButton,
  ProfessionalBadge,
  ProfessionalMetricCard,
  ProfessionalSkeleton,
  ProfessionalProgress
} from './ProfessionalUI';

interface BusinessOverviewProps {
  isAdmin: boolean;
}

export function BusinessOverview({ isAdmin }: BusinessOverviewProps) {
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('this-month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [inventorySummary, setInventorySummary] = useState<InventorySummary | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);

  // Load all data
  const loadData = async () => {
    setLoading(true);
    try {
      const [metricsData, ordersData, inventoryData, chartDataResult] = await Promise.all([
        fetchOverviewMetrics(timePeriod, customRange),
        fetchOrderSummary(timePeriod, customRange),
        fetchInventorySummary(),
        fetchChartData(timePeriod, customRange)
      ]);

      setMetrics(metricsData);
      setOrderSummary(ordersData);
      setInventorySummary(inventoryData);
      setChartData(chartDataResult);
    } catch (error) {
      console.error('Failed to load overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timePeriod, customRange]);

  // Listen for order updates and refresh data
  useEffect(() => {
    const handleOrdersUpdated = () => {
      console.log('🔄 Orders updated - refreshing Overview data');
      loadData();
    };

    window.addEventListener('ordersUpdated', handleOrdersUpdated);
    return () => window.removeEventListener('ordersUpdated', handleOrdersUpdated);
  }, []);

  // Format currency
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
  const timePeriodOptions = [
    { value: 'this-month', label: 'This Month' },
    { value: 'last-30-days', label: 'Last 30 Days' },
    { value: 'year-to-date', label: 'Year to Date' },
    { value: 'custom', label: 'Custom Range' }
  ];

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
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              {timePeriodOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
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
              <h6 className="metric-title">Revenue (SO)</h6>
              <p className="metric-description">Paid Sales Orders</p>
            </div>
            {(metrics?.revenueTrend || 0) >= 0 ? (
              <div className="metric-trend up">
                <ArrowUpRight className="w-4 h-4" />
                <span>{Math.abs(metrics?.revenueTrend || 0)}%</span>
              </div>
            ) : (
              <div className="metric-trend down">
                <ArrowDownRight className="w-4 h-4" />
                <span>{Math.abs(metrics?.revenueTrend || 0)}%</span>
              </div>
            )}
          </div>
          <p className="metric-value">{formatCurrency(metrics?.revenue || 0)}</p>
          <p className="metric-change">Difference</p>
        </div>

        {/* Expenses Card */}
        <div className="metric-card variant-orange">
          <div className="metric-header">
            <div className="metric-label">
              <h6 className="metric-title">Expenses (PO)</h6>
              <p className="metric-description">Received Purchase Orders</p>
            </div>
            {(metrics?.expensesTrend || 0) >= 0 ? (
              <div className="metric-trend down">
                <ArrowUpRight className="w-4 h-4" />
                <span>{Math.abs(metrics?.expensesTrend || 0)}%</span>
              </div>
            ) : (
              <div className="metric-trend up">
                <ArrowDownRight className="w-4 h-4" />
                <span>{Math.abs(metrics?.expensesTrend || 0)}%</span>
              </div>
            )}
          </div>
          <p className="metric-value">{formatCurrency(metrics?.expenses || 0)}</p>
          <p className="metric-change">Difference</p>
        </div>

        {/* Net Profit Card */}
        <div className="metric-card variant-blue">
          <div className="metric-header">
            <div className="metric-label">
              <h6 className="metric-title">Net Profit</h6>
              <p className="metric-description">Difference</p>
            </div>
            <div className="metric-trend up">
              <ArrowUpRight className="w-4 h-4" />
              <span>12.5%</span>
            </div>
          </div>
          <p className="metric-value" style={{ color: '#10b981' }}>
            {formatCurrency((metrics?.revenue || 0) - (metrics?.expenses || 0))}
          </p>
          <p className="metric-change">Revenue - Expenses</p>
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
              <span>8.3%</span>
            </div>
          </div>
          <p className="metric-value">
            {metrics?.revenue ? formatPercentage(((metrics.revenue - (metrics.expenses || 0)) / metrics.revenue) * 100) : '0%'}
          </p>
          <p className="metric-change">(Net Profit / Revenue) × 100</p>
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
