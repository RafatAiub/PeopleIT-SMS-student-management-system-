import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/cn';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'ref' | 'children'> {
  interactive?: boolean;
  /** Animate a fade+rise entrance when the card mounts (e.g. KPI cards on dashboard load). */
  animateIn?: boolean;
  children?: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, animateIn = false, className, children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={animateIn ? { opacity: 0, y: 8 } : undefined}
        animate={animateIn ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        whileHover={interactive ? { y: -2 } : undefined}
        className={cn(interactive ? 'glass-card-hover' : 'glass-card', className)}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

Card.displayName = 'Card';
