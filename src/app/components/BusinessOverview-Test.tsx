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

interface BusinessOverviewProps {
  isAdmin: boolean;
}

export function BusinessOverview({ isAdmin }: BusinessOverviewProps) {
  // Static test data - no API calls
  const [loading, setLoading] = useState(false);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Business Overview - TEST
          </h1>
          <p className="text-gray-600 mt-1">
            Professional design test - no API calls
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="this-month">This Month</option>
              <option value="last-30-days">Last 30 Days</option>
            </select>
          </div>
          
          <button className="btn-outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* PROFESSIONAL METRIC CARDS - TEST */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Revenue Card */}
        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-label">
              <h6 className="metric-title">Revenue (SO)</h6>
              <p className="metric-description">Paid Sales Orders</p>
            </div>
            <div className="metric-trend up">
              <ArrowUpRight className="w-4 h-4" />
              <span>12.5%</span>
            </div>
          </div>
          <p className="metric-value">{formatCurrency(125000)}</p>
          <p className="metric-change">Difference</p>
        </div>

        {/* Expenses Card */}
        <div className="metric-card variant-orange">
          <div className="metric-header">
            <div className="metric-label">
              <h6 className="metric-title">Expenses (PO)</h6>
              <p className="metric-description">Received Purchase Orders</p>
            </div>
            <div className="metric-trend down">
              <ArrowDownRight className="w-4 h-4" />
              <span>8.3%</span>
            </div>
          </div>
          <p className="metric-value">{formatCurrency(85000)}</p>
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
              <span>15.2%</span>
            </div>
          </div>
          <p className="metric-value" style={{ color: '#10b981' }}>
            {formatCurrency(40000)}
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
              <span>2.1%</span>
            </div>
          </div>
          <p className="metric-value">
            32.0%
          </p>
          <p className="metric-change">(Net Profit / Revenue) × 100</p>
        </div>

      </div>

      {/* TEST BUTTONS */}
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
