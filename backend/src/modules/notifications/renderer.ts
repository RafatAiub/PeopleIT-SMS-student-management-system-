import { NotificationChannel } from '@prisma/client';
import { BadRequestError } from '../../utils/AppError';
import { NotificationType } from './notifications.dto';
import { DEFAULT_TEMPLATES, defaultTemplateKey } from './templates.defaults';
import * as notificationRepository from './notifications.repository';

export interface RenderedMessage {
  subject?: string;
  body: string;
}

export type TemplateVars = Record<string, string | number | null | undefined>;

/**
 * Substitutes `{{var}}` placeholders only — deliberately not a template engine.
 * Any value coming from the database (student names, teacher comments, notes)
 * is untrusted text, so control characters are stripped before they can reach
 * an email header or an SMS payload.
 */
export function interpolate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null) return '';
    // eslint-disable-next-line no-control-regex
    return String(value).replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  });
}

/**
 * Resolves the template for (type, channel) and renders it.
 *
 * Resolution order is tenant override -> bundled default, so an institution
 * that has customised nothing still gets working copy, and one that has
 * customised a single channel does not have to redefine the rest.
 */
export async function renderTemplate(
  institutionId: string,
  type: NotificationType,
  channel: string,
  vars: TemplateVars,
): Promise<RenderedMessage> {
  const override = await notificationRepository.findTemplate(
    institutionId,
    type,
    channel as NotificationChannel,
  );

  const template = override ?? DEFAULT_TEMPLATES[defaultTemplateKey(type, channel)];

  if (!template) {
    throw new BadRequestError(`No notification template registered for ${type}/${channel}`);
  }

  return {
    subject: template.subject ? interpolate(template.subject, vars) : undefined,
    body: interpolate(template.body, vars),
  };
}
