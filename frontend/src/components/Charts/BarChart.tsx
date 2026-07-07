import React from 'react';
import {
  BarChart as RechartsBarChart,
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

interface BarChartDataItem {
  [key: string]: string | number;
}

interface BarChartProps {
  data: BarChartDataItem[];
  xKey: string;
  yKey: string;
  title?: string;
  color?: string;
  formatValue?: (val: number) => string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  formatValue?: (val: number) => string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label, formatValue }) => {
  if (active && payload && payload.length > 0) {
    return (
      <div className="glass-card px-3 py-2 text-sm">
        <p className="text-slate-400 text-xs mb-1">{label}</p>
        <p className="text-white font-bold">
          {formatValue ? formatValue(payload[0].value) : payload[0].value.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

export const BarChart: React.FC<BarChartProps> = ({
  data,
  xKey,
  yKey,
  title,
  color = '#4F46E5',
  formatValue,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {title && <h3 className="text-sm font-semibold text-slate-300">{title}</h3>}
      <ResponsiveContainer width="100%" height={220}>
        <RechartsBarChart data={data} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
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
            tickFormatter={(v) => formatValue ? formatValue(v) : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          />
          <Tooltip
            content={<CustomTooltip formatValue={formatValue} />}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          <Bar dataKey={yKey} radius={[6, 6, 0, 0]}>
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={index === data.length - 1 ? color : `${color}88`}
              />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
};
