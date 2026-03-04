import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
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
  Calendar
} from 'lucide-react';
import { InteractiveChart } from './InteractiveChart';
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
  }, [timePeriod, customRange]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatTrend = (trend: number) => {
    if (trend === 0) return null; // Don't show trend if no data
    const isPositive = trend >= 0;
    return (
      <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
        <span>{Math.abs(trend).toFixed(1)}% vs last period</span>
      </div>
    );
  };

  const getEmptyStateMessage = (type: 'expenses' | 'revenue' | 'orders' | 'inventory') => {
    const messages = {
      expenses: { title: 'No Purchase Orders', subtitle: 'Create POs to track expenses', action: 'Create PO →' },
      revenue: { title: 'No Sales Orders', subtitle: 'Create SOs to track revenue', action: 'Create SO →' },
      orders: { title: 'No Orders Yet', subtitle: 'Start creating orders to see activity', action: 'Create Order →' },
      inventory: { title: 'No Items', subtitle: 'Add inventory items to track stock', action: 'Add Items →' }
    };
    return messages[type];
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Business Overview</h2>
          <div className="animate-pulse bg-slate-200 rounded-lg h-10 w-40"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-slate-200 rounded-lg h-32"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with Time Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Business Overview</h2>
          <p className="text-slate-600 text-sm">Company financial health and operations metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-slate-500" />
          <select
            value={timePeriod}
            onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="this-month">This Month</option>
            <option value="last-30-days">Last 30 Days</option>
            <option value="year-to-date">Year-to-Date</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
      </div>

      {/* SECTION 2: KEY FINANCIAL METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* EXPENSES Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-orange-100 rounded-lg">
                <ShoppingCart className="size-5 text-orange-600" />
              </div>
              {metrics && formatTrend(metrics.expensesTrend)}
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-slate-600">EXPENSES (PO)</h3>
              {metrics && metrics.expenses > 0 ? (
                <>
                  <p className="text-2xl font-bold text-slate-900">
                    {formatCurrency(metrics.expenses)}
                  </p>
                  <p className="text-xs text-slate-500">Received Purchase Orders</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-slate-400">₱0</p>
                  <p className="text-xs text-slate-500">No Received Purchase Orders</p>
                  {isAdmin && (
                    <Button variant="outline" size="sm" className="mt-2 text-xs">
                      Create PO →
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* REVENUE Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <FileText className="size-5 text-green-600" />
              </div>
              {metrics && formatTrend(metrics.revenueTrend)}
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-slate-600">REVENUE (SO)</h3>
              {metrics && metrics.revenue > 0 ? (
                <>
                  <p className="text-2xl font-bold text-slate-900">
                    {formatCurrency(metrics.revenue)}
                  </p>
                  <p className="text-xs text-slate-500">Paid Sales Orders</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-slate-400">₱0</p>
                  <p className="text-xs text-slate-500">No Paid Sales Orders</p>
                  {isAdmin && (
                    <Button variant="outline" size="sm" className="mt-2 text-xs">
                      Create SO →
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* NET PROFIT Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg ${metrics && metrics.netProfit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                {metrics && metrics.netProfit >= 0 ? (
                  <TrendingUp className="size-5 text-green-600" />
                ) : (
                  <TrendingDown className="size-5 text-red-600" />
                )}
              </div>
              {metrics && metrics.netProfit !== 0 && (
                <div className={`flex items-center gap-1 text-sm ${metrics && metrics.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {metrics && metrics.netProfit >= 0 ? (
                    <ArrowUpRight className="size-4" />
                  ) : (
                    <ArrowDownRight className="size-4" />
                  )}
                  <span>{metrics && metrics.netProfit >= 0 ? 'Profit' : 'Loss'}</span>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-slate-600">NET PROFIT</h3>
              {metrics && (metrics.revenue > 0 || metrics.expenses > 0) ? (
                <>
                  <p className={`text-2xl font-bold ${metrics && metrics.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(metrics.netProfit)}
                  </p>
                  <p className="text-xs text-slate-500">Difference</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-slate-400">₱0</p>
                  <p className="text-xs text-slate-500">No financial data yet</p>
                  <p className="text-xs text-slate-400">Create orders to see profit/loss</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 3: FINANCIAL TREND GRAPH */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">EXPENSES vs REVENUE TREND</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData && chartData.length > 0 ? (
            <InteractiveChart data={chartData} height={300} />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-slate-400 mb-4">
                <BarChart3 className="size-12 mx-auto" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No data available for selected period</h3>
              <p className="text-slate-500 text-sm mb-6">
                Create Sales Orders or Purchase Orders to see trends.
              </p>
              {isAdmin && (
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" size="sm">
                    Create SO
                  </Button>
                  <Button variant="outline" size="sm">
                    Create PO
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 4: ORDERS SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* PURCHASE ORDERS Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1 bg-orange-100 rounded">
                <ShoppingCart className="size-4 text-orange-600" />
              </div>
              <h3 className="font-semibold text-sm">PURCHASE ORDERS</h3>
            </div>
            <div className="space-y-2">
              <div className="text-lg font-bold">{orderSummary?.purchaseOrders.total || 0}</div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Received: {orderSummary?.purchaseOrders.received || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span>Pending/Approved: {orderSummary?.purchaseOrders.pending || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span>Overdue: {orderSummary?.purchaseOrders.overdue || 0}</span>
                </div>
              </div>
              <div className="text-xs font-medium text-slate-600">
                Amount: {orderSummary ? formatCurrency(orderSummary.purchaseOrders.totalAmount) : '₱0'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SALES ORDERS Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1 bg-green-100 rounded">
                <FileText className="size-4 text-green-600" />
              </div>
              <h3 className="font-semibold text-sm">SALES ORDERS</h3>
            </div>
            <div className="space-y-2">
              <div className="text-lg font-bold">{orderSummary?.salesOrders.total || 0}</div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Paid: {orderSummary?.salesOrders.completed || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span>Pending/Approved: {orderSummary?.salesOrders.pending || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span>Overdue: {orderSummary?.salesOrders.overdue || 0}</span>
                </div>
              </div>
              <div className="text-xs font-medium text-slate-600">
                Amount: {orderSummary ? formatCurrency(orderSummary.salesOrders.totalAmount) : '₱0'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MISCELLANEOUS Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1 bg-blue-100 rounded">
                <Package className="size-4 text-blue-600" />
              </div>
              <h3 className="font-semibold text-sm">MISCELLANEOUS</h3>
            </div>
            <div className="space-y-2">
              <div className="text-lg font-bold">{orderSummary?.miscellaneous.total || 0}</div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Completed: {orderSummary?.miscellaneous.completed || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span>Pending: {orderSummary?.miscellaneous.pending || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span>Cancelled: {orderSummary?.miscellaneous.cancelled || 0}</span>
                </div>
              </div>
              <div className="text-xs font-medium text-slate-600">
                Amount: {orderSummary ? formatCurrency(orderSummary.miscellaneous.totalAmount) : '₱0'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PENDING APPROVAL Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1 bg-red-100 rounded">
                <AlertTriangle className="size-4 text-red-600" />
              </div>
              <h3 className="font-semibold text-sm">PENDING APPROVAL</h3>
            </div>
            <div className="space-y-2">
              <div className="text-lg font-bold text-red-600">{orderSummary?.pendingApproval.total || 0} items</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>PO:</span>
                  <span className="font-medium">{orderSummary?.pendingApproval.po || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>SO:</span>
                  <span className="font-medium">{orderSummary?.pendingApproval.so || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Misc:</span>
                  <span className="font-medium">{orderSummary?.pendingApproval.misc || 0}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 5: INVENTORY STATUS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TOTAL INVENTORY Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">TOTAL INVENTORY</CardTitle>
          </CardHeader>
          <CardContent>
            {inventorySummary && inventorySummary.totalItems > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{inventorySummary.totalItems}</div>
                    <div className="text-xs text-slate-500">Total Items</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{inventorySummary.activeItems}</div>
                    <div className="text-xs text-slate-500">Active Items</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-400">{inventorySummary.totalItems - inventorySummary.activeItems}</div>
                    <div className="text-xs text-slate-500">Inactive</div>
                  </div>
                </div>
                
                {/* Simple Pie Chart Representation */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded"></div>
                      <span>In Stock</span>
                    </div>
                    <span className="font-medium">{inventorySummary.inStock}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                      <span>Low Stock</span>
                    </div>
                    <span className="font-medium">{inventorySummary.lowStock}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded"></div>
                      <span>Out of Stock</span>
                    </div>
                    <span className="font-medium">{inventorySummary.outOfStock}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <Package className="size-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Items</h3>
                <p className="text-slate-500 text-sm mb-4">Add inventory items to track stock</p>
                {isAdmin && (
                  <Button variant="outline" size="sm">
                    Add Items →
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* INVENTORY ALERTS Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">INVENTORY ALERTS</CardTitle>
          </CardHeader>
          <CardContent>
            {inventorySummary && inventorySummary.totalItems > 0 ? (
              <div className="space-y-4">
                {/* Low Stock Items */}
                {inventorySummary.lowStockItems && inventorySummary.lowStockItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <h4 className="text-sm font-medium text-yellow-700">Low Stock: {inventorySummary.lowStockItems.length} items</h4>
                    </div>
                    <div className="space-y-1">
                      {inventorySummary.lowStockItems.slice(0, 3).map((item, index) => (
                        <div key={index} className="text-xs text-slate-600 pl-4">
                          - {item.name} ({item.quantity} units)
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Out of Stock Items */}
                {inventorySummary.outOfStockItems && inventorySummary.outOfStockItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <h4 className="text-sm font-medium text-red-700">Out of Stock: {inventorySummary.outOfStockItems.length} item</h4>
                    </div>
                    <div className="space-y-1">
                      {inventorySummary.outOfStockItems.slice(0, 2).map((item, index) => (
                        <div key={index} className="text-xs text-slate-600 pl-4">
                          - {item.name} (0 units)
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Alerts */}
                {(!inventorySummary.lowStockItems || inventorySummary.lowStockItems.length === 0) && 
                 (!inventorySummary.outOfStockItems || inventorySummary.outOfStockItems.length === 0) && (
                  <div className="text-center py-4">
                    <div className="text-green-600 text-sm">✓ All inventory levels are healthy</div>
                  </div>
                )}

                {/* Link to Inventory Tab */}
                <div className="pt-2 border-t">
                  <Button variant="outline" size="sm" className="w-full">
                    View Inventory Tab →
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Package className="size-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Inventory Data</h3>
                <p className="text-slate-500 text-sm mb-4">Add items to see stock alerts</p>
                {isAdmin && (
                  <Button variant="outline" size="sm">
                    Add Items →
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SECTION 6: QUICK ACTION BUTTONS */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 justify-center">
            {isAdmin && (
              <>
                <Button className="bg-green-600 hover:bg-green-700">
                  <Plus className="size-4 mr-2" />
                  New Sales Order
                </Button>
                <Button className="bg-orange-600 hover:bg-orange-700">
                  <Plus className="size-4 mr-2" />
                  New Purchase Order
                </Button>
                <Button className="bg-purple-600 hover:bg-purple-700">
                  <Plus className="size-4 mr-2" />
                  Add Inventory
                </Button>
              </>
            )}
            <Button variant="outline">
              <FileText className="size-4 mr-2" />
              View All Orders
            </Button>
            <Button variant="outline">
              <BarChart3 className="size-4 mr-2" />
              View Analytics
            </Button>
            <Button variant="outline">
              <Download className="size-4 mr-2" />
              Download Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
