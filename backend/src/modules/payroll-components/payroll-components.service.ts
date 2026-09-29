import { BadRequestError, NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as repo from './payroll-components.repository';
import { computePayrollBreakdown, toComponentInput, type ComponentInput } from './payroll.logic';
import type {
  AssignComponentsDtoType,
  ComponentQueryDtoType,
  CreateComponentDtoType,
  UpdateComponentDtoType,
} from './payroll-components.dto';

function mapComponent(c: { value: unknown; _count?: { staffOverrides: number } } & Record<string, unknown>) {
  const { _count, ...rest } = c;
  return { ...rest, value: Number(c.value), assignedCount: _count?.staffOverrides ?? undefined };
}

export async function list(institutionId: string, q: ComponentQueryDtoType) {
  const { items, total } = await repo.list(institutionId, {
    activeOnly: q.activeOnly,
    skip: (q.page - 1) * q.pageSize,
    take: q.pageSize,
  });
  return { items: items.map(mapComponent), meta: { total, page: q.page, pageSize: q.pageSize } };
}

export async function create(institutionId: string, data: CreateComponentDtoType) {
  const c = await repo.create(institutionId, data);
  logger.info('Salary component created', { institutionId, id: c.id });
  return mapComponent(c);
}

export async function update(institutionId: string, id: string, data: UpdateComponentDtoType) {
  const existing = await repo.findById(institutionId, id);
  if (!existing) throw new NotFoundError('Salary component not found');
  const calcType = data.calcType ?? existing.calcType;
  const value = data.value ?? Number(existing.value);
  if (calcType === 'PERCENT_OF_BASE' && value > 100) throw new BadRequestError('A percentage cannot exceed 100');
  const updated = await repo.update(institutionId, id, data);
  return mapComponent(updated!);
}

export async function remove(institutionId: string, id: string) {
  const existing = await repo.findById(institutionId, id);
  if (!existing) throw new NotFoundError('Salary component not found');
  // Processed payslips keep their own copy in PayrollRecord.breakdown, so
  // deleting a component never alters historic payroll.
  await repo.remove(institutionId, id);
  return { id };
}

export async function getStaffComponents(institutionId: string, staffId: string) {
  const staff = await repo.findStaff(institutionId, staffId);
  if (!staff) throw new NotFoundError('Staff profile not found');
  const assignments = await repo.findAssignments(institutionId, staffId);
  const inputs = assignments
    .map((a) =>
      toComponentInput({
        overrideValue: a.overrideValue === null ? null : Number(a.overrideValue),
        component: { ...a.component, value: Number(a.component.value) },
      }),
    )
    .filter((x): x is ComponentInput => x !== null);
  return {
    staffId,
    staffName: `${staff.user.firstName} ${staff.user.lastName}`.trim(),
    baseSalary: Number(staff.baseSalary),
    assignments: assignments.map((a) => ({
      id: a.id,
      componentId: a.componentId,
      overrideValue: a.overrideValue === null ? null : Number(a.overrideValue),
      component: mapComponent(a.component),
    })),
    preview: computePayrollBreakdown(Number(staff.baseSalary), inputs),
  };
}

export async function assignStaffComponents(institutionId: string, staffId: string, dto: AssignComponentsDtoType) {
  const staff = await repo.findStaff(institutionId, staffId);
  if (!staff) throw new NotFoundError('Staff profile not found');
  const ids = [...new Set(dto.components.map((c) => c.componentId))];
  if (ids.length !== dto.components.length) throw new BadRequestError('A component can only be assigned once');
  if (ids.length) {
    const found = await repo.countComponentsInTenant(institutionId, ids);
    if (found !== ids.length) throw new BadRequestError('Some components are invalid or belong to another institution');
  }
  await repo.replaceAssignments(
    institutionId,
    staffId,
    dto.components.map((c) => ({ componentId: c.componentId, overrideValue: c.overrideValue ?? null })),
  );
  logger.info('Staff salary components assigned', { institutionId, staffId, count: ids.length });
  return getStaffComponents(institutionId, staffId);
}
