import { formatCurrency } from '@/i18n';
import type { SalaryComponent } from './hr.types';

export function describeValue(c: Pick<SalaryComponent, 'calcType' | 'value'>) {
  return c.calcType === 'PERCENT_OF_BASE' ? `${c.value}% of base` : formatCurrency(c.value);
}
