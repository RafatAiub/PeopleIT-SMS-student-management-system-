import * as transportRepository from './transport.repository';
import * as studentRepository from '../students/student.repository';
import * as guardianRepository from '../guardians/guardian.repository';
import {
  CreateVehicleInput,
  CreateRouteInput,
  CreateAssignmentInput,
  UpdateVehicleInput,
  UpdateRouteInput,
  UpdateAssignmentInput,
  StopFieldsInput,
  UpdateStopInput,
  VehicleLocationInput,
  TransportFeeInput,
} from './transport.dto';
import { AppError, NotFoundError, ConflictError, BadRequestError } from '../../utils/AppError';
import { UserRole } from '@prisma/client';
import { FeeService } from '../fees/fee.service';
import { normalizePeriod } from '../fees/bulk/bulk.keys';
import { logger } from '../../utils/logger';
import {
  existingTransportKeys,
  nextSequence,
  planTransportFees,
  resequence,
  utilisation,
  validateStopOrder,
} from './transport.logic';

export type RequestingUser = { sub: string; role: string };

export async function createVehicle(institutionId: string, data: CreateVehicleInput) {
  return transportRepository.createVehicle(institutionId, data);
}

export async function getVehicles(institutionId: string, query: any = {}) {
  return transportRepository.getVehicles(institutionId, query);
}

export async function updateVehicle(institutionId: string, vehicleId: string, data: UpdateVehicleInput) {
  const result = await transportRepository.updateVehicle(institutionId, vehicleId, data);
  if (result.count === 0) throw new NotFoundError('Vehicle not found');
  return transportRepository.findVehicleById(institutionId, vehicleId);
}

export async function deleteVehicle(institutionId: string, vehicleId: string) {
  const vehicle = await transportRepository.findVehicleById(institutionId, vehicleId);
  if (!vehicle) throw new NotFoundError('Vehicle not found');

  const assignmentCount = await transportRepository.countAssignmentsForVehicle(institutionId, vehicleId);
  if (assignmentCount > 0) {
    throw new ConflictError('This vehicle has active assignments and cannot be deleted');
  }

  const result = await transportRepository.deleteVehicle(institutionId, vehicleId);
  if (result.count === 0) throw new NotFoundError('Vehicle not found');
  return { id: vehicleId };
}

export async function createRoute(institutionId: string, data: CreateRouteInput) {
  return transportRepository.createRoute(institutionId, data);
}

export async function getRoutes(institutionId: string, query: any = {}) {
  return transportRepository.getRoutes(institutionId, query);
}

export async function updateRoute(institutionId: string, routeId: string, data: UpdateRouteInput) {
  const result = await transportRepository.updateRoute(institutionId, routeId, data);
  if (result.count === 0) throw new NotFoundError('Route not found');
  return transportRepository.findRouteById(institutionId, routeId);
}

export async function deleteRoute(institutionId: string, routeId: string) {
  const route = await transportRepository.findRouteById(institutionId, routeId);
  if (!route) throw new NotFoundError('Route not found');

  const assignmentCount = await transportRepository.countAssignmentsForRoute(institutionId, routeId);
  if (assignmentCount > 0) {
    throw new ConflictError('This route has active assignments and cannot be deleted');
  }

  const result = await transportRepository.deleteRoute(institutionId, routeId);
  if (result.count === 0) throw new NotFoundError('Route not found');
  return { id: routeId };
}

export async function createAssignment(institutionId: string, data: CreateAssignmentInput) {
  // F4: studentId, routeId, vehicleId are all client-supplied and must
  // belong to this tenant before an assignment is created linking them.
  const [student, route, vehicle] = await Promise.all([
    studentRepository.findById(institutionId, data.studentId),
    transportRepository.findRouteById(institutionId, data.routeId),
    transportRepository.findVehicleById(institutionId, data.vehicleId),
  ]);
  if (!student) throw new BadRequestError('Student not found in your institution');
  if (!route) throw new BadRequestError('Route not found in your institution');
  if (!vehicle) throw new BadRequestError('Vehicle not found in your institution');
  await assertStopOnRoute(institutionId, data.stopId, data.routeId);

  try {
    return await transportRepository.createAssignment(institutionId, data);
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new AppError('Student is already assigned to a transport route', 400);
    }
    throw new AppError(error.message || 'Failed to create assignment', 400);
  }
}

export async function getAssignments(institutionId: string, query: any = {}) {
  return transportRepository.getAssignments(institutionId, query);
}

