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
  Users,
  Activity,
  Target
} from 'lucide-react';
import { ProperLineChart } from './ProperLineChart';
import { ProjectBudgetChart } from './ProjectBudgetChart';
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
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('year-to-date');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [inventorySummary, setInventorySummary] = useState<InventorySummary | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);

  // Handle navigation by dispatching events to parent AdminDashboard
  const handleNavigation = (view: string) => {
    // Dispatch custom event to AdminDashboard
    window.dispatchEvent(new CustomEvent('navigateToView', { detail: { view } }));
  };

  // Handle export functionality
  const handleExport = () => {
    console.log('Exporting data...');
    // Add export logic here
  };

  // Handle new order creation
  const handleNewSalesOrder = () => {
    handleNavigation('orders');
  };

  const handleNewPurchaseOrder = () => {
    handleNavigation('purchase-orders');
  };

  const handleAddInventory = () => {
    handleNavigation('inventory');
  };

  const handleViewAllOrders = () => {
    handleNavigation('orders');
  };

  const handleViewAnalytics = () => {
    console.log('Viewing analytics...');
    // You can add analytics view or navigate to a specific view
  };

  const handleDownloadReport = () => {
    console.log('Downloading report...');
    // Add download logic here
  };

  // Load all data
  const loadData = async () => {
    console.log('🔄 Business Overview loadData() called - refreshing all data');
    setLoading(true);
    try {
      const [metricsData, ordersData, inventoryData, chartDataResult] = await Promise.all([
        fetchOverviewMetrics(timePeriod, customRange),
        fetchOrderSummary(timePeriod, customRange),
        fetchInventorySummary(),
        fetchChartData(timePeriod, customRange)
      ]);

      console.log('🔍 BUSINESS OVERVIEW METRICS RECEIVED:', metricsData);
      console.log('Expenses value:', metricsData?.expenses, 'Type:', typeof metricsData?.expenses, 'Is NaN:', isNaN(metricsData?.expenses || 0));
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
      console.log('🔄 Business Overview received ordersUpdated event - refreshing data');
      loadData();
    };

    window.addEventListener('ordersUpdated', handleOrdersUpdated);
    return () => window.removeEventListener('ordersUpdated', handleOrdersUpdated);
  }, []);

  // Format currency
  const formatCurrency = (amount: number) => {
    console.log('💰 formatCurrency called with:', amount, 'Type:', typeof amount, 'Is NaN:', isNaN(amount));
    
    // Handle NaN and invalid values
    if (isNaN(amount) || amount === null || amount === undefined) {
      console.log('🚨 formatCurrency received invalid amount:', amount, 'Type:', typeof amount);
      const result = new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(0);
      console.log('💰 formatCurrency returning (fallback):', result);
      return result;
    }
    
    const result = new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
    console.log('💰 formatCurrency returning (normal):', result);
    return result;
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
      <div style={{ padding: '24px', fontFamily: 'Poppins, sans-serif' }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '24px',
          marginBottom: '32px'
        }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} style={{
              backgroundColor: '#ececec',
              border: '1px solid #d6d6d6',
              borderRadius: '16px',
              padding: '24px',
              height: '140px'
            }}>
              <div style={{ 
                background: 'linear-gradient(90deg, #d6d6d6 0%, #e6e6e6 50%, #d6d6d6 100%)',
                height: '20px',
                borderRadius: '4px',
                marginBottom: '16px',
                animation: 'loading 1.5s infinite'
              }} />
              <div style={{ 
                background: 'linear-gradient(90deg, #d6d6d6 0%, #e6e6e6 50%, #d6d6d6 100%)',
                height: '32px',
                borderRadius: '4px',
                marginBottom: '12px',
                animation: 'loading 1.5s infinite'
              }} />
              <div style={{ 
                background: 'linear-gradient(90deg, #d6d6d6 0%, #e6e6e6 50%, #d6d6d6 100%)',
                height: '16px',
                borderRadius: '4px',
                width: '60%',
                animation: 'loading 1.5s infinite'
              }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'Poppins, sans-serif' }}>
      {/* Header Section */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '16px', 
        marginBottom: '32px',
        alignItems: 'flex-start'
      }}>
        <div>
          <h1 style={{ 
            fontSize: '32px', 
            fontWeight: '700', 
            color: '#000000',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Business Overview
          </h1>
          <p style={{ 
            fontSize: '14px', 
            color: '#5a5a5a', 
            marginTop: '4px',
            margin: '4px 0 0 0'
          }}>
            Company financial health and operations metrics
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar style={{ width: '20px', height: '20px', color: '#8a8a8a' }} />
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
              style={{
                padding: '8px 16px',
                border: '1px solid #c9c9c9',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'Poppins, sans-serif',
                color: '#000000',
                backgroundColor: '#ffffff'
              }}
            >
              {timePeriodOptions.map(option => (
                <option key={option.value} value={option.value} style={{ color: '#000000', backgroundColor: '#ffffff' }}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          <button style={{
            padding: '8px 16px',
            border: '1px solid #d1b01b',
            borderRadius: '8px',
            backgroundColor: '#d1b01b',
            color: '#ffffff',
            fontSize: '14px',
            fontFamily: 'Poppins, sans-serif',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onClick={handleExport}>
            <Download style={{ width: '16px', height: '16px' }} />
            Export
          </button>
        </div>
      </div>

      {/* PROFESSIONAL METRIC CARDS - WITH REAL DATA */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
        gap: '24px',
        marginBottom: '32px'
      }}>
        
        {/* Revenue Card */}
        <div style={{
          position: 'relative',
          background: '#ececec',
          border: '1px solid #d6d6d6',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 200ms ease-in-out',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            height: '4px',
            background: 'linear-gradient(90deg, #d1b01b 0%, #7a6a0c 100%)'
          }} />
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            marginBottom: '16px' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#ececec',
                color: '#d1b01b'
              }}>
                <DollarSign style={{ width: '24px', height: '24px' }} />
              </div>
              <div>
                <h6 style={{ 
                  fontSize: '13px', 
                  fontWeight: '600', 
                  color: '#5a5a5a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  margin: '0',
                  fontFamily: 'Poppins, sans-serif'
                }}>
                  Revenue (SO)
                </h6>
                <p style={{ 
                  fontSize: '12px', 
                  fontWeight: '400', 
                  color: '#5a5a5a',
                  margin: '0',
                  fontFamily: 'Poppins, sans-serif'
                }}>
                  Paid Sales Orders
                </p>
              </div>
            </div>
            {(metrics?.revenueTrend || 0) >= 0 ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#7a6a0c',
                background: '#ececec',
                fontFamily: 'Poppins, sans-serif'
              }}>
                <ArrowUpRight style={{ width: '16px', height: '16px' }} />
                <span>{Math.abs(metrics?.revenueTrend || 0)}%</span>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#dc2626',
                background: '#f4f4f4',
                fontFamily: 'Poppins, sans-serif'
              }}>
                <ArrowDownRight style={{ width: '16px', height: '16px' }} />
                <span>{Math.abs(metrics?.revenueTrend || 0)}%</span>
              </div>
            )}
          </div>
          <p style={{ 
            fontSize: '32px', 
            fontWeight: '700', 
            color: '#000000',
            lineHeight: '1.2',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {formatCurrency(metrics?.revenue || 0)}
          </p>
          <p style={{ 
            fontSize: '13px', 
            fontWeight: '500', 
            color: '#5a5a5a',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Difference
          </p>
        </div>

        {/* Expenses Card */}
        <div style={{
          position: 'relative',
          background: '#ececec',
          border: '1px solid #d6d6d6',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 200ms ease-in-out',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            height: '4px',
            background: 'linear-gradient(90deg, #d1b01b 0%, #7a6a0c 100%)'
          }} />
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            marginBottom: '16px' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#ececec',
                color: '#d1b01b'
              }}>
                <ShoppingCart style={{ width: '24px', height: '24px' }} />
              </div>
              <div>
                <h6 style={{ 
                  fontSize: '13px', 
                  fontWeight: '600', 
                  color: '#5a5a5a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  margin: '0',
                  fontFamily: 'Poppins, sans-serif'
                }}>
                  Expenses (PO)
                </h6>
                <p style={{ 
                  fontSize: '12px', 
                  fontWeight: '400', 
                  color: '#5a5a5a',
                  margin: '0',
                  fontFamily: 'Poppins, sans-serif'
                }}>
                  Received Purchase Orders
                </p>
              </div>
            </div>
            {(metrics?.expensesTrend || 0) >= 0 ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#dc2626',
                background: '#f4f4f4',
                fontFamily: 'Poppins, sans-serif'
              }}>
                <ArrowUpRight style={{ width: '16px', height: '16px' }} />
                <span>{Math.abs(metrics?.expensesTrend || 0).toFixed(1)}%</span>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#7a6a0c',
                background: '#ececec',
                fontFamily: 'Poppins, sans-serif'
              }}>
                <ArrowDownRight style={{ width: '16px', height: '16px' }} />
                <span>{Math.abs(metrics?.expensesTrend || 0).toFixed(1)}%</span>
              </div>
            )}
          </div>
          <p style={{ 
            fontSize: '32px', 
            fontWeight: '700', 
            color: '#000000',
            lineHeight: '1.2',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            ₱{metrics?.expenses?.toLocaleString('en-PH') || 0}
          </p>
          <p style={{ 
            fontSize: '13px', 
            fontWeight: '500', 
            color: '#5a5a5a',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Difference
          </p>
        </div>

        {/* Net Profit Card */}
        <div style={{
          position: 'relative',
          background: '#ececec',
          border: '1px solid #d6d6d6',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 200ms ease-in-out',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            height: '4px',
            background: 'linear-gradient(90deg, #d1b01b 0%, #d1b01b 100%)'
          }} />
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            marginBottom: '16px' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#ececec',
                color: '#d1b01b'
              }}>
                <Target style={{ width: '24px', height: '24px' }} />
              </div>
              <div>
                <h6 style={{ 
                  fontSize: '13px', 
                  fontWeight: '600', 
                  color: '#5a5a5a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  margin: '0',
                  fontFamily: 'Poppins, sans-serif'
                }}>
                  Net Profit
                </h6>
                <p style={{ 
                  fontSize: '12px', 
                  fontWeight: '400', 
                  color: '#5a5a5a',
                  margin: '0',
                  fontFamily: 'Poppins, sans-serif'
                }}>
                  Difference
                </p>
              </div>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#7a6a0c',
              background: '#ececec',
              fontFamily: 'Poppins, sans-serif'
            }}>
              <ArrowUpRight style={{ width: '16px', height: '16px' }} />
              <span>12.5%</span>
            </div>
          </div>
          <p style={{ 
            fontSize: '32px', 
            fontWeight: '700', 
            color: '#000000',
            lineHeight: '1.2',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {formatCurrency(((metrics?.revenue || 0) - (isNaN(metrics?.expenses || 0) ? 0 : (metrics?.expenses || 0))) as number)}
          </p>
          <p style={{ 
            fontSize: '13px', 
            fontWeight: '500', 
            color: '#5a5a5a',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            Revenue - Expenses
          </p>
        </div>

        {/* Profit Margin Card */}
        <div style={{
          position: 'relative',
          background: '#ececec',
          border: '1px solid #d6d6d6',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 200ms ease-in-out',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            height: '4px',
            background: 'linear-gradient(90deg, #d1b01b 0%, #7a6a0c 100%)'
          }} />
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            marginBottom: '16px' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#ececec',
                color: '#d1b01b'
              }}>
                <Activity style={{ width: '24px', height: '24px' }} />
              </div>
              <div>
                <h6 style={{ 
                  fontSize: '13px', 
                  fontWeight: '600', 
                  color: '#5a5a5a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  margin: '0',
                  fontFamily: 'Poppins, sans-serif'
                }}>
                  Profit Margin
                </h6>
                <p style={{ 
                  fontSize: '12px', 
                  fontWeight: '400', 
                  color: '#5a5a5a',
                  margin: '0',
                  fontFamily: 'Poppins, sans-serif'
                }}>
                  Percentage
                </p>
              </div>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#7a6a0c',
              background: '#ececec',
              fontFamily: 'Poppins, sans-serif'
            }}>
              <ArrowUpRight style={{ width: '16px', height: '16px' }} />
              <span>2.1%</span>
            </div>
          </div>
          <p style={{ 
            fontSize: '32px', 
            fontWeight: '700', 
            color: '#000000',
            lineHeight: '1.2',
            margin: '0 0 8px 0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            {metrics?.revenue ? formatPercentage(((metrics.revenue - (metrics.expenses || 0)) / metrics.revenue) * 100) : '0%'}
          </p>
          <p style={{ 
            fontSize: '13px', 
            fontWeight: '500', 
            color: '#5a5a5a',
            margin: '0',
            fontFamily: 'Poppins, sans-serif'
          }}>
            (Net Profit / Revenue) × 100
          </p>
        </div>

      </div>

      {/* CHART SECTION */}
      <div style={{
        background: '#ececec',
        border: '1px solid #d6d6d6',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        marginBottom: '32px'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#000000', marginBottom: '24px' }}>
          Expenses vs Revenue Trend
        </h2>
        <ProperLineChart data={chartData} />
      </div>

      {/* #7 — per-project budget vs committed spend (approved/ordered purchase requests).
          White card so the gold Spent and grey Remaining bars read clearly. */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #d6d6d6',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        marginBottom: '32px'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#000000', marginBottom: '6px' }}>
          Project Budgets
        </h2>
        <p style={{ fontSize: '13px', color: '#5a5a5a', marginBottom: '24px' }}>
          Remaining budget vs spend for each project — spend counts approved &amp; ordered purchase requests linked to the project.
        </p>
        <ProjectBudgetChart />
      </div>

    </div>
  );
}
