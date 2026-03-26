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
      <div className="space-y-6">
        {/* Loading Skeleton for Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <ProfessionalSkeleton key={index} lines={2} />
          ))}
        </div>
        
        {/* Loading Skeleton for Charts */}
        <ProfessionalCard>
          <ProfessionalSkeleton lines={1} />
          <div className="h-64 mt-4" />
        </ProfessionalCard>
        
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
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Business Overview
          </h1>
          <p className="text-gray-600 mt-1">
            Track your business performance and key metrics
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
          
          <ProfessionalButton variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </ProfessionalButton>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Revenue Card */}
        <div className="professional-card metric-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="metric-title">Revenue</p>
                <p className="text-sm text-gray-600">Total revenue for selected period</p>
              </div>
            </div>
            {(metrics?.revenueTrend || 0) >= 0 ? (
              <div className="flex items-center space-x-1 text-green-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <span className="text-sm font-medium">
                  {Math.abs(metrics?.revenueTrend || 0)}%
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 text-red-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6 6" />
                </svg>
                <span className="text-sm font-medium">
                  {Math.abs(metrics?.revenueTrend || 0)}%
                </span>
              </div>
            )}
          </div>
          <p className="metric-value">{formatCurrency(metrics?.revenue || 0)}</p>
        </div>

        {/* Expenses Card */}
        <div className="professional-card metric-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <TrendingDownIcon className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="metric-title">Expenses</p>
                <p className="text-sm text-gray-600">Total expenses for selected period</p>
              </div>
            </div>
            {(metrics?.expensesTrend || 0) >= 0 ? (
              <div className="flex items-center space-x-1 text-green-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <span className="text-sm font-medium">
                  {Math.abs(metrics?.expensesTrend || 0)}%
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 text-red-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
                <span className="text-sm font-medium">
                  {Math.abs(metrics?.expensesTrend || 0)}%
                </span>
              </div>
            )}
          </div>
          <p className="metric-value">{formatCurrency(metrics?.expenses || 0)}</p>
        </div>

        {/* Net Profit Card */}
        <div className="professional-card metric-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="metric-title">Net Profit</p>
                <p className="text-sm text-gray-600">Revenue minus expenses</p>
              </div>
            </div>
          </div>
          <p className="metric-value">{formatCurrency(metrics?.netProfit || 0)}</p>
        </div>

        {/* Profit Margin Card */}
        <div className="professional-card metric-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="metric-title">Profit Margin</p>
                <p className="text-sm text-gray-600">Profit as percentage of revenue</p>
              </div>
            </div>
          </div>
          <p className="metric-value">
            {metrics && metrics.revenue > 0 ? formatPercentage((metrics.netProfit / metrics.revenue) * 100) : '0%'}
          </p>
        </div>
      </div>

      {/* Financial Trend Chart */}
      <ProfessionalCard>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Financial Trend
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Revenue vs Expenses over time
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <ProfessionalBadge variant="success">
              Live Data
            </ProfessionalBadge>
            <ProfessionalButton variant="outline" size="sm">
              <BarChart3 className="w-4 h-4 mr-2" />
              View Details
            </ProfessionalButton>
          </div>
        </div>
        
        <div className="h-80">
          {chartData && chartData.length > 0 ? (
            <ProperLineChart data={chartData} height={320} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <BarChart3 className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No data available
              </h3>
              <p className="text-gray-500 text-sm mb-6 max-w-md">
                Create sales orders and purchase orders to see your financial trends.
              </p>
              {isAdmin && (
                <div className="flex gap-3 justify-center">
                  <ProfessionalButton variant="primary" size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Sales Order
                  </ProfessionalButton>
                  <ProfessionalButton variant="outline" size="sm">
                    <FileText className="w-4 h-4 mr-2" />
                    Create Purchase Order
                  </ProfessionalButton>
                </div>
              )}
            </div>
          )}
        </div>
      </ProfessionalCard>

      {/* Order Summary Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            Order Summary
          </h2>
          <ProfessionalBadge variant="info">
            {orderSummary ? `${orderSummary.purchaseOrders.total + orderSummary.salesOrders.total} Total Orders` : 'Loading...'}
          </ProfessionalBadge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Purchase Orders */}
          <ProfessionalCard>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Purchase Orders</h3>
                  <p className="text-sm text-gray-600">Total orders</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total</span>
                <span className="font-semibold text-gray-900">
                  {orderSummary?.purchaseOrders.total || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Received</span>
                <span className="font-medium text-green-600">
                  {orderSummary?.purchaseOrders.received || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Pending</span>
                <span className="font-medium text-amber-600">
                  {orderSummary?.purchaseOrders.pending || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Amount</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(orderSummary?.purchaseOrders.totalAmount || 0)}
                </span>
              </div>
            </div>
          </ProfessionalCard>

          {/* Sales Orders */}
          <ProfessionalCard>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Sales Orders</h3>
                  <p className="text-sm text-gray-600">Total orders</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total</span>
                <span className="font-semibold text-gray-900">
                  {orderSummary?.salesOrders.total || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Completed</span>
                <span className="font-medium text-green-600">
                  {orderSummary?.salesOrders.completed || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Pending</span>
                <span className="font-medium text-amber-600">
                  {orderSummary?.salesOrders.pending || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Amount</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(orderSummary?.salesOrders.totalAmount || 0)}
                </span>
              </div>
            </div>
          </ProfessionalCard>

          {/* Miscellaneous */}
          <ProfessionalCard>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Miscellaneous</h3>
                  <p className="text-sm text-gray-600">Other orders</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total</span>
                <span className="font-semibold text-gray-900">
                  {orderSummary?.miscellaneous.total || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Completed</span>
                <span className="font-medium text-green-600">
                  {orderSummary?.miscellaneous.completed || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Pending</span>
                <span className="font-medium text-amber-600">
                  {orderSummary?.miscellaneous.pending || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Amount</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(orderSummary?.miscellaneous.totalAmount || 0)}
                </span>
              </div>
            </div>
          </ProfessionalCard>

          {/* Pending Approvals */}
          <ProfessionalCard>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Pending</h3>
                  <p className="text-sm text-gray-600">Approvals</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Purchase Orders</span>
                <span className="font-medium text-amber-600">
                  {orderSummary?.pendingApproval.po || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Sales Orders</span>
                <span className="font-medium text-amber-600">
                  {orderSummary?.pendingApproval.so || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Miscellaneous</span>
                <span className="font-medium text-amber-600">
                  {orderSummary?.pendingApproval.misc || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total</span>
                <span className="font-semibold text-amber-600">
                  {orderSummary?.pendingApproval.total || 0}
                </span>
              </div>
            </div>
          </ProfessionalCard>
        </div>
      </div>

      {/* Deliveries Section */}
      <ProfessionalCard>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Delivery Overview
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Track delivery status and performance
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <ProfessionalBadge variant={orderSummary?.deliveries?.currentlyActive && orderSummary.deliveries.currentlyActive > 0 ? 'warning' : 'success'}>
              {orderSummary?.deliveries?.currentlyActive || 0} Active
            </ProfessionalBadge>
            <ProfessionalButton variant="outline" size="sm">
              <Truck className="w-4 h-4 mr-2" />
              View All
            </ProfessionalButton>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Total Deliveries</span>
              <span className="text-lg font-bold text-gray-900">
                {orderSummary?.deliveries?.total || 0}
              </span>
            </div>
            <ProfessionalProgress 
              value={orderSummary?.deliveries?.completed || 0} 
              max={orderSummary?.deliveries?.total || 1}
              variant="success"
              showLabel
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Pending</span>
              <span className="text-lg font-bold text-amber-600">
                {orderSummary?.deliveries?.pending || 0}
              </span>
            </div>
            <ProfessionalProgress 
              value={orderSummary?.deliveries?.pending || 0} 
              max={orderSummary?.deliveries?.total || 1}
              variant="warning"
              showLabel
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">In Transit</span>
              <span className="text-lg font-bold text-blue-600">
                {orderSummary?.deliveries?.inTransit || 0}
              </span>
            </div>
            <ProfessionalProgress 
              value={orderSummary?.deliveries?.inTransit || 0} 
              max={orderSummary?.deliveries?.total || 1}
              variant="primary"
              showLabel
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Completed Today</span>
              <span className="text-lg font-bold text-green-600">
                {orderSummary?.deliveries?.completedToday || 0}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-600">
                {orderSummary?.deliveries?.completedToday && orderSummary.deliveries.completedToday > 0 ? 'Great performance!' : 'No deliveries today'}
              </span>
            </div>
          </div>
        </div>

        {/* Delivery Status Breakdown */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Status Breakdown:</span>
            <span>
              Pending: {orderSummary?.deliveries?.pending || 0} | 
              Assigned: {orderSummary?.deliveries?.assigned || 0} | 
              Picked Up: {orderSummary?.deliveries?.pickedUp || 0} | 
              Arrived: {orderSummary?.deliveries?.arrived || 0}
            </span>
          </div>
        </div>
      </ProfessionalCard>

      {/* Quick Actions */}
      {isAdmin && (
        <ProfessionalCard>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Quick Actions
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Common tasks and shortcuts
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ProfessionalButton variant="primary" className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              New Sales Order
            </ProfessionalButton>
            
            <ProfessionalButton variant="secondary" className="w-full">
              <FileText className="w-4 h-4 mr-2" />
              New Purchase Order
            </ProfessionalButton>
            
            <ProfessionalButton variant="outline" className="w-full">
              <Package className="w-4 h-4 mr-2" />
              Add Inventory
            </ProfessionalButton>
            
            <ProfessionalButton variant="outline" className="w-full">
              <Users className="w-4 h-4 mr-2" />
              Manage Users
            </ProfessionalButton>
          </div>
        </ProfessionalCard>
      )}
    </div>
  );
}
