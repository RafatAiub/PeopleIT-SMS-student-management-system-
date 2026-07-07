import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface DonutDataItem {
  name: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutDataItem[];
  title?: string;
  centerLabel?: string;
  centerValue?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: DonutDataItem }>;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (active && payload && payload.length > 0) {
    const item = payload[0];
    return (
      <div className="glass-card px-3 py-2 text-sm">
        <p className="text-slate-300 font-medium">{item.name}</p>
        <p className="text-white font-bold">{item.value}%</p>
      </div>
    );
  }
  return null;
};

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  title,
  centerLabel,
  centerValue,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {title && <h3 className="text-sm font-semibold text-slate-300">{title}</h3>}
      <div className="relative" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {centerValue && (
              <span className="text-2xl font-bold text-white">{centerValue}</span>
            )}
            {centerLabel && (
              <span className="text-xs text-slate-400">{centerLabel}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3 justify-center">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-slate-400">{item.name}</span>
            <span className="text-xs font-semibold text-white">{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};