// Self-service scoping for STUDENT/GUARDIAN callers — never trust a
// client-supplied studentId for these roles; resolve ownership server-side.
// @@unique([institutionId, studentId]) on TransportAssignment guarantees at
// most one row per student, so this never needs pagination.
export async function getMyAssignment(
  institutionId: string,
  requester: RequestingUser,
  query: { studentId?: string } = {},
) {
  if (requester.role === UserRole.STUDENT) {
    const student = await studentRepository.findByUserId(institutionId, requester.sub);
    const { assignments } = await transportRepository.getAssignments(institutionId, {
      studentId: student?.id ?? '__no-match__',
    });
    return assignments[0] ?? null;
  }

  if (requester.role === UserRole.GUARDIAN) {
    const linkedStudentIds = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, requester.sub);

    if (query.studentId) {
      if (!linkedStudentIds.includes(query.studentId)) {
        return null;
      }
      const { assignments } = await transportRepository.getAssignments(institutionId, {
        studentId: query.studentId,
      });
      return assignments[0] ?? null;
    }

    const { assignments } = await transportRepository.getAssignments(institutionId, {
      studentIdIn: linkedStudentIds.length > 0 ? linkedStudentIds : ['__no-match__'],
      pageSize: linkedStudentIds.length > 0 ? linkedStudentIds.length : 1,
    });
    return assignments;
  }

  // Non-student/guardian roles have no self-service concept here.
  return null;
}

// =============================================================================
// Wave C — stops, assignment edit/remove, vehicle location, route report,
// transport fee billing.
// =============================================================================

/** A client-supplied stopId must belong to this tenant AND to the chosen route. */
async function assertStopOnRoute(institutionId: string, stopId: string | null | undefined, routeId: string) {
  if (!stopId) return;
  const stop = await transportRepository.findStopById(institutionId, stopId);
  if (!stop) throw new BadRequestError('Stop not found in your institution');
  if (stop.routeId !== routeId) throw new BadRequestError('The selected stop is not on the selected route');
}

export async function updateAssignment(institutionId: string, assignmentId: string, data: UpdateAssignmentInput) {
  const existing = await transportRepository.findAssignmentById(institutionId, assignmentId);
  if (!existing) throw new NotFoundError('Assignment not found');

  const routeId = data.routeId ?? existing.routeId;
  if (data.routeId && data.routeId !== existing.routeId) {
    const route = await transportRepository.findRouteById(institutionId, data.routeId);
    if (!route) throw new BadRequestError('Route not found in your institution');
  }
  if (data.vehicleId && data.vehicleId !== existing.vehicleId) {
    const vehicle = await transportRepository.findVehicleById(institutionId, data.vehicleId);
    if (!vehicle) throw new BadRequestError('Vehicle not found in your institution');
  }

  // Changing route without choosing a new stop clears the old (now foreign) stop.
  let stopId = data.stopId;
  if (stopId === undefined && routeId !== existing.routeId) stopId = null;
  await assertStopOnRoute(institutionId, stopId, routeId);

  return transportRepository.updateAssignment(assignmentId, {
    ...(data.routeId !== undefined ? { routeId: data.routeId } : {}),
    ...(data.vehicleId !== undefined ? { vehicleId: data.vehicleId } : {}),
    ...(data.pickupPoint !== undefined ? { pickupPoint: data.pickupPoint } : {}),
    ...(stopId !== undefined ? { stopId } : {}),
  });
}

export async function deleteAssignment(institutionId: string, assignmentId: string) {
  const result = await transportRepository.deleteAssignment(institutionId, assignmentId);
  if (result.count === 0) throw new NotFoundError('Assignment not found');
  return { id: assignmentId };
}

// ── Stops ─────────────────────────────────────────────────────────────────
async function requireRoute(institutionId: string, routeId: string) {
  const route = await transportRepository.findRouteById(institutionId, routeId);
  if (!route) throw new NotFoundError('Route not found');
  return route;
}

export async function listStops(institutionId: string, routeId: string) {
  await requireRoute(institutionId, routeId);
  return transportRepository.listStops(institutionId, routeId);
}

export async function createStop(institutionId: string, routeId: string, data: StopFieldsInput) {
  await requireRoute(institutionId, routeId);
  const existing = await transportRepository.listStops(institutionId, routeId);
  return transportRepository.createStop({
    institutionId,
    routeId,
    name: data.name,
    sequence: nextSequence(existing),
    pickupTime: data.pickupTime ?? null,
    dropTime: data.dropTime ?? null,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
  });
}

export async function updateStop(institutionId: string, stopId: string, data: UpdateStopInput) {
  const stop = await transportRepository.findStopById(institutionId, stopId);
  if (!stop) throw new NotFoundError('Stop not found');
  return transportRepository.updateStop(stopId, {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.pickupTime !== undefined ? { pickupTime: data.pickupTime } : {}),
    ...(data.dropTime !== undefined ? { dropTime: data.dropTime } : {}),
    ...(data.lat !== undefined ? { lat: data.lat } : {}),
    ...(data.lng !== undefined ? { lng: data.lng } : {}),
  });
}

