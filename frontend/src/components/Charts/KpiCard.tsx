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
    iconBg: 'bg-primary-50 dark:bg-primary-500/20 border-primary-100 dark:border-primary-500/30',
    iconColor: 'text-primary-600 dark:text-primary-400',
    trendUp: 'text-accent-600 dark:text-accent-400',
    trendDown: 'text-red-600 dark:text-red-400',
  },
  teal: {
    iconBg: 'bg-accent-50 dark:bg-accent-500/20 border-accent-100 dark:border-accent-500/30',
    iconColor: 'text-accent-600 dark:text-accent-400',
    trendUp: 'text-accent-600 dark:text-accent-400',
    trendDown: 'text-red-600 dark:text-red-400',
  },
  amber: {
    iconBg: 'bg-amber-50 dark:bg-amber-500/20 border-amber-100 dark:border-amber-500/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    trendUp: 'text-accent-600 dark:text-accent-400',
    trendDown: 'text-red-600 dark:text-red-400',
  },
  rose: {
    iconBg: 'bg-rose-50 dark:bg-rose-500/20 border-rose-100 dark:border-rose-500/30',
    iconColor: 'text-rose-600 dark:text-rose-400',
    trendUp: 'text-accent-600 dark:text-accent-400',
    trendDown: 'text-red-600 dark:text-red-400',
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
    <div className="glass-card-hover p-5 cursor-default flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center flex-shrink-0 ${styles.iconBg}`}>
        <div className={styles.iconColor}>{icon}</div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{title}</p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-2xl font-bold text-slate-900 dark:text-white">
            {prefix}{isNumeric ? animated.toLocaleString('en-BD') : displayValue}{suffix}
          </span>
          <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${
            trend === 'up' ? styles.trendUp : styles.trendDown
          }`}>
            {trend === 'up'
              ? <TrendingUp className="w-3 h-3" />
              : <TrendingDown className="w-3 h-3" />}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{trendValue}</p>
      </div>
    </div>
  );
};

