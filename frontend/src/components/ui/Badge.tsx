import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/cn';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps extends Omit<HTMLMotionProps<'span'>, 'children'> {
  variant?: BadgeVariant;
  /** Animate in/out when the badge's key changes (e.g. status transitions). Pass a stable key via `motionKey`. */
  motionKey?: string;
  children?: React.ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
  neutral: 'badge-neutral',
};

export const Badge: React.FC<BadgeProps> = ({ variant = 'neutral', motionKey, className, children, ...props }) => {
  return (
    <motion.span
      key={motionKey}
      layout
      initial={motionKey ? { opacity: 0, scale: 0.9 } : undefined}
      animate={motionKey ? { opacity: 1, scale: 1 } : undefined}
      transition={{ duration: 0.15 }}
      className={cn(VARIANT_CLASSES[variant], className)}
      {...props}
    >
      {children}
    </motion.span>
  );
};
