import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/cn';

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className, children, ...props }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-transparent shadow-xs dark:shadow-none">
    <table className={cn('w-full', className)} {...props}>
      {children}
    </table>
  </div>
);

export const TableHead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, children, ...props }) => (
  <thead {...props}>
    <tr className={cn('border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5', className)}>
      {children}
    </tr>
  </thead>
);

export const TableHeaderCell: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className, children, ...props }) => (
  <th className={cn('table-header', className)} {...props}>
    {children}
  </th>
);

interface TableRowProps extends Omit<React.ComponentProps<typeof motion.tr>, 'children'> {
  /** Stagger this row's entrance by index — pass only for the first page/screen of rows. */
  index?: number;
  selected?: boolean;
  children?: React.ReactNode;
}

export const TableRow: React.FC<TableRowProps> = ({ className, children, index, selected, ...props }) => (
  <motion.tr
    initial={index !== undefined ? { opacity: 0 } : undefined}
    animate={index !== undefined ? { opacity: 1 } : undefined}
    transition={index !== undefined ? { duration: 0.15, delay: Math.min(index, 12) * 0.02 } : undefined}
    className={cn(
      'border-b border-slate-100 dark:border-white/5 transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-white/5',
      selected && 'bg-primary-50 dark:bg-primary-500/10',
      className
    )}
    {...props}
  >
    {children}
  </motion.tr>
);

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className, children, ...props }) => (
  <td className={cn('table-cell', className)} {...props}>
    {children}
  </td>
);