export async function deleteStop(institutionId: string, stopId: string) {
  const stop = await transportRepository.findStopById(institutionId, stopId);
  if (!stop) throw new NotFoundError('Stop not found');
  const result = await transportRepository.deleteStop(institutionId, stop);
  return { id: stopId, ...result };
}

export async function reorderStops(institutionId: string, routeId: string, stopIds: string[]) {
  await requireRoute(institutionId, routeId);
  const existing = await transportRepository.listStops(institutionId, routeId);
  const error = validateStopOrder(existing.map((s) => s.id), stopIds);
  if (error) throw new BadRequestError(error);
  return transportRepository.applyStopSequences(institutionId, routeId, resequence(stopIds));
}

// ── Vehicle location (GPS-device readiness) ───────────────────────────────
export async function updateVehicleLocation(institutionId: string, vehicleId: string, data: VehicleLocationInput) {
  const at = data.recordedAt ? new Date(data.recordedAt) : new Date();
  const result = await transportRepository.updateVehicleLocation(institutionId, vehicleId, data.lat, data.lng, at);
  if (result.count === 0) throw new NotFoundError('Vehicle not found');
  return { vehicleId, lat: data.lat, lng: data.lng, lastLocationAt: at.toISOString() };
}

export async function getLivePositions(institutionId: string) {
  const vehicles = await transportRepository.liveVehiclePositions(institutionId);
  return {
    // Positions come only from POST /vehicles/:id/location today (manual or
    // a future GPS device integration) — there is no live device feed yet.
    source: 'LAST_REPORTED',
    generatedAt: new Date().toISOString(),
    vehicles: vehicles.map((v) => ({ ...v, hasLocation: v.lastLat !== null && v.lastLng !== null })),
  };
}

// ── Route report ──────────────────────────────────────────────────────────
export async function getRouteReport(institutionId: string) {
  const [routes, vehicles, groups] = await transportRepository.routeReportData(institutionId);
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  const perVehicle = new Map<string, number>();
  for (const g of groups) perVehicle.set(g.vehicleId, (perVehicle.get(g.vehicleId) ?? 0) + g._count._all);

  const routeRows = routes.map((r) => {
    const rg = groups.filter((g) => g.routeId === r.id);
    const students = rg.reduce((s, g) => s + g._count._all, 0);
    const vehicleIds = [...new Set(rg.map((g) => g.vehicleId))];
    const capacity = vehicleIds.reduce((s, id) => s + (vehicleById.get(id)?.capacity ?? 0), 0);
    const stopCounts = new Map<string | null, number>();
    for (const g of rg) stopCounts.set(g.stopId, (stopCounts.get(g.stopId) ?? 0) + g._count._all);
    return {
      routeId: r.id,
      name: r.name,
      isActive: r.isActive,
      routeFare: Number(r.routeFare),
      students,
      monthlyFareTotal: Math.round(Number(r.routeFare) * 100 * students) / 100,
      vehicles: vehicleIds.map((id) => ({
        vehicleId: id,
        registrationNumber: vehicleById.get(id)?.registrationNumber ?? '—',
        capacity: vehicleById.get(id)?.capacity ?? 0,
        studentsOnRoute: rg.filter((g) => g.vehicleId === id).reduce((s, g) => s + g._count._all, 0),
      })),
      // Seats of the vehicles serving this route. A vehicle shared across
      // routes counts its full capacity on each — see vehicle utilisation.
      capacity,
      utilisation: utilisation(students, capacity),
      stops: [
        ...r.stopPoints.map((s) => ({ stopId: s.id, name: s.name, sequence: s.sequence, students: stopCounts.get(s.id) ?? 0 })),
        ...(stopCounts.get(null) ? [{ stopId: null, name: 'No stop selected', sequence: null, students: stopCounts.get(null) ?? 0 }] : []),
      ],
    };
  });

  const vehicleRows = vehicles.map((v) => {
    const assigned = perVehicle.get(v.id) ?? 0;
    return {
      vehicleId: v.id,
      registrationNumber: v.registrationNumber,
      isActive: v.isActive,
      capacity: v.capacity,
      assigned,
      utilisation: utilisation(assigned, v.capacity),
      overCapacity: assigned > v.capacity,
    };
  });

  const totalStudents = routeRows.reduce((s, r) => s + r.students, 0);
  const totalCapacity = vehicles.filter((v) => v.isActive).reduce((s, v) => s + v.capacity, 0);
  return {
    totals: {
      routes: routes.length,
      vehicles: vehicles.length,
      students: totalStudents,
      capacity: totalCapacity,
      utilisation: utilisation(totalStudents, totalCapacity),
    },
    routes: routeRows,
    vehicles: vehicleRows,
  };
}

