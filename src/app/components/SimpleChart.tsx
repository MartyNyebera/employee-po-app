import { useEffect, useRef } from 'react';

interface ChartDataPoint {
  date: string;
  revenue: number;
  expenses: number;
}

interface SimpleChartProps {
  data: ChartDataPoint[];
  height?: number;
}

export function SimpleChart({ data, height = 300 }: SimpleChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (data.length === 0) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = height;

    const padding = 40;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;

    // Find max values for scaling
    const maxValue = Math.max(
      ...data.map(d => d.revenue),
      ...data.map(d => d.expenses)
    );

    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(canvas.width - padding, y);
      ctx.stroke();

      // Draw y-axis labels
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      const value = maxValue - (maxValue / 5) * i;
      ctx.fillText(`₱${(value / 1000).toFixed(0)}K`, padding - 10, y + 4);
    }

    // Draw data points and lines
    const xStep = chartWidth / (data.length - 1);

    // Draw revenue line
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((point, index) => {
      const x = padding + xStep * index;
      const y = padding + chartHeight - (point.revenue / maxValue) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw expenses line
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((point, index) => {
      const x = padding + xStep * index;
      const y = padding + chartHeight - (point.expenses / maxValue) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw data points
    data.forEach((point, index) => {
      const x = padding + xStep * index;

      // Revenue point
      const revenueY = padding + chartHeight - (point.revenue / maxValue) * chartHeight;
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(x, revenueY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Expenses point
      const expensesY = padding + chartHeight - (point.expenses / maxValue) * chartHeight;
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(x, expensesY, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw x-axis labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    data.forEach((point, index) => {
      if (index % Math.ceil(data.length / 6) === 0) { // Show every 6th label to avoid crowding
        const x = padding + xStep * index;
        ctx.fillText(point.date, x, canvas.height - 10);
      }
    });

    // Draw legend
    ctx.font = '12px sans-serif';
    
    // Revenue legend
    ctx.fillStyle = '#10b981';
    ctx.fillRect(canvas.width - 150, 20, 15, 3);
    ctx.fillStyle = '#374151';
    ctx.textAlign = 'left';
    ctx.fillText('Revenue', canvas.width - 130, 25);

    // Expenses legend
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(canvas.width - 150, 35, 15, 3);
    ctx.fillStyle = '#374151';
    ctx.fillText('Expenses', canvas.width - 130, 40);

  }, [data, height]);

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        className="w-full border border-slate-200 rounded-lg"
        style={{ height: `${height}px` }}
      />
    </div>
  );
}
