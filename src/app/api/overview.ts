// API functions for Overview dashboard data fetching

import { fetchApi } from './client';

// Helper function to check if order is PAID (case-insensitive)
const isOrderPaid = (order: any): boolean => {
  return order.status?.toString().trim().toUpperCase() === 'PAID';
};

// Helper function to check if purchase order is RECEIVED (case-insensitive)
const isOrderReceived = (order: any): boolean => {
  const status = order.status?.toString().trim().toUpperCase();
  return status === 'RECEIVED';
};

export interface OverviewMetrics {
  expenses: number;
  revenue: number;
  netProfit: number;
  expensesTrend: number;
  revenueTrend: number;
}

export interface OrderSummary {
  purchaseOrders: {
    total: number;
    received: number;
    pending: number;
    overdue: number;
    totalAmount: number;
  };
  salesOrders: {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
    totalAmount: number;
  };
  miscellaneous: {
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
    totalAmount: number;
  };
  pendingApproval: {
    po: number;
    so: number;
    misc: number;
    total: number;
  };
  deliveries: {
    total: number;
    pending: number;
    assigned: number;
    pickedUp: number;
    inTransit: number;
    arrived: number;
    completed: number;
    cancelled: number;
    completedToday: number;
    currentlyActive: number;
  };
}

export interface InventorySummary {
  totalItems: number;
  activeItems: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  lowStockItems: Array<{
    name: string;
    quantity: number;
    reorderLevel: number;
  }>;
  outOfStockItems: Array<{
    name: string;
  }>;
}

export interface ChartDataPoint {
  date: string;
  revenue: number;
  expenses: number;
}

export type TimePeriod = 'this-month' | 'last-30-days' | 'year-to-date' | 'custom';

export interface DateRange {
  startDate: string;
  endDate: string;
}

