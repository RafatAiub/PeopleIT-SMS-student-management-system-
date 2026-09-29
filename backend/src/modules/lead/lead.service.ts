import { logger } from '../../utils/logger';
import { NotFoundError } from '../../utils/AppError';
import { notifySafe } from '../notifications/notifications.service';
import { findSuperAdminUserIds } from '../billing/billing.repository';
import { getPlatformInstitutionId } from '../../config/platformInstitution';
import * as leadRepository from './lead.repository';
import type { SubmitLeadDtoType, UpdateLeadDtoType } from './lead.dto';

export async function submitLead(data: SubmitLeadDtoType) {
  if (data.website) {
    // Honeypot tripped: pretend success to the bot (no 4xx that would tell it
    // which field gave it away), but create nothing and notify no one.
    logger.info('Lead submission blocked by honeypot field');
    return null;
  }

  const lead = await leadRepository.create(data);

  // Notification is a side effect of a successful capture, not part of the
  // capture itself — a broken notify path must never fail the public POST.
  try {
    const [institutionId, recipientUserIds] = await Promise.all([
      getPlatformInstitutionId(),
      findSuperAdminUserIds(),
    ]);

    notifySafe({
      institutionId,
      type: 'LEAD_SUBMITTED',
      recipientUserIds,
      contextId: lead.id,
      data: { link: '/super-admin/leads' },
      vars: {
        leadName: lead.name,
        leadPhone: lead.phone,
        leadEmail: lead.email || 'Not provided',
        institutionName: lead.institutionName || 'Not specified',
        source: lead.source || 'Direct',
      },
    });
  } catch (error) {
    logger.error('Failed to prepare LEAD_SUBMITTED notification', {
      leadId: lead.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return lead;
}

export async function listLeads(status?: string) {
  return leadRepository.list(status);
}

export async function getLead(id: string) {
  const lead = await leadRepository.findById(id);
  if (!lead) {
    throw new NotFoundError(`Lead with ID '${id}' not found`);
  }
  return lead;
}

export async function updateLead(id: string, data: UpdateLeadDtoType) {
  const existing = await leadRepository.findById(id);
  if (!existing) {
    throw new NotFoundError(`Lead with ID '${id}' not found`);
  }
  return leadRepository.update(id, data);
}
