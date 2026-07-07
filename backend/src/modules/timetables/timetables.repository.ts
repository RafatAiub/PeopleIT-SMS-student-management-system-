import { prisma } from '../../config/prisma';
import type {
  CreateTimetableSlotDtoType,
  UpdateTimetableSlotDtoType,
  TimetableSlotQueryDtoType,
} from './timetables.dto';

export async function create(institutionId: string, data: CreateTimetableSlotDtoType) {
  const { teacherUserId, ...restData } = data;
  return prisma.timetableSlot.create({
    data: {
      ...restData,
      institutionId,
    },
    include: {
      teacher: {
        select: {
          id: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });
}

export async function update(
  institutionId: string,
  id: string,
  data: UpdateTimetableSlotDtoType,
) {
  const { teacherUserId, ...restData } = data;
  return prisma.timetableSlot.update({
    where: { id },
    data: restData,
    include: {
      teacher: {
        select: {
          id: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });
}

export async function findById(institutionId: string, id: string) {
  return prisma.timetableSlot.findFirst({
    where: { id, institutionId },
    include: {
      teacher: {
        select: {
          id: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });
}

export async function findAll(institutionId: string, query: TimetableSlotQueryDtoType) {
  const { page, pageSize, branchId, dayOfWeek, className, sectionName, teacherId, teacherUserId, studentUserId, subject } = query;
  const skip = (page - 1) * pageSize;

  let resolvedClassName = className;
  let resolvedSectionName = sectionName;

  if (studentUserId) {
    const student = await prisma.student.findUnique({
      where: { userId: studentUserId },
      include: { class: true, section: true },
    });
    if (student) {
      if (student.class?.name) resolvedClassName = student.class.name;
      if (student.section?.name) resolvedSectionName = student.section.name;
    }
  }

  const where: any = {
    institutionId,
    ...(branchId ? { branchId } : {}),
    ...(dayOfWeek ? { dayOfWeek } : {}),
    ...(resolvedClassName ? { className: { contains: resolvedClassName, mode: 'insensitive' as const } } : {}),
    ...(resolvedSectionName ? { sectionName: { contains: resolvedSectionName, mode: 'insensitive' as const } } : {}),
    ...(teacherId ? { teacherId } : {}),
    ...(teacherUserId ? { teacher: { userId: teacherUserId } } : {}),
    ...(subject ? { subject: { contains: subject, mode: 'insensitive' as const } } : {}),
  };

  const [slots, total] = await prisma.$transaction([
    prisma.timetableSlot.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        teacher: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      skip,
      take: pageSize,
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
      ],
    }),
    prisma.timetableSlot.count({ where }),
  ]);

  return { slots, total };
}

export async function remove(institutionId: string, id: string) {
  return prisma.timetableSlot.deleteMany({
    where: { id, institutionId },
  });
}
