import React from 'react';
import { 
  DollarSign,
  ShoppingCart,
  Target,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Download,
  Plus
} from 'lucide-react';

export function BusinessOverview({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div style={{ 
      padding: '24px',
      fontFamily: 'Inter, sans-serif',
      backgroundColor: '#f9fafb',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: 'bold', 
          color: '#111827',
          marginBottom: '8px'
        }}>
          Business Overview - PROFESSIONAL DESIGN
        </h1>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>
          Professional dashboard with enterprise-grade styling
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '24px',
        marginBottom: '32px'
      }}>
        
        {/* Revenue Card */}
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            backgroundColor: '#10b981',
            borderRadius: '12px 12px 0 0'
          }} />
          
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              backgroundColor: '#d1fae5',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px'
            }}>
              <DollarSign style={{ width: '20px', height: '20px', color: '#10b981' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Revenue</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Sales Orders</div>
            </div>
          </div>
          
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
            ₱125,000
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', color: '#10b981' }}>
            <ArrowUpRight style={{ width: '16px', height: '16px', marginRight: '4px' }} />
            <span style={{ fontSize: '12px', fontWeight: '600' }}>+12.5%</span>
          </div>
        </div>

        {/* Expenses Card */}
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            backgroundColor: '#f59e0b',
            borderRadius: '12px 12px 0 0'
          }} />
          
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              backgroundColor: '#fef3c7',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px'
            }}>
              <ShoppingCart style={{ width: '20px', height: '20px', color: '#f59e0b' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Expenses</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Purchase Orders</div>
            </div>
          </div>
          
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
            ₱85,000
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', color: '#ef4444' }}>
            <ArrowDownRight style={{ width: '16px', height: '16px', marginRight: '4px' }} />
            <span style={{ fontSize: '12px', fontWeight: '600' }}>-8.3%</span>
          </div>
        </div>

        {/* Net Profit Card */}
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            backgroundColor: '#3b82f6',
            borderRadius: '12px 12px 0 0'
          }} />
          
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              backgroundColor: '#dbeafe',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px'
            }}>
              <Target style={{ width: '20px', height: '20px', color: '#3b82f6' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Net Profit</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Revenue - Expenses</div>
            </div>
          </div>
          
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981', marginBottom: '8px' }}>
            ₱40,000
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', color: '#10b981' }}>
            <ArrowUpRight style={{ width: '16px', height: '16px', marginRight: '4px' }} />
            <span style={{ fontSize: '12px', fontWeight: '600' }}>+15.2%</span>
          </div>
        </div>

        {/* Profit Margin Card */}
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            backgroundColor: '#ef4444',
            borderRadius: '12px 12px 0 0'
          }} />
          
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              backgroundColor: '#fee2e2',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px'
            }}>
              <Activity style={{ width: '20px', height: '20px', color: '#ef4444' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Profit Margin</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Percentage</div>
            </div>
          </div>
          
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
            32.0%
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', color: '#10b981' }}>
            <ArrowUpRight style={{ width: '16px', height: '16px', marginRight: '4px' }} />
            <span style={{ fontSize: '12px', fontWeight: '600' }}>+2.1%</span>
          </div>
        </div>

      </div>

      {/* Action Buttons */}
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
          Quick Actions
        </h3>
        
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '16px'
        }}>
          <button style={{
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <Plus style={{ width: '16px', height: '16px' }} />
            New Sales Order
          </button>
          
          <button style={{
            backgroundColor: '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <Plus style={{ width: '16px', height: '16px' }} />
            New Purchase Order
          </button>
          
          <button style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <Plus style={{ width: '16px', height: '16px' }} />
            Add Inventory
          </button>
        </div>
        
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px'
        }}>
          <button style={{
            backgroundColor: '#f3f4f6',
            color: '#374151',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}>
            View All Orders
          </button>
          
          <button style={{
            backgroundColor: '#f3f4f6',
            color: '#374151',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}>
            View Analytics
          </button>
        </div>
      </div>

    </div>
  );
}
