import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

interface LineChartDataItem {
  [key: string]: string | number;
}

interface LineConfig {
  key: string;
  color: string;
  label: string;
}

interface LineChartProps {
  data: LineChartDataItem[];
  xKey: string;
  lines: LineConfig[];
  title?: string;
  formatValue?: (val: number) => string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  formatValue?: (val: number) => string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label, formatValue }) => {
  if (active && payload && payload.length > 0) {
    return (
      <div className="glass-card px-3 py-2 text-sm">
        <p className="text-slate-400 text-xs mb-2">{label}</p>
        {payload.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-slate-300">{item.name}:</span>
            <span className="text-white font-bold">
              {formatValue ? formatValue(item.value) : item.value}%
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const LineChart: React.FC<LineChartProps> = ({
  data,
  xKey,
  lines,
  title,
  formatValue,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {title && <h3 className="text-sm font-semibold text-slate-300">{title}</h3>}
      <ResponsiveContainer width="100%" height={200}>
        <RechartsLineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey={xKey}
            tick={{ fill: '#64748B', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#64748B', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            domain={[0, 100]}
          />
          <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              stroke={line.color}
              strokeWidth={2}
              dot={{ fill: line.color, r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, strokeWidth: 0 }}
              name={line.label}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
};