// Helper function to get date range based on period
export function getDateRange(period: TimePeriod, customRange?: DateRange): DateRange {
  const today = new Date();
  const startDate = new Date();
  const endDate = new Date();

  switch (period) {
    case 'this-month':
      startDate.setDate(1);
      endDate.setMonth(today.getMonth() + 1, 0); // Last day of current month
      break;
    case 'last-30-days':
      startDate.setDate(today.getDate() - 30);
      break;
    case 'year-to-date':
      startDate.setMonth(0, 1); // January 1st
      break;
    case 'custom':
      if (customRange) {
        return customRange;
      }
      // Fallback to last 30 days if no custom range provided
      startDate.setDate(today.getDate() - 30);
      break;
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
}

// Real API functions - fetch from actual databases

export async function fetchOverviewMetrics(period: TimePeriod, customRange?: DateRange): Promise<OverviewMetrics> {
  const range = getDateRange(period, customRange);
  
  try {
    // Fetch orders with RECEIVED status as expenses
    const purchaseOrders = await fetchApi(`/purchase-orders?startDate=${range.startDate}&endDate=${range.endDate}&status=RECEIVED`);
    const expenses = Array.isArray(purchaseOrders) ? purchaseOrders.reduce((sum: number, po: any) => sum + (po.amount || 0), 0) : 0;

    // Fetch sales orders for revenue (all sales orders are revenue-generating)
    const salesOrdersData = await fetchApi(`/sales-orders?startDate=${range.startDate}&endDate=${range.endDate}`);
    const salesOrders = Array.isArray(salesOrdersData) ? salesOrdersData.filter((so: any) => isOrderPaid(so)) : [];
    const revenue = salesOrders.reduce((sum: number, so: any) => sum + (so.amount || 0), 0);

    // Calculate previous period for trend
    const previousRange = getPreviousPeriodRange(period, customRange);
    let previousExpenses = 0;
    let previousRevenue = 0;

    try {
      const prevPurchaseOrders = await fetchApi(`/purchase-orders?startDate=${previousRange.startDate}&endDate=${previousRange.endDate}&status=RECEIVED`);
      previousExpenses = Array.isArray(prevPurchaseOrders) ? prevPurchaseOrders.reduce((sum: number, po: any) => sum + (po.amount || 0), 0) : 0;

      const prevSalesOrdersData = await fetchApi(`/sales-orders?startDate=${previousRange.startDate}&endDate=${previousRange.endDate}`);
      const prevSalesOrders = Array.isArray(prevSalesOrdersData) ? prevSalesOrdersData.filter((so: any) => isOrderPaid(so)) : [];
      previousRevenue = prevSalesOrders.reduce((sum: number, so: any) => sum + (so.amount || 0), 0);
    } catch (error) {
      console.log('Could not fetch previous period data:', error);
    }

    // Calculate trends
    const expensesTrend = previousExpenses > 0 ? ((expenses - previousExpenses) / previousExpenses) * 100 : 0;
    const revenueTrend = previousRevenue > 0 ? ((revenue - previousRevenue) / previousRevenue) * 100 : 0;

    return {
      expenses,
      revenue,
      netProfit: revenue - expenses,
      expensesTrend,
      revenueTrend
    };
  } catch (error) {
    console.error('Failed to fetch overview metrics:', error);
    // Return zero values if API fails
    return {
      expenses: 0,
      revenue: 0,
      netProfit: 0,
      expensesTrend: 0,
      revenueTrend: 0
    };
  }
}

export async function fetchOrderSummary(period: TimePeriod, customRange?: DateRange): Promise<OrderSummary> {
  const range = getDateRange(period, customRange);
  const today = new Date().toISOString().split('T')[0];

  try {
    // Fetch Purchase Orders
    const purchaseOrders = await fetchApi(`/purchase-orders?startDate=${range.startDate}&endDate=${range.endDate}`);
    const poArray = Array.isArray(purchaseOrders) ? purchaseOrders : [];

    const purchaseOrderSummary = {
      total: poArray.length,
      received: poArray.filter((po: any) => po.status === 'RECEIVED').length,
      pending: poArray.filter((po: any) => ['pending', 'approved'].includes(po.status)).length,
      overdue: poArray.filter((po: any) => po.deliveryDate < today && po.status !== 'RECEIVED').length,
      totalAmount: poArray.filter((po: any) => po.status === 'RECEIVED').reduce((sum: number, po: any) => sum + (po.amount || 0), 0)
    };

    // Fetch all Sales Orders and filter PAID ones (from purchase_orders table)
    const allSalesOrders = await fetchApi(`/purchase-orders?startDate=${range.startDate}&endDate=${range.endDate}`);
    const soArray = Array.isArray(allSalesOrders) ? allSalesOrders.filter((so: any) => so.orderType === 'sales' && isOrderPaid(so)) : [];

    const salesOrderSummary = {
      total: soArray.length,
      completed: soArray.length, // soArray already filtered to PAID
      pending: 0,
      overdue: 0,
      totalAmount: soArray.reduce((sum: number, so: any) => sum + (so.amount || 0), 0)
    };

    // Fetch Miscellaneous (graceful fallback if table doesn't exist yet)
    let miscArray: any[] = [];
    try {
      const miscellaneous = await fetchApi(`/miscellaneous?startDate=${range.startDate}&endDate=${range.endDate}`);
      miscArray = Array.isArray(miscellaneous) ? miscellaneous : [];
    } catch {
      miscArray = [];
    }

    const miscellaneousSummary = {
      total: miscArray.length,
      completed: miscArray.filter((item: any) => item.status === 'completed').length,
      pending: miscArray.filter((item: any) => item.status === 'pending').length,
      cancelled: miscArray.filter((item: any) => item.status === 'cancelled').length,
      totalAmount: miscArray.reduce((sum: number, item: any) => sum + (item.amount || 0), 0)
    };

    // Fetch Delivery Metrics
    let deliveryMetrics: any = {};
    try {
      // Test simple endpoint first
      const test = await fetchApi('/test-delivery');
      console.log('[Overview] Test endpoint:', test);
      
      const deliveries = await fetchApi('/delivery-metrics') as any;
      console.log('[Overview] Delivery metrics fetched:', deliveries);
      console.log('[Overview] Delivery metrics total:', deliveries?.total_deliveries);
      console.log('[Overview] Delivery metrics completed:', deliveries?.completed);
      console.log('[Overview] Delivery metrics in_transit:', deliveries?.in_transit);
      
      // Convert string values to numbers for proper display
      deliveryMetrics = {
        total: parseInt(deliveries?.total_deliveries || '0'),
        pending: parseInt(deliveries?.pending || '0'),
        assigned: parseInt(deliveries?.assigned || '0'),
        pickedUp: parseInt(deliveries?.picked_up || '0'),
        inTransit: parseInt(deliveries?.in_transit || '0'),
        arrived: parseInt(deliveries?.arrived || '0'),
        completed: parseInt(deliveries?.completed || '0'),
        cancelled: parseInt(deliveries?.cancelled || '0'),
        completedToday: parseInt(deliveries?.completed_today || '0'),
        currentlyActive: parseInt(deliveries?.currently_active || '0')
      };
      console.log('[Overview] Converted delivery metrics:', deliveryMetrics);
    } catch (err) {
      console.error('[Overview] Failed to fetch delivery metrics:', err);
      deliveryMetrics = {
        total: 0,
        pending: 0,
        assigned: 0,
        pickedUp: 0,
        inTransit: 0,
        arrived: 0,
        completed: 0,
        cancelled: 0,
        completedToday: 0,
        currentlyActive: 0
      };
    }

    // Calculate pending approval across all modules
    const pendingApproval = {
      po: poArray.filter((po: any) => ['pending', 'approved'].includes(po.status)).length,
      so: 0,
      misc: miscArray.filter((item: any) => item.status === 'pending').length,
      total: poArray.filter((po: any) => ['pending', 'approved'].includes(po.status)).length +
            miscArray.filter((item: any) => item.status === 'pending').length
    };

    return {
      purchaseOrders: purchaseOrderSummary,
      salesOrders: salesOrderSummary,
      miscellaneous: miscellaneousSummary,
      deliveries: deliveryMetrics,
      pendingApproval
    };
  } catch (error) {
    console.error('Failed to fetch order summary:', error);
    // Return empty values if API fails
    return {
      purchaseOrders: { total: 0, received: 0, pending: 0, overdue: 0, totalAmount: 0 },
      salesOrders: { total: 0, completed: 0, pending: 0, overdue: 0, totalAmount: 0 },
      miscellaneous: { total: 0, completed: 0, pending: 0, cancelled: 0, totalAmount: 0 },
      deliveries: { total: 0, pending: 0, assigned: 0, pickedUp: 0, inTransit: 0, arrived: 0, completed: 0, cancelled: 0, completedToday: 0, currentlyActive: 0 },
      pendingApproval: { po: 0, so: 0, misc: 0, total: 0 }
    };
  }
}

export async function fetchInventorySummary(): Promise<InventorySummary> {
  try {
    const inventory = await fetchApi('/inventory');
    const inventoryArray = Array.isArray(inventory) ? inventory : [];

    const totalItems = inventoryArray.length;
    const activeItems = inventoryArray.filter((item: any) => (item.quantity || 0) > 0).length;
    const inStock = inventoryArray.filter((item: any) => (item.quantity || 0) > (item.reorderLevel || 0)).length;
    const lowStock = inventoryArray.filter((item: any) => (item.quantity || 0) <= (item.reorderLevel || 0) && (item.quantity || 0) > 0).length;
    const outOfStock = inventoryArray.filter((item: any) => (item.quantity || 0) === 0).length;

    const lowStockItems = inventoryArray
      .filter((item: any) => (item.quantity || 0) <= (item.reorderLevel || 0) && (item.quantity || 0) > 0)
      .slice(0, 4)
      .map((item: any) => ({
        name: item.itemName || item.name || 'Unknown Item',
        quantity: item.quantity || 0,
        reorderLevel: item.reorderLevel || 0
      }));

    const outOfStockItems = inventoryArray
      .filter((item: any) => (item.quantity || 0) === 0)
      .slice(0, 2)
      .map((item: any) => ({
        name: item.itemName || item.name || 'Unknown Item'
      }));

    return {
      totalItems,
      activeItems,
      inStock,
      lowStock,
      outOfStock,
      lowStockItems,
      outOfStockItems
    };
  } catch (error) {
    console.error('Failed to fetch inventory summary:', error);
    // Return empty values if API fails
    return {
      totalItems: 0,
      activeItems: 0,
      inStock: 0,
      lowStock: 0,
      outOfStock: 0,
      lowStockItems: [],
      outOfStockItems: []
    };
  }
}

export async function fetchChartData(period: TimePeriod, customRange?: DateRange): Promise<ChartDataPoint[]> {
  const range = getDateRange(period, customRange);
  const data: ChartDataPoint[] = [];

  try {
    // Fetch sales orders for revenue and purchase orders for expenses
    const [salesOrdersData, purchaseOrdersData] = await Promise.all([
      fetchApi(`/sales-orders?startDate=${range.startDate}&endDate=${range.endDate}`),
      fetchApi(`/purchase-orders?startDate=${range.startDate}&endDate=${range.endDate}`)
    ]);
    const salesOrders = Array.isArray(salesOrdersData) ? salesOrdersData : [];
    const purchaseOrders = Array.isArray(purchaseOrdersData) ? purchaseOrdersData : [];
    // DEBUG: Log API responses
    console.log('🔍 CHART API DEBUG:');
    console.log('Date range:', range.startDate, 'to', range.endDate);
    console.log('Sales orders count:', salesOrders.length);
    console.log('Purchase orders count:', purchaseOrders.length);
    console.log('🔍 SALES ORDERS DATA:', JSON.stringify(salesOrders.map((order: any) => ({
      id: order.id,
      soNumber: order.soNumber,
      status: order.status,
      amount: order.amount,
      isPaid: isOrderPaid(order)
    })), null, 2));
    console.log('🔍 PURCHASE ORDERS DATA:', JSON.stringify(purchaseOrders.map((order: any) => ({
      id: order.id,
      poNumber: order.poNumber,
      orderType: order.orderType,
      status: order.status,
      amount: order.amount,
      isReceived: order.status === 'RECEIVED'
    })), null, 2));
    console.log('PAID Sales Orders:', salesOrders.filter((so: any) => isOrderPaid(so)).length);
    console.log('RECEIVED Purchase Orders:', purchaseOrders.filter((po: any) => isOrderReceived(po)).length);
    
    const paidSOs = salesOrders.filter((so: any) => isOrderPaid(so));
    const receivedPOs = purchaseOrders.filter((po: any) => isOrderReceived(po) && po.orderType !== 'sales');
    
    console.log('PAID SOs total:', paidSOs.reduce((sum: number, so: any) => sum + (so.amount || 0), 0));
    console.log('RECEIVED POs total:', receivedPOs.reduce((sum: number, po: any) => sum + (po.amount || 0), 0));
    
    // DEBUG: Log all Purchase Orders with their status
    console.log('🔍 ALL PURCHASE ORDERS STATUS:');
    purchaseOrders.forEach((po: any, index: number) => {
      console.log(`PO ${index}:`, {
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        statusTrimmed: po.status?.toString().trim(),
        statusUpper: po.status?.toString().trim().toUpperCase(),
        isReceived: isOrderReceived(po),
        amount: po.amount
      });
    });
    
    // DEBUG: Log actual dates of PAID SOs
    console.log('🔍 PAID SOs DETAILS:');
    paidSOs.forEach((so: any, index: number) => {
      console.log(`SO ${index}:`, {
        id: so.id,
        poNumber: so.poNumber,
        createdDate: so.createdDate,
        amount: so.amount,
        status: so.status,
        orderType: so.orderType
      });
    });

    if (period === 'this-month' || period === 'last-30-days') {
      // Generate daily data points
      const startDate = new Date(range.startDate);
      const endDate = new Date(range.endDate);
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      for (let i = 0; i <= daysDiff; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + i);
        const dateString = currentDate.toISOString().split('T')[0];

        // Calculate revenue and expenses for this specific day
        // Revenue: PAID Sales Orders only
        const dayRevenue = salesOrders
          .filter((so: any) => {
            const soDate = so.createdDate ? so.createdDate.split('T')[0] : '';
            return soDate === dateString && isOrderPaid(so);
          })
          .reduce((sum: number, so: any) => sum + (so.amount || 0), 0);

        // Expenses: RECEIVED Purchase Orders only
        const dayExpenses = purchaseOrders
          .filter((po: any) => {
            const poDate = po.createdDate ? po.createdDate.split('T')[0] : '';
            return poDate === dateString && isOrderReceived(po);
          })
          .reduce((sum: number, po: any) => sum + (po.amount || 0), 0);

        // DEBUG: Log date filtering for first few days
        if (i < 5) {
          console.log(`🔍 DATE FILTER DEBUG - Day ${i}:`);
          console.log(`Date: ${dateString}`);
          console.log(`PAID SOs on this date:`, salesOrders.filter((so: any) => {
            const soDate = so.createdDate ? so.createdDate.split('T')[0] : '';
            return soDate === dateString && isOrderPaid(so);
          }));
          console.log(`Day Revenue: ${dayRevenue}`);
          console.log(`Day Expenses: ${dayExpenses}`);
        }

        data.push({
          date: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          revenue: dayRevenue,
          expenses: dayExpenses
        });
      }
    } else if (period === 'year-to-date') {
      // Generate monthly data points
      const currentMonth = new Date().getMonth();
      
      for (let i = 0; i <= currentMonth; i++) {
        const monthStart = new Date(2026, i, 1).toISOString().split('T')[0];
        const monthEnd = new Date(2026, i + 1, 0).toISOString().split('T')[0];

        const monthRevenue = salesOrders
          .filter((so: any) => {
            const soDate = so.createdDate ? so.createdDate.split('T')[0] : '';
            return soDate >= monthStart && soDate <= monthEnd && isOrderPaid(so);
          })
          .reduce((sum: number, so: any) => sum + (so.amount || 0), 0);

        const monthExpenses = purchaseOrders
          .filter((po: any) => {
            const poDate = po.createdDate ? po.createdDate.split('T')[0] : '';
            return poDate >= monthStart && poDate <= monthEnd && isOrderReceived(po);
          })
          .reduce((sum: number, po: any) => sum + (po.amount || 0), 0);

        data.push({
          date: new Date(2026, i, 1).toLocaleDateString('en-US', { month: 'short' }),
          revenue: monthRevenue,
          expenses: monthExpenses
        });
      }
    }

    return data;
  } catch (error) {
    console.error('Failed to fetch chart data:', error);
    return [];
  }
}

