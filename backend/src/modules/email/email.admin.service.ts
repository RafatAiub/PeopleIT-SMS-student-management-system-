import { EmailPriority } from '@prisma/client';
import { env } from '../../config/env';
import { BadRequestError, NotFoundError } from '../../utils/AppError';
import { budgetSnapshot } from './budget';
import { currentTransportMode } from './transport';
import * as repo from './repository';
import * as suppressionApi from './suppression';
import { sendEmail } from './sender';
import { EMAIL_TEMPLATE_REGISTRY, findTemplate } from './templates/registry';
import type { AddSuppressionDtoType, RemoveSuppressionDtoType, SuppressionQueryDtoType } from './email.admin.dto';

// =============================================================================
// SUPER_ADMIN-only email operations console — status, delivery log,
// suppression management, test send, template preview gallery.
// =============================================================================

export async function getStatus() {
  const [budget, suppressionCount] = await Promise.all([
    budgetSnapshot(),
    suppressionApi.listSuppressed({ page: 1, pageSize: 1 }).then((r) => r.total),
  ]);
  return {
    mode: currentTransportMode(),
    fromAddress: env.EMAIL_FROM,
    fromName: env.EMAIL_FROM_NAME ?? null,
    replyTo: env.EMAIL_REPLY_TO ?? null,
    budget,
    suppressionCount,
  };
}

export async function listLogs(params: { page: number; pageSize: number }) {
  const [items, total] = await repo.listLogsPaginated(params);
  return { items, total };
}

export async function listSuppressions(query: SuppressionQueryDtoType) {
  return suppressionApi.listSuppressed(query);
}

export async function addSuppression(data: AddSuppressionDtoType) {
  return suppressionApi.suppress({ email: data.email, scope: data.scope, reason: data.reason, source: 'admin', note: data.note ?? null });
}

export async function removeSuppression(data: RemoveSuppressionDtoType) {
  const result = await suppressionApi.unsuppress(data.email, data.scope);
  return { removed: result.count };
}

export async function testSend(to: string) {
  const result = await sendEmail({
    to,
    subject: 'PeopleNIT SMS — test email',
    html: '<p style="font-family:sans-serif;">This is a test email from the PeopleNIT SMS email admin console. If you received this, outbound email is working.</p>',
    text: 'This is a test email from the PeopleNIT SMS email admin console. If you received this, outbound email is working.',
    template: 'admin.test-send',
    priority: EmailPriority.P1_TRANSACTIONAL,
  });
  return result;
}

export function listTemplates() {
  return EMAIL_TEMPLATE_REGISTRY.map((t) => ({ key: t.key, description: t.description }));
}

export function previewTemplate(key: string) {
  const template = findTemplate(key);
  if (!template) throw new NotFoundError(`Unknown template "${key}"`);
  try {
    return template.render();
  } catch (error) {
    throw new BadRequestError(`Failed to render template "${key}": ${error instanceof Error ? error.message : String(error)}`);
  }
}
