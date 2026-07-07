import * as noticesRepository from './notices.repository';
import { NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type {
  CreateNoticeDtoType,
  UpdateNoticeDtoType,
  NoticeQueryDtoType,
} from './notices.dto';

export async function createNotice(institutionId: string, data: CreateNoticeDtoType) {
  const notice = await noticesRepository.create(institutionId, data);
  logger.info('Notice created', { noticeId: notice.id, institutionId });
  return notice;
}

export async function updateNotice(
  institutionId: string,
  id: string,
  data: UpdateNoticeDtoType,
) {
  const existing = await noticesRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Notice with ID '${id}' not found`);
  }

  const updated = await noticesRepository.update(institutionId, id, data);
  logger.info('Notice updated', { noticeId: id, institutionId });
  return updated;
}

export async function getNotice(institutionId: string, id: string) {
  const notice = await noticesRepository.findById(institutionId, id);
  if (!notice) {
    throw new NotFoundError(`Notice with ID '${id}' not found`);
  }
  return notice;
}

export async function listNotices(institutionId: string, query: NoticeQueryDtoType) {
  return noticesRepository.findAll(institutionId, query);
}

export async function deleteNotice(institutionId: string, id: string) {
  const existing = await noticesRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Notice with ID '${id}' not found`);
  }
  await noticesRepository.remove(institutionId, id);
  logger.info('Notice deleted', { noticeId: id, institutionId });
}
