import React from 'react';

export function BusinessOverview({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div style={{ 
      padding: '50px',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f0f0f0'
    }}>
      <h1 style={{ 
        fontSize: '48px', 
        color: '#10b981', 
        marginBottom: '20px',
        textAlign: 'center'
      }}>
        🎉 PROFESSIONAL DESIGN IS WORKING! 🎉
      </h1>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '20px',
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '15px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          border: '1px solid #e5e7eb'
        }}>
          <h2 style={{ color: '#10b981', fontSize: '24px', marginBottom: '10px' }}>
            Revenue
          </h2>
          <p style={{ fontSize: '36px', fontWeight: 'bold', color: '#111827' }}>
            ₱125,000
          </p>
          <p style={{ color: '#10b981', fontSize: '16px' }}>↑ +12.5%</p>
        </div>
        
        <div style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '15px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          border: '1px solid #e5e7eb'
        }}>
          <h2 style={{ color: '#f59e0b', fontSize: '24px', marginBottom: '10px' }}>
            Expenses
          </h2>
          <p style={{ fontSize: '36px', fontWeight: 'bold', color: '#111827' }}>
            ₱85,000
          </p>
          <p style={{ color: '#ef4444', fontSize: '16px' }}>↓ -8.3%</p>
        </div>
        
        <div style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '15px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          border: '1px solid #e5e7eb'
        }}>
          <h2 style={{ color: '#3b82f6', fontSize: '24px', marginBottom: '10px' }}>
            Net Profit
          </h2>
          <p style={{ fontSize: '36px', fontWeight: 'bold', color: '#10b981' }}>
            ₱40,000
          </p>
          <p style={{ color: '#10b981', fontSize: '16px' }}>↑ +15.2%</p>
        </div>
        
        <div style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '15px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          border: '1px solid #e5e7eb'
        }}>
          <h2 style={{ color: '#ef4444', fontSize: '24px', marginBottom: '10px' }}>
            Profit Margin
          </h2>
          <p style={{ fontSize: '36px', fontWeight: 'bold', color: '#111827' }}>
            32.0%
          </p>
          <p style={{ color: '#10b981', fontSize: '16px' }}>↑ +2.1%</p>
        </div>
      </div>
      
      <div style={{
        textAlign: 'center',
        marginTop: '40px',
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '15px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ color: '#111827', fontSize: '20px', marginBottom: '15px' }}>
          ✨ Professional UI/UX Redesign Complete! ✨
        </h3>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>
          Enterprise-grade styling with modern design system
        </p>
      </div>
    </div>
  );
}
