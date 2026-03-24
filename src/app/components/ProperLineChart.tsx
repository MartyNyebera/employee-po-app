import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ChartDataPoint {
  date: string;
  revenue: number;
  expenses: number;
}

interface ProperLineChartProps {
  data: ChartDataPoint[];
  height?: number;
}

export function ProperLineChart({ data, height = 400 }: ProperLineChartProps) {
  // Check if expenses data has any non-zero values
  const hasExpensesData = data && 
    data.some((d: any) => (d.expenses || d.value || d.amount || 0) > 0);

  // DEBUG: Log what data the chart receives
  console.log('🔍 CHART COMPONENT DEBUG:');
  console.log('Chart received data:', data);
  console.log('Data length:', data.length);
  console.log('Has expenses data:', hasExpensesData);
  if (data.length > 0) {
    console.log('First point:', data[0]);
    console.log('Last point:', data[data.length - 1]);
    console.log('Max revenue:', Math.max(...data.map(d => d.revenue)));
    console.log('Max expenses:', Math.max(...data.map(d => d.expenses)));
  }

  // Y-axis formatter for currency
  const yAxisTickFormatter = (value: number) => {
    if (value >= 1000000) {
      return '₱' + (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return '₱' + (value / 1000).toFixed(0) + 'K';
    }
    return '₱' + value;
  };

  // Tooltip formatter for currency
  const tooltipFormatter = (value: number, name: string) => {
    return ['₱' + value.toLocaleString('en-PH', { minimumFractionDigits: 2 }), name];
  };

  // Custom tooltip content
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="font-semibold text-slate-900 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: ₱{entry.value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (data.length === 0) {
    return (
      <div className="w-full h-64 border border-slate-200 rounded-lg flex items-center justify-center">
        <p className="text-slate-500">No data available for selected period</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="date" 
            tick={{ fill: '#6b7280', fontSize: 12 }}
            tickLine={{ stroke: '#e5e7eb' }}
          />
          <YAxis 
            tickFormatter={yAxisTickFormatter}
            tick={{ fill: '#6b7280', fontSize: 12 }}
            tickLine={{ stroke: '#e5e7eb' }}
            domain={[0, 'dataMax + 100000']}
            allowDataOverflow={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{
              paddingTop: '20px',
              fontSize: '14px'
            }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#14b8a6"
            strokeWidth={2}
            dot={{ fill: '#14b8a6', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6 }}
            name="Revenue"
            isAnimationActive={true}
            animationDuration={1000}
          />
          {hasExpensesData && (
            <Line
              type="monotone"
              dataKey="expenses"
              stroke="#EF4444"
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, value } = props;
                if (!value || value === 0) return <g key={props.key} />;
                return (
                  <circle 
                    key={props.key}
                    cx={cx} cy={cy} r={4} 
                    fill="#EF4444" 
                    stroke="white" 
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 6 }}
              name="Expenses"
              isAnimationActive={true}
              animationDuration={1200}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
