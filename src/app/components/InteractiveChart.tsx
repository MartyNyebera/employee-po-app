import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChartDataPoint {
  date: string;
  revenue: number;
  expenses: number;
}

interface InteractiveChartProps {
  data: ChartDataPoint[];
  height?: number;
}

interface TooltipData {
  x: number;
  y: number;
  point: ChartDataPoint;
  type: 'revenue' | 'expenses';
}

export function InteractiveChart({ data, height = 300 }: InteractiveChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height });

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [height]);

  if (data.length === 0) {
    return (
      <div className="w-full h-64 border border-slate-200 rounded-lg flex items-center justify-center">
        <p className="text-slate-500">No data available for selected period</p>
      </div>
    );
  }

  const padding = { top: 20, right: 160, bottom: 40, left: 60 };
  const chartWidth = dimensions.width - padding.left - padding.right;
  const chartHeight = dimensions.height - padding.top - padding.bottom;

  // Calculate scales
  const maxValue = Math.max(
    ...data.map(d => d.revenue),
    ...data.map(d => d.expenses)
  );

  const xScale = (index: number) => (index / (data.length - 1)) * chartWidth;
  const yScale = (value: number) => chartHeight - (value / maxValue) * chartHeight;

  // Generate path strings for smooth curves
  const generatePath = (values: number[]) => {
    if (values.length === 0) return '';
    
    const points = values.map((value, index) => ({
      x: xScale(index),
      y: yScale(value)
    }));

    // Create smooth curve using quadratic bezier curves
    let path = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = prev.x + (curr.x - prev.x) / 2;
      const cpy = prev.y;
      path += ` Q ${cpx} ${cpy}, ${curr.x} ${curr.y}`;
    }
    
    return path;
  };

  const revenuePath = generatePath(data.map(d => d.revenue));
  const expensesPath = generatePath(data.map(d => d.expenses));

  // Gradient definitions
  const gradients = (
    <defs>
      <linearGradient id="revenueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
      </linearGradient>
      <linearGradient id="expensesGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
      </linearGradient>
    </defs>
  );

  return (
    <div className="w-full relative">
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        className="border border-slate-200 rounded-lg bg-white"
      >
        {gradients}

        {/* Grid lines */}
        <g className="opacity-30">
          {Array.from({ length: 6 }, (_, i) => {
            const y = padding.top + (chartHeight / 5) * i;
            return (
              <line
                key={`grid-${i}`}
                x1={padding.left}
                y1={y}
                x2={dimensions.width - padding.right}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
            );
          })}
        </g>

        {/* Y-axis labels */}
        <g className="fill-slate-600 text-xs">
          {Array.from({ length: 6 }, (_, i) => {
            const value = maxValue - (maxValue / 5) * i;
            const y = padding.top + (chartHeight / 5) * i;
            return (
              <text
                key={`label-${i}`}
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                className="select-none"
              >
                ₱{(value / 1000).toFixed(0)}K
              </text>
            );
          })}
        </g>

        {/* X-axis labels */}
        <g className="fill-slate-600 text-xs">
          {data.map((point, index) => {
            if (index % Math.ceil(data.length / 6) === 0) {
              const x = padding.left + xScale(index);
              return (
                <text
                  key={`x-label-${index}`}
                  x={x}
                  y={dimensions.height - 10}
                  textAnchor="middle"
                  className="select-none"
                >
                  {point.date}
                </text>
              );
            }
            return null;
          })}
        </g>

        {/* Area fills */}
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          {/* Revenue area */}
          <motion.path
            d={`${revenuePath} L ${padding.left + xScale(data.length - 1)} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`}
            fill="url(#revenueGradient)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />

          {/* Expenses area */}
          <motion.path
            d={`${expensesPath} L ${padding.left + xScale(data.length - 1)} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`}
            fill="url(#expensesGradient)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: "easeInOut", delay: 0.2 }}
          />
        </motion.g>

        {/* Lines */}
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          {/* Revenue line */}
          <motion.path
            d={revenuePath}
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
          />

          {/* Expenses line */}
          <motion.path
            d={expensesPath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: "easeInOut", delay: 0.3 }}
          />
        </motion.g>

        {/* Data points */}
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          {data.map((point, index) => {
            const x = padding.left + xScale(index);
            const revenueY = padding.top + yScale(point.revenue);
            const expensesY = padding.top + yScale(point.expenses);

            return (
              <g key={`points-${index}`}>
                {/* Revenue point */}
                <motion.circle
                  cx={x}
                  cy={revenueY}
                  r="0"
                  fill="#10b981"
                  stroke="white"
                  strokeWidth="2"
                  className="cursor-pointer hover:r-6"
                  onMouseEnter={(e) => setTooltip({ x, y: revenueY, point, type: 'revenue' })}
                  onMouseLeave={() => setTooltip(null)}
                  animate={{ r: 4 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                />

                {/* Expenses point */}
                <motion.circle
                  cx={x}
                  cy={expensesY}
                  r="0"
                  fill="#f59e0b"
                  stroke="white"
                  strokeWidth="2"
                  className="cursor-pointer hover:r-6"
                  onMouseEnter={(e) => setTooltip({ x, y: expensesY, point, type: 'expenses' })}
                  onMouseLeave={() => setTooltip(null)}
                  animate={{ r: 4 }}
                  transition={{ duration: 0.3, delay: index * 0.05 + 0.1 }}
                />
              </g>
            );
          })}
        </motion.g>

        {/* Legend */}
        <g className="text-sm">
          {/* Revenue legend */}
          <rect
            x={dimensions.width - 150}
            y={20}
            width="15"
            height="3"
            fill="#10b981"
          />
          <text
            x={dimensions.width - 130}
            y={25}
            fill="#374151"
            className="select-none"
          >
            Revenue
          </text>

          {/* Expenses legend */}
          <rect
            x={dimensions.width - 150}
            y={35}
            width="15"
            height="3"
            fill="#f59e0b"
          />
          <text
            x={dimensions.width - 130}
            y={40}
            fill="#374151"
            className="select-none"
          >
            Expenses
          </text>
        </g>
      </svg>

      {/* Tooltip */}
      <AnimatePresence>
        {tooltip && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg pointer-events-none z-10"
            style={{
              left: tooltip.x - 40,
              top: tooltip.y - 60,
            }}
          >
            <div className="text-xs font-semibold">{tooltip.point.date}</div>
            <div className={`text-sm ${tooltip.type === 'revenue' ? 'text-green-400' : 'text-amber-400'}`}>
              {tooltip.type === 'revenue' ? 'Revenue' : 'Expenses'}: 
              ₱{tooltip.point[tooltip.type].toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </div>
            <div className="absolute w-2 h-2 bg-slate-900 rotate-45 -bottom-1 left-1/2 -translate-x-1/2"></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
