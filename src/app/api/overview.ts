// API functions for Overview dashboard data fetching

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

// Mock API functions - replace with actual API calls
export async function fetchOverviewMetrics(period: TimePeriod, customRange?: DateRange): Promise<OverviewMetrics> {
  const range = getDateRange(period, customRange);
  
  // Mock data - replace with actual API calls
  return {
    expenses: 300000,
    revenue: 500000,
    netProfit: 200000,
    expensesTrend: 5, // +5% vs previous period
    revenueTrend: 12  // +12% vs previous period
  };
}

export async function fetchOrderSummary(period: TimePeriod, customRange?: DateRange): Promise<OrderSummary> {
  const range = getDateRange(period, customRange);
  
  // Mock data - replace with actual API calls
  return {
    purchaseOrders: {
      total: 8,
      received: 5,
      pending: 2,
      overdue: 1,
      totalAmount: 300000
    },
    salesOrders: {
      total: 10,
      completed: 5,
      pending: 3,
      overdue: 2,
      totalAmount: 500000
    },
    miscellaneous: {
      total: 15,
      completed: 14,
      pending: 1,
      cancelled: 0,
      totalAmount: 50000
    },
    pendingApproval: {
      po: 2,
      so: 3,
      misc: 3,
      total: 8
    }
  };
}

export async function fetchInventorySummary(): Promise<InventorySummary> {
  // Mock data - replace with actual API calls
  return {
    totalItems: 150,
    activeItems: 145,
    inStock: 140,
    lowStock: 3,
    outOfStock: 1,
    lowStockItems: [
      { name: 'Office Paper A4', quantity: 5, reorderLevel: 10 },
      { name: 'Printer Ink', quantity: 3, reorderLevel: 20 },
      { name: 'Cleaning Supplies', quantity: 2, reorderLevel: 10 }
    ],
    outOfStockItems: [
      { name: 'Safety Helmets' }
    ]
  };
}

export async function fetchChartData(period: TimePeriod, customRange?: DateRange): Promise<ChartDataPoint[]> {
  const range = getDateRange(period, customRange);
  const startDate = new Date(range.startDate);
  const endDate = new Date(range.endDate);
  const data: ChartDataPoint[] = [];

  // Generate mock data points based on period
  if (period === 'this-month' || period === 'last-30-days') {
    // Daily data
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    for (let i = 0; i <= daysDiff; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      // Mock random data
      const revenue = Math.floor(Math.random() * 20000) + 10000;
      const expenses = Math.floor(Math.random() * 15000) + 5000;
      
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue,
        expenses
      });
    }
  } else if (period === 'year-to-date') {
    // Monthly data
    const currentMonth = endDate.getMonth();
    for (let i = 0; i <= currentMonth; i++) {
      const date = new Date(2026, i, 1);
      
      // Mock random data
      const revenue = Math.floor(Math.random() * 500000) + 200000;
      const expenses = Math.floor(Math.random() * 300000) + 100000;
      
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short' }),
        revenue,
        expenses
      });
    }
  }

  return data;
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
