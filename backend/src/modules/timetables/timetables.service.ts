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

  // Check for scheduling conflicts. Exclusive boundaries (lt/gt) so
  // back-to-back periods (e.g. 09:00-10:00 then 10:00-11:00) never
  // false-positive as overlapping.
  if (data.teacherId) {
    const teacherConflict = await prisma.timetableSlot.findFirst({
      where: {
        institutionId,
        teacherId: data.teacherId,
        dayOfWeek: data.dayOfWeek,
        startTime: { lt: data.endTime },
        endTime: { gt: data.startTime },
      },
    });
    if (teacherConflict) {
      throw new BadRequestError(
        `Teacher schedule conflict: already assigned to ${teacherConflict.className}-${teacherConflict.sectionName} (${teacherConflict.startTime}-${teacherConflict.endTime}) on ${data.dayOfWeek}`,
      );
    }
  }

  const sectionConflict = await prisma.timetableSlot.findFirst({
    where: {
      institutionId,
      className: data.className,
      sectionName: data.sectionName,
      dayOfWeek: data.dayOfWeek,
      startTime: { lt: data.endTime },
      endTime: { gt: data.startTime },
    },
  });
  if (sectionConflict) {
    throw new BadRequestError(
      `Section schedule conflict: ${data.className}-${data.sectionName} already has ${sectionConflict.subject} (${sectionConflict.startTime}-${sectionConflict.endTime}) on ${data.dayOfWeek}`,
    );
  }

  if (data.roomNumber) {
    const roomConflict = await prisma.timetableSlot.findFirst({
      where: {
        institutionId,
        roomNumber: data.roomNumber,
        dayOfWeek: data.dayOfWeek,
        startTime: { lt: data.endTime },
        endTime: { gt: data.startTime },
      },
    });
    if (roomConflict) {
      throw new BadRequestError(
        `Room schedule conflict: room '${data.roomNumber}' already occupied by ${roomConflict.className}-${roomConflict.sectionName} (${roomConflict.startTime}-${roomConflict.endTime}) on ${data.dayOfWeek}`,
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

  const dayOfWeek = data.dayOfWeek || existing.dayOfWeek;
  const startTime = data.startTime || existing.startTime;
  const endTime = data.endTime || existing.endTime;
  const className = data.className || existing.className;
  const sectionName = data.sectionName || existing.sectionName;
  const roomNumber = data.roomNumber !== undefined ? data.roomNumber : existing.roomNumber;
  const teacherId = data.teacherId !== undefined ? data.teacherId : existing.teacherId;

  if (teacherId) {
    const teacherConflict = await prisma.timetableSlot.findFirst({
      where: {
        institutionId,
        id: { not: id },
        teacherId,
        dayOfWeek,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (teacherConflict) {
      throw new BadRequestError(
        `Teacher schedule conflict: already assigned to ${teacherConflict.className}-${teacherConflict.sectionName} (${teacherConflict.startTime}-${teacherConflict.endTime}) on ${dayOfWeek}`,
      );
    }
  }

  const sectionConflict = await prisma.timetableSlot.findFirst({
    where: {
      institutionId,
      id: { not: id },
      className,
      sectionName,
      dayOfWeek,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });
  if (sectionConflict) {
    throw new BadRequestError(
      `Section schedule conflict: ${className}-${sectionName} already has ${sectionConflict.subject} (${sectionConflict.startTime}-${sectionConflict.endTime}) on ${dayOfWeek}`,
    );
  }

  if (roomNumber) {
    const roomConflict = await prisma.timetableSlot.findFirst({
      where: {
        institutionId,
        id: { not: id },
        roomNumber,
        dayOfWeek,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (roomConflict) {
      throw new BadRequestError(
        `Room schedule conflict: room '${roomNumber}' already occupied by ${roomConflict.className}-${roomConflict.sectionName} (${roomConflict.startTime}-${roomConflict.endTime}) on ${dayOfWeek}`,
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
