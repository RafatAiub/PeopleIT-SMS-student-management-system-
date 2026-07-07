import * as timetablesRepository from './timetables.repository';
import { prisma } from '../../config/prisma';
import { NotFoundError, BadRequestError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type {
  CreateTimetableSlotDtoType,
  UpdateTimetableSlotDtoType,
  TimetableSlotQueryDtoType,
} from './timetables.dto';

export async function createSlot(institutionId: string, data: CreateTimetableSlotDtoType) {
  // Validate Branch belongs to this institution
  const branch = await prisma.branch.findFirst({
    where: { id: data.branchId, institutionId },
  });
  if (!branch) {
    throw new NotFoundError(`Branch with ID '${data.branchId}' not found under this institution`);
  }

  // Validate Teacher belongs to this institution if provided
  if (data.teacherUserId) {
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: data.teacherUserId,
        user: { institutionId },
      },
    });
    if (!teacher) {
      throw new NotFoundError(`Teacher for user ID '${data.teacherUserId}' not found under this institution`);
    }
    data.teacherId = teacher.id;
  } else if (data.teacherId) {
    const teacher = await prisma.teacher.findFirst({
      where: {
        id: data.teacherId,
        user: { institutionId },
      },
    });
    if (!teacher) {
      throw new NotFoundError(`Teacher with ID '${data.teacherId}' not found under this institution`);
    }
  }

  // Check for scheduling conflict (same teacher at same day/time slot in this institution)
  if (data.teacherId) {
    const conflict = await prisma.timetableSlot.findFirst({
      where: {
        institutionId,
        teacherId: data.teacherId,
        dayOfWeek: data.dayOfWeek,
        OR: [
          {
            startTime: { lte: data.endTime },
            endTime: { gte: data.startTime },
          },
        ],
      },
    });
    if (conflict) {
      throw new BadRequestError(
        `Teacher schedule conflict: already assigned to ${conflict.className}-${conflict.sectionName} (${conflict.startTime}-${conflict.endTime}) on ${data.dayOfWeek}`,
      );
    }
  }

  const slot = await timetablesRepository.create(institutionId, data);
  logger.info('Timetable slot created', { slotId: slot.id, institutionId });
  return slot;
}

export async function updateSlot(
  institutionId: string,
  id: string,
  data: UpdateTimetableSlotDtoType,
) {
  const existing = await timetablesRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Timetable slot with ID '${id}' not found`);
  }

  // If updating branch, validate
  if (data.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: data.branchId, institutionId },
    });
    if (!branch) {
      throw new NotFoundError(`Branch with ID '${data.branchId}' not found under this institution`);
    }
  }

  // If updating teacher, validate
  if (data.teacherUserId) {
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: data.teacherUserId,
        user: { institutionId },
      },
    });
    if (!teacher) {
      throw new NotFoundError(`Teacher for user ID '${data.teacherUserId}' not found under this institution`);
    }
    data.teacherId = teacher.id;
  } else if (data.teacherId) {
    const teacher = await prisma.teacher.findFirst({
      where: {
        id: data.teacherId,
        user: { institutionId },
      },
    });
    if (!teacher) {
      throw new NotFoundError(`Teacher with ID '${data.teacherId}' not found under this institution`);
    }
  }

  if (data.teacherId) {

    // Check for scheduling conflict
    const conflict = await prisma.timetableSlot.findFirst({
      where: {
        institutionId,
        id: { not: id },
        teacherId: data.teacherId,
        dayOfWeek: data.dayOfWeek || existing.dayOfWeek,
        OR: [
          {
            startTime: { lte: data.endTime || existing.endTime },
            endTime: { gte: data.startTime || existing.startTime },
          },
        ],
      },
    });
    if (conflict) {
      throw new BadRequestError(
        `Teacher schedule conflict: already assigned to ${conflict.className}-${conflict.sectionName} (${conflict.startTime}-${conflict.endTime}) on ${data.dayOfWeek || existing.dayOfWeek}`,
      );
    }
  }

  const updated = await timetablesRepository.update(institutionId, id, data);
  logger.info('Timetable slot updated', { slotId: id, institutionId });
  return updated;
}

export async function getSlot(institutionId: string, id: string) {
  const slot = await timetablesRepository.findById(institutionId, id);
  if (!slot) {
    throw new NotFoundError(`Timetable slot with ID '${id}' not found`);
  }
  return slot;
}

export async function listSlots(institutionId: string, query: TimetableSlotQueryDtoType) {
  return timetablesRepository.findAll(institutionId, query);
}

export async function deleteSlot(institutionId: string, id: string) {
  const existing = await timetablesRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Timetable slot with ID '${id}' not found`);
  }
  await timetablesRepository.remove(institutionId, id);
  logger.info('Timetable slot deleted', { slotId: id, institutionId });
}
