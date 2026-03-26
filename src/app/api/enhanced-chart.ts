// Enhanced API functions for the improved chart component
import { fetchApi } from './client';

export interface EnhancedChartDataPoint {
  date: string;
  revenue: number;
  expenses: number;
  profitMargin?: number;
  growthRate?: number;
  revenueOrders?: number;
  expenseOrders?: number;
}

export interface ChartSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  growthRate: number;
  dataPoints: number;
}

export interface ChartMetadata {
  period: string;
  granularity: string;
  lastUpdated: string;
  hasProfitMargin: boolean;
  hasGrowthRate: boolean;
}

export interface ChartResponse {
  success: boolean;
  data: EnhancedChartDataPoint[];
  summary: ChartSummary;
  metadata: ChartMetadata;
  error?: string;
}

export interface ChartRequestParams {
  startDate: string;
  endDate: string;
  includeProfitMargin?: boolean;
  includeGrowthRate?: boolean;
  granularity?: 'daily' | 'weekly' | 'monthly';
}

// Fetch enhanced chart data
export async function fetchEnhancedChartData(params: ChartRequestParams): Promise<ChartResponse> {
  const {
    startDate,
    endDate,
    includeProfitMargin = true,
    includeGrowthRate = false,
    granularity = 'daily'
  } = params;

  const queryParams = new URLSearchParams({
    startDate,
    endDate,
    includeProfitMargin: includeProfitMargin.toString(),
    includeGrowthRate: includeGrowthRate.toString(),
    granularity
  });

  try {
    const response = await fetchApi(`/chart/financial-trend?${queryParams}`) as ChartResponse;
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch chart data');
    }

    return response;
  } catch (error) {
    console.error('Error fetching enhanced chart data:', error);
    throw error;
  }
}

// Export chart data as CSV
export async function exportChartData(params: ChartRequestParams & { format?: 'csv' }): Promise<void> {
  const { startDate, endDate, format = 'csv' } = params;
  
  const queryParams = new URLSearchParams({
    startDate,
    endDate,
    format
  });

  try {
    const response = await fetch(`/api/chart/financial-trend/export?${queryParams}`);
    
    if (!response.ok) {
      throw new Error('Failed to export chart data');
    }

    // Create download link
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial-trend-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting chart data:', error);
    throw error;
  }
}

// Get default date ranges
export function getDefaultDateRanges() {
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);
  
  const lastMonth = new Date(today);
  lastMonth.setMonth(today.getMonth() - 1);
  
  const lastQuarter = new Date(today);
  lastQuarter.setMonth(today.getMonth() - 3);
  
  const yearStart = new Date(today);
  yearStart.setMonth(0, 1);

  return {
    '7days': {
      startDate: lastWeek.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
      label: 'Last 7 Days'
    },
    '30days': {
      startDate: lastMonth.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
      label: 'Last 30 Days'
    },
    '90days': {
      startDate: lastQuarter.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
      label: 'Last 90 Days'
    },
    'ytd': {
      startDate: yearStart.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
      label: 'Year to Date'
    }
  };
}

// Calculate chart statistics
export function calculateChartStatistics(data: EnhancedChartDataPoint[]) {
  if (!data || data.length === 0) {
    return {
      avgRevenue: 0,
      avgExpenses: 0,
      avgProfitMargin: 0,
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      volatility: 0,
      trendDirection: 'neutral' as 'up' | 'down' | 'neutral'
    };
  }

  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const totalExpenses = data.reduce((sum, d) => sum + d.expenses, 0);
  const netProfit = totalRevenue - totalExpenses;
  const avgRevenue = totalRevenue / data.length;
  const avgExpenses = totalExpenses / data.length;
  
  const profitMargins = data
    .filter(d => d.revenue > 0)
    .map(d => ((d.revenue - d.expenses) / d.revenue) * 100);
  
  const avgProfitMargin = profitMargins.length > 0 
    ? profitMargins.reduce((sum, pm) => sum + pm, 0) / profitMargins.length 
    : 0;

  // Calculate volatility (standard deviation of revenue)
  const revenueVariance = data.reduce((sum, d) => {
    return sum + Math.pow(d.revenue - avgRevenue, 2);
  }, 0) / data.length;
  const volatility = Math.sqrt(revenueVariance);

  // Determine trend direction
  const firstHalf = data.slice(0, Math.floor(data.length / 2));
  const secondHalf = data.slice(Math.floor(data.length / 2));
  
  const firstHalfAvg = firstHalf.reduce((sum, d) => sum + d.revenue, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, d) => sum + d.revenue, 0) / secondHalf.length;
  
  const trendChange = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
  const trendDirection = trendChange > 5 ? 'up' : trendChange < -5 ? 'down' : 'neutral';

  return {
    avgRevenue,
    avgExpenses,
    avgProfitMargin,
    totalRevenue,
    totalExpenses,
    netProfit,
    volatility,
    trendDirection
  };
}
