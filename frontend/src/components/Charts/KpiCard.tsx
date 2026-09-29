import React, { useEffect, useState } from 'react';
import { StatCard } from '../ui/Display';
import { formatNumber } from '../../i18n';

interface KpiCardProps {
  title: string;
  value: string | number;
  /**
   * Accepted for API compatibility but no longer drawn: every call site
   * hard-coded `"up"` regardless of the data, which showed a green "rising"
   * arrow on figures that were not rising. Use <StatCard trend={…}> with a
   * computed trend instead.
   */
  trend?: 'up' | 'down';
  trendValue: string;
  icon: React.ReactNode;
  color: 'indigo' | 'teal' | 'amber' | 'rose' | 'sky';
  prefix?: string;
  suffix?: string;
}

const TONE = { indigo: 'primary', teal: 'success', amber: 'accent', rose: 'danger', sky: 'info' } as const;

function useAnimatedCounter(target: number, duration = 700) {
  const [count, setCount] = useState(target);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setCount(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setCount(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return count;
}

export const KpiCard: React.FC<KpiCardProps> = ({ title, value, trendValue, icon, color, prefix = '', suffix = '' }) => {
  const isNumeric = typeof value === 'number';
  const animated = useAnimatedCounter(isNumeric ? value : 0);
  return (
    <StatCard
      label={title}
      value={
        <>
          {prefix}
          {isNumeric ? formatNumber(animated) : value}
          {suffix}
        </>
      }
      icon={icon}
      tone={TONE[color]}
      hint={trendValue}
    />
  );
};
