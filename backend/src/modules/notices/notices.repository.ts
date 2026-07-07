import { prisma } from '../../config/prisma';
import type {
  CreateNoticeDtoType,
  UpdateNoticeDtoType,
  NoticeQueryDtoType,
} from './notices.dto';

export async function create(institutionId: string, data: CreateNoticeDtoType) {
  return prisma.notice.create({
    data: {
      ...data,
      institutionId,
    },
  });
}

export async function update(
  institutionId: string,
  id: string,
  data: UpdateNoticeDtoType,
) {
  return prisma.notice.update({
    where: { id },
    data,
  });
}

export async function findById(institutionId: string, id: string) {
  return prisma.notice.findFirst({
    where: { id, institutionId },
  });
}

export async function findAll(institutionId: string, query: NoticeQueryDtoType) {
  const { page, pageSize, search, audience, isActive } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(audience ? { audience } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { content: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [notices, total] = await prisma.$transaction([
    prisma.notice.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { publishedAt: 'desc' },
    }),
    prisma.notice.count({ where }),
  ]);

  return { notices, total };
}

export async function remove(institutionId: string, id: string) {
  return prisma.notice.deleteMany({
    where: { id, institutionId },
  });
}
