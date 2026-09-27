import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const slotSelect = {
  id: true,
  examId: true,
  className: true,
  sectionName: true,
  subjectName: true,
  date: true,
  startTime: true,
  endTime: true,
  room: true,
  createdAt: true,
  exam: { select: { id: true, name: true, startDate: true, endDate: true } },
} satisfies Prisma.ExamTimetableSlotSelect;

export async function findSlots(where: Prisma.ExamTimetableSlotWhereInput, page: number, pageSize: number) {
  const [items, total] = await prisma.$transaction([
    prisma.examTimetableSlot.findMany({
      where,
      select: slotSelect,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { className: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.examTimetableSlot.count({ where }),
  ]);
  return { items, total };
}

export async function findSlotById(institutionId: string, id: string) {
  return prisma.examTimetableSlot.findFirst({ where: { id, institutionId }, select: slotSelect });
}

export async function findSlotsOnDate(institutionId: string, date: Date) {
  return prisma.examTimetableSlot.findMany({
    where: { institutionId, date },
    select: { id: true, examId: true, className: true, sectionName: true, subjectName: true, date: true, startTime: true, endTime: true, room: true },
  });
}

export async function createSlot(data: Prisma.ExamTimetableSlotUncheckedCreateInput) {
  return prisma.examTimetableSlot.create({ data, select: slotSelect });
}

export async function updateSlot(institutionId: string, id: string, data: Prisma.ExamTimetableSlotUncheckedUpdateManyInput) {
  await prisma.examTimetableSlot.updateMany({ where: { id, institutionId }, data });
  return findSlotById(institutionId, id);
}

export async function deleteSlot(institutionId: string, id: string) {
  return prisma.examTimetableSlot.deleteMany({ where: { id, institutionId } });
}
