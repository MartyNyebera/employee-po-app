import { useState, useCallback, useMemo } from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from 'recharts';
import { format, parseISO, isValid } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar, Download, TrendingUp, TrendingDown, BarChart3, LineChartIcon } from 'lucide-react';

interface EnhancedChartDataPoint {
  date: string;
  revenue: number;
  expenses: number;
  profitMargin?: number;
  growthRate?: number;
}

interface EnhancedChartProps {
  data: EnhancedChartDataPoint[];
  height?: number;
  loading?: boolean;
  error?: string;
  onDateRangeChange?: (range: { startDate: string; endDate: string }) => void;
}

type ChartType = 'line' | 'area' | 'bar' | 'stacked';

export function EnhancedChart({ 
  data, 
  height = 400, 
  loading = false, 
  error,
  onDateRangeChange 
}: EnhancedChartProps) {
  const [chartType, setChartType] = useState<ChartType>('area');
  const [showProfitMargin, setShowProfitMargin] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('30days');

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return isValid(date) ? format(date, 'MMM dd') : dateString;
    } catch {
      return dateString;
    }
  };

  // Enhanced tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 border border-slate-200 rounded-lg shadow-lg max-w-xs">
          <div className="font-semibold text-slate-900 mb-2">{formatDate(label)}</div>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex justify-between items-center mb-1">
              <span className="text-sm" style={{ color: entry.color }}>
                {entry.name}:
              </span>
              <span className="text-sm font-medium ml-2">
                {formatCurrency(entry.value)}
              </span>
            </div>
          ))}
          {showProfitMargin && data.profitMargin !== undefined && (
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Profit Margin:</span>
                <span className={`text-sm font-medium ${
                  data.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {data.profitMargin.toFixed(1)}%
                </span>
              </div>
            </div>
          )}
          {data.growthRate !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Growth:</span>
              <span className={`text-sm font-medium flex items-center ${
                data.growthRate >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {data.growthRate >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {Math.abs(data.growthRate).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Y-axis formatter
  const yAxisFormatter = (value: number) => {
    if (value >= 1000000) return formatCurrency(value).replace('₱', '₱') + 'M';
    if (value >= 1000) return formatCurrency(value).replace('₱', '₱') + 'K';
    return formatCurrency(value);
  };

  // Chart render function
  const renderChart = () => {
    const chartProps = {
      data,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} />
            <YAxis tickFormatter={yAxisFormatter} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="revenue" 
              stroke="#10b981" 
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name="Revenue"
            />
            <Line 
              type="monotone" 
              dataKey="expenses" 
              stroke="#f59e0b" 
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name="Expenses"
            />
            {showProfitMargin && (
              <Line 
                type="monotone" 
                dataKey="profitMargin" 
                stroke="#6366f1" 
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Profit Margin %"
              />
            )}
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} />
            <YAxis tickFormatter={yAxisFormatter} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="revenue" 
              stroke="#10b981" 
              fill="#10b981" 
              fillOpacity={0.3}
              strokeWidth={2}
              name="Revenue"
            />
            <Area 
              type="monotone" 
              dataKey="expenses" 
              stroke="#f59e0b" 
              fill="#f59e0b" 
              fillOpacity={0.3}
              strokeWidth={2}
              name="Expenses"
            />
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} />
            <YAxis tickFormatter={yAxisFormatter} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
            <Bar dataKey="expenses" fill="#f59e0b" name="Expenses" />
          </BarChart>
        );

      case 'stacked':
        return (
          <BarChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} />
            <YAxis tickFormatter={yAxisFormatter} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="revenue" stackId="a" fill="#10b981" name="Revenue" />
            <Bar dataKey="expenses" stackId="a" fill="#f59e0b" name="Expenses" />
          </BarChart>
        );

      default:
        return null;
    }
  };

  // Export functionality
  const exportChart = useCallback((format: 'csv' | 'png') => {
    if (format === 'csv') {
      const csv = [
        ['Date', 'Revenue', 'Expenses', 'Profit Margin'].join(','),
        ...data.map(row => [
          row.date,
          row.revenue,
          row.expenses,
          row.profitMargin || ''
        ].join(','))
      ].join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial-trend-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    }
    // PNG export would require html2canvas or similar library
  }, [data]);

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">EXPENSES vs REVENUE TREND</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">EXPENSES vs REVENUE TREND</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-red-500 mb-2">
              <TrendingDown className="w-8 h-8 mx-auto" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Error loading chart data</h3>
            <p className="text-slate-500 text-sm">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">EXPENSES vs REVENUE TREND</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-slate-400 mb-4">
              <BarChart3 className="w-12 h-12 mx-auto" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No data available</h3>
            <p className="text-slate-500 text-sm">
              Create sales orders or purchase orders to see trends.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">EXPENSES vs REVENUE TREND</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={chartType} onValueChange={(value: ChartType) => setChartType(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="area">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Area
                  </div>
                </SelectItem>
                <SelectItem value="line">
                  <div className="flex items-center gap-2">
                    <LineChartIcon className="w-4 h-4" />
                    Line
                  </div>
                </SelectItem>
                <SelectItem value="bar">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Bar
                  </div>
                </SelectItem>
                <SelectItem value="stacked">Stacked</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowProfitMargin(!showProfitMargin)}
              className={showProfitMargin ? 'bg-blue-50 border-blue-200' : ''}
            >
              Profit Margin
            </Button>
            
            <Button variant="outline" size="sm" onClick={() => exportChart('csv')}>
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          {renderChart()}
        </ResponsiveContainer>
        
        {/* Summary statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(data.reduce((sum, d) => sum + d.revenue, 0))}
            </div>
            <div className="text-sm text-slate-600">Total Revenue</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(data.reduce((sum, d) => sum + d.expenses, 0))}
            </div>
            <div className="text-sm text-slate-600">Total Expenses</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${
              data.reduce((sum, d) => sum + (d.revenue - d.expenses), 0) >= 0 ? 'text-blue-600' : 'text-red-600'
            }`}>
              {formatCurrency(data.reduce((sum, d) => sum + (d.revenue - d.expenses), 0))}
            </div>
            <div className="text-sm text-slate-600">Net Profit</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${
              data[data.length - 1]?.revenue > 0 ? 
              ((data[data.length - 1].revenue - data[data.length - 1].expenses) / data[data.length - 1].revenue * 100) >= 0 ? 'text-purple-600' : 'text-red-600'
              : 'text-slate-400'
            }`}>
              {data[data.length - 1]?.revenue > 0 ? 
                `${(((data[data.length - 1].revenue - data[data.length - 1].expenses) / data[data.length - 1].revenue) * 100).toFixed(1)}%`
                : 'N/A'
              }
            </div>
            <div className="text-sm text-slate-600">Latest Margin</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