// Helper function to get previous period range for trend calculation
function getPreviousPeriodRange(period: TimePeriod, customRange?: DateRange): DateRange {
  const today = new Date();
  const startDate = new Date();
  const endDate = new Date();

  switch (period) {
    case 'this-month':
      startDate.setMonth(today.getMonth() - 1, 1);
      endDate.setMonth(today.getMonth(), 0); // Last day of previous month
      break;
    case 'last-30-days':
      startDate.setDate(today.getDate() - 60);
      endDate.setDate(today.getDate() - 31);
      break;
    case 'year-to-date':
      startDate.setFullYear(today.getFullYear() - 1, 0, 1);
      endDate.setFullYear(today.getFullYear() - 1, 11, 31);
      break;
    case 'custom':
      if (customRange) {
        const daysDiff = Math.ceil((new Date(customRange.endDate).getTime() - new Date(customRange.startDate).getTime()) / (1000 * 60 * 60 * 24));
        startDate.setDate(today.getDate() - (daysDiff * 2));
        endDate.setDate(today.getDate() - daysDiff - 1);
      } else {
        startDate.setDate(today.getDate() - 60);
        endDate.setDate(today.getDate() - 31);
      }
      break;
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
}

// Real API call functions (to be implemented with actual backend)
export async function fetchPurchaseOrdersData(period: TimePeriod, customRange?: DateRange) {
  const range = getDateRange(period, customRange);
  
  // TODO: Replace with actual API call
  // const response = await fetch(`/api/purchase-orders?startDate=${range.startDate}&endDate=${range.endDate}`);
  // return response.json();
  
  return [];
}

export async function fetchSalesOrdersData(period: TimePeriod, customRange?: DateRange) {
  const range = getDateRange(period, customRange);
  
  // TODO: Replace with actual API call
  // const response = await fetch(`/api/sales-orders?startDate=${range.startDate}&endDate=${range.endDate}`);
  // return response.json();
  
  return [];
}

export async function fetchInventoryData() {
  // TODO: Replace with actual API call
  // const response = await fetch('/api/inventory');
  // return response.json();
  
  return [];
}

export async function fetchMiscellaneousData(period: TimePeriod, customRange?: DateRange) {
  const range = getDateRange(period, customRange);
  
  // TODO: Replace with actual API call
  // const response = await fetch(`/api/miscellaneous?startDate=${range.startDate}&endDate=${range.endDate}`);
  // return response.json();
  
  return [];
}
