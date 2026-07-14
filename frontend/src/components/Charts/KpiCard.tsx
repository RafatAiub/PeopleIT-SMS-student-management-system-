import React, { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  trend: 'up' | 'down';
  trendValue: string;
  icon: React.ReactNode;
  color: 'indigo' | 'teal' | 'amber' | 'rose';
  prefix?: string;
  suffix?: string;
}

const COLOR_MAP = {
  indigo: {
    iconBg: 'bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    trendUp: 'text-teal-600 dark:text-teal-400',
    trendDown: 'text-red-600 dark:text-red-400',
    glow: '0 4px 20px rgba(79,70,229,0.15)',
    accent: '#4F46E5',
  },
  teal: {
    iconBg: 'bg-teal-50 dark:bg-teal-500/20 border-teal-200 dark:border-teal-500/30',
    iconColor: 'text-teal-600 dark:text-teal-400',
    trendUp: 'text-teal-600 dark:text-teal-400',
    trendDown: 'text-red-600 dark:text-red-400',
    glow: '0 4px 20px rgba(13,148,136,0.15)',
    accent: '#0D9488',
  },
  amber: {
    iconBg: 'bg-amber-50 dark:bg-amber-500/20 border-amber-200 dark:border-amber-500/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    trendUp: 'text-teal-600 dark:text-teal-400',
    trendDown: 'text-red-600 dark:text-red-400',
    glow: '0 4px 20px rgba(245,158,11,0.15)',
    accent: '#F59E0B',
  },
  rose: {
    iconBg: 'bg-rose-50 dark:bg-rose-500/20 border-rose-200 dark:border-rose-500/30',
    iconColor: 'text-rose-600 dark:text-rose-400',
    trendUp: 'text-teal-600 dark:text-teal-400',
    trendDown: 'text-red-600 dark:text-red-400',
    glow: '0 4px 20px rgba(244,63,94,0.15)',
    accent: '#F43F5E',
  },
};

function useAnimatedCounter(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  trend,
  trendValue,
  icon,
  color,
  prefix = '',
  suffix = '',
}) => {
  const styles = COLOR_MAP[color];
  const numericValue = typeof value === 'number' ? value : parseInt(String(value).replace(/[^0-9]/g, ''), 10) || 0;
  const animated = useAnimatedCounter(numericValue);
  const displayValue = typeof value === 'number'
    ? animated.toLocaleString('en-BD')
    : String(value);
  const isNumeric = typeof value === 'number';

  return (
    <div
      className="glass-card-hover p-5 cursor-default"
      style={{ boxShadow: styles.glow }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${styles.iconBg}`}>
          <div className={styles.iconColor}>{icon}</div>
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
          trend === 'up' ? 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400' : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
        }`}>
          {trend === 'up'
            ? <TrendingUp className="w-3 h-3" />
            : <TrendingDown className="w-3 h-3" />}
          {trendValue}
        </div>
      </div>

      <div className="mb-1">
        <span className="text-2xl font-bold text-slate-900 dark:text-white">
          {prefix}{isNumeric ? animated.toLocaleString('en-BD') : displayValue}{suffix}
        </span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">{title}</p>

      {/* Mini sparkline bar */}
      <div className="mt-4 h-1 rounded-full bg-slate-200 dark:bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${Math.min(100, (numericValue / (numericValue * 1.2)) * 100)}%`,
            background: `linear-gradient(90deg, ${styles.accent}, ${styles.accent}88)`,
          }}
        />
      </div>
    </div>
  );
};