// ── Transport fee billing ─────────────────────────────────────────────────
// Per-tenant in-process lock so two clicks can't bill the same month twice
// concurrently. (Single-instance guard; a second app instance could still
// race — the per-student idempotency check below still narrows that window.)
const billingInFlight = new Set<string>();

async function resolveFeeCategory(institutionId: string, feeCategoryId: string | null | undefined) {
  if (feeCategoryId) {
    const cat = await transportRepository.findFeeCategory(institutionId, feeCategoryId);
    if (!cat) throw new BadRequestError('Fee category not found in your institution');
    if (!cat.isActive) throw new BadRequestError('This fee category is inactive');
    return { category: cat, willCreate: false };
  }
  const existing = await transportRepository.findTransportFeeCategory(institutionId);
  return { category: existing, willCreate: !existing };
}

async function buildFeePlan(institutionId: string, data: TransportFeeInput) {
  if (data.routeId) await requireRoute(institutionId, data.routeId);
  const period = normalizePeriod(data.period);
  const assignments = await transportRepository.assignmentsForBilling(institutionId, data.routeId);
  const lines = await transportRepository.periodTaggedLines(
    institutionId,
    assignments.map((a) => a.studentId),
    period,
  );
  const plan = planTransportFees(
    assignments.map((a) => ({
      studentId: a.studentId,
      studentActive: a.student.status === 'ACTIVE',
      routeName: a.route.name,
      fare: Number(a.route.routeFare),
    })),
    existingTransportKeys(lines, period),
    period,
  );
  const byStudent = new Map(assignments.map((a) => [a.studentId, a]));
  return { period, plan, byStudent };
}

export async function previewTransportFees(institutionId: string, data: TransportFeeInput) {
  const [{ category, willCreate }, { period, plan, byStudent }] = await Promise.all([
    resolveFeeCategory(institutionId, data.feeCategoryId),
    buildFeePlan(institutionId, data),
  ]);
  return {
    period,
    dueDate: data.dueDate,
    feeCategory: category ? { id: category.id, name: category.name } : { id: null, name: 'Transport Fee' },
    willCreateFeeCategory: willCreate,
    totalAmount: plan.totalAmount,
    counts: plan.counts,
    rows: plan.rows.map((r) => {
      const a = byStudent.get(r.studentId);
      return {
        studentId: r.studentId,
        studentCode: a?.student.studentId ?? '',
        studentName: a ? `${a.student.firstName} ${a.student.lastName}`.trim() : '',
        routeName: r.routeName,
        stopName: a?.stop?.name ?? null,
        amount: r.amount,
        description: r.description,
        decision: r.decision,
      };
    }),
  };
}

export async function generateTransportFees(institutionId: string, data: TransportFeeInput) {
  if (billingInFlight.has(institutionId)) {
    throw new ConflictError('Transport fees are already being generated — wait for that run to finish');
  }
  billingInFlight.add(institutionId);
  try {
    const { period, plan } = await buildFeePlan(institutionId, data);
    let { category } = await resolveFeeCategory(institutionId, data.feeCategoryId);
    if (!category && plan.toBill.length > 0) {
      // Uses the existing fee service rather than writing FeeCategory directly.
      const created = await FeeService.createCategory(institutionId, {
        name: 'Transport Fee',
        description: 'Created automatically by transport fee billing',
        amount: 0,
        frequency: 'MONTHLY',
      });
      category = { id: created.id, name: created.name, isActive: created.isActive };
    }

    const created: { studentId: string; invoiceId: string; invoiceNo: string; amount: number }[] = [];
    const failed: { studentId: string; error: string }[] = [];
    for (const row of plan.toBill) {
      try {
        const invoice = await FeeService.createInvoice(institutionId, {
          studentId: row.studentId,
          dueDate: data.dueDate,
          notes: `Transport fee for ${period}`,
          items: [{ feeCategoryId: category!.id, description: row.description, amount: row.amount, discount: 0 }],
        });
        if (invoice) {
          created.push({ studentId: row.studentId, invoiceId: invoice.id, invoiceNo: invoice.invoiceNo, amount: Number(invoice.totalAmount) });
        }
      } catch (error) {
        failed.push({ studentId: row.studentId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (created.length > 0) {
      logger.info('Transport fees generated', { institutionId, period, created: created.length, failed: failed.length });
    }
    return {
      period,
      dueDate: data.dueDate,
      feeCategory: category ? { id: category.id, name: category.name } : null,
      createdCount: created.length,
      totalAmount: created.reduce((s, c) => s + Math.round(c.amount * 100), 0) / 100,
      skipped: {
        alreadyBilled: plan.counts.alreadyBilled,
        zeroFare: plan.counts.zeroFare,
        inactive: plan.counts.inactive,
      },
      created,
      failed,
    };
  } finally {
    billingInFlight.delete(institutionId);
  }
}
