// Enhanced API endpoint for financial trend chart data
app.get('/api/chart/financial-trend', async (req, res) => {
  const { 
    startDate, 
    endDate, 
    includeProfitMargin = 'true',
    includeGrowthRate = 'false',
    granularity = 'daily'
  } = req.query;

  try {
    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'startDate and endDate are required' 
      });
    }

    // Determine granularity for SQL DATE_TRUNC
    const granularityMap = {
      'daily': 'day',
      'weekly': 'week',
      'monthly': 'month'
    };
    const sqlGranularity = granularityMap[granularity] || 'day';

    // Enhanced query with performance optimization
    const data = await query(`
      SELECT 
        DATE_TRUNC($1, created_date) as period,
        SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END) as revenue,
        SUM(CASE WHEN status = 'RECEIVED' THEN amount ELSE 0 END) as expenses,
        COUNT(CASE WHEN status = 'PAID' THEN 1 END) as revenue_orders,
        COUNT(CASE WHEN status = 'RECEIVED' THEN 1 END) as expense_orders
      FROM purchase_orders 
      WHERE created_date BETWEEN $2 AND $3
      GROUP BY DATE_TRUNC($1, created_date)
      ORDER BY period
    `, [sqlGranularity, startDate, endDate]);

    // Calculate additional metrics
    const enhancedData = data.rows.map((row, index) => {
      const revenue = parseFloat(row.revenue);
      const expenses = parseFloat(row.expenses);
      const profitMargin = revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0;
      
      // Calculate growth rate (compared to previous period)
      let growthRate = 0;
      if (index > 0) {
        const prevRevenue = parseFloat(data.rows[index - 1].revenue);
        if (prevRevenue > 0) {
          growthRate = ((revenue - prevRevenue) / prevRevenue) * 100;
        }
      }

      return {
        date: row.period.toISOString().split('T')[0],
        revenue,
        expenses,
        profitMargin: includeProfitMargin === 'true' ? profitMargin : undefined,
        growthRate: includeGrowthRate === 'true' ? growthRate : undefined,
        revenueOrders: parseInt(row.revenue_orders),
        expenseOrders: parseInt(row.expense_orders)
      };
    });

    // Calculate summary statistics
    const totalRevenue = enhancedData.reduce((sum, d) => sum + d.revenue, 0);
    const totalExpenses = enhancedData.reduce((sum, d) => sum + d.expenses, 0);
    const netProfit = totalRevenue - totalExpenses;
    const avgProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Calculate overall growth rate
    const firstRevenue = enhancedData[0]?.revenue || 0;
    const lastRevenue = enhancedData[enhancedData.length - 1]?.revenue || 0;
    const overallGrowthRate = firstRevenue > 0 ? ((lastRevenue - firstRevenue) / firstRevenue) * 100 : 0;

    res.json({
      success: true,
      data: enhancedData,
      summary: {
        totalRevenue,
        totalExpenses,
        netProfit,
        profitMargin: avgProfitMargin,
        growthRate: overallGrowthRate,
        dataPoints: enhancedData.length
      },
      metadata: {
        period: `${startDate} to ${endDate}`,
        granularity,
        lastUpdated: new Date().toISOString(),
        hasProfitMargin: includeProfitMargin === 'true',
        hasGrowthRate: includeGrowthRate === 'true'
      }
    });

  } catch (error) {
    console.error('Error fetching financial trend data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch financial trend data',
      details: error.message 
    });
  }
});

// Additional endpoint for chart export data
app.get('/api/chart/financial-trend/export', async (req, res) => {
  const { startDate, endDate, format = 'csv' } = req.query;

  try {
    // Fetch the same data as the main endpoint
    const trendResponse = await query(`
      SELECT 
        DATE_TRUNC('day', created_date) as period,
        SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END) as revenue,
        SUM(CASE WHEN status = 'RECEIVED' THEN amount ELSE 0 END) as expenses
      FROM purchase_orders 
      WHERE created_date BETWEEN $1 AND $2
      GROUP BY DATE_TRUNC('day', created_date)
      ORDER BY period
    `, [startDate, endDate]);

    if (format === 'csv') {
      // Generate CSV
      const csv = [
        ['Date', 'Revenue', 'Expenses', 'Net Profit', 'Profit Margin %'],
        ...trendResponse.rows.map(row => {
          const revenue = parseFloat(row.revenue);
          const expenses = parseFloat(row.expenses);
          const netProfit = revenue - expenses;
          const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
          
          return [
            row.period.toISOString().split('T')[0],
            revenue.toFixed(2),
            expenses.toFixed(2),
            netProfit.toFixed(2),
            profitMargin.toFixed(2)
          ].join(',');
        })
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=financial-trend-${startDate}-to-${endDate}.csv`);
      res.send(csv);
    } else {
      res.status(400).json({ error: 'Unsupported export format' });
    }

  } catch (error) {
    console.error('Error exporting chart data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

console.log('📊 Enhanced chart endpoints loaded');
