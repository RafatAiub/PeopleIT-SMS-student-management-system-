import { EventAudience, EventCategory, EventType, UserRole } from '@prisma/client';
import * as eventRepository from './event.repository';
import { toDbDate, EventData } from './event.repository';
import { getDefaultSessionYear } from '../session-years/session-year.service';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { notifySafe } from '../notifications/notifications.service';
import type { CreateEventDtoType, UpdateEventDtoType, EventQueryDtoType } from './event.dto';

// Which event audience each role belongs to. Admins see every event.
const ROLE_AUDIENCE: Partial<Record<UserRole, EventAudience>> = {
  STUDENT: 'STUDENTS',
  GUARDIAN: 'GUARDIANS',
  TEACHER: 'TEACHERS',
  ACCOUNTANT: 'STAFF',
  LIBRARIAN: 'STAFF',
  TRANSPORT_OFFICER: 'STAFF',
  MANAGEMENT: 'STAFF',
};

const AUDIENCE_ROLES: Record<EventAudience, UserRole[]> = {
  STUDENTS: ['STUDENT'],
  GUARDIANS: ['GUARDIAN'],
  TEACHERS: ['TEACHER'],
  STAFF: ['ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'MANAGEMENT'],
};

function isAdmin(role: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

// undefined = no audience restriction.
export function audienceForRole(role: string): EventAudience | null | undefined {
  if (isAdmin(role)) return undefined;
  return ROLE_AUDIENCE[role as UserRole] ?? null;
}

export function rolesForAudience(audience: EventAudience[]): UserRole[] {
  return [...new Set(audience.flatMap((a) => AUDIENCE_ROLES[a]))];
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  return formatDate(new Date());
}

function humanDate(date: Date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function describeWhen(e: { startDate: Date; endDate: Date; startTime: string | null; endTime: string | null }) {
  const days =
    formatDate(e.startDate) === formatDate(e.endDate)
      ? humanDate(e.startDate)
      : `${humanDate(e.startDate)} – ${humanDate(e.endDate)}`;
  if (!e.startTime) return days;
  return `${days}, ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}`;
}

async function buildEventData(institutionId: string, data: CreateEventDtoType | UpdateEventDtoType): Promise<EventData> {
  const sessionYear = await eventRepository.findAcademicYear(institutionId, data.academicYearId);
  if (!sessionYear) {
    throw new NotFoundError(`Session year with ID '${data.academicYearId}' not found`);
  }

  const startDate = toDbDate(data.startDate);
  const endDate = data.type === 'MULTIPLE' && data.endDate ? toDbDate(data.endDate) : startDate;
  if (startDate < sessionYear.startDate || endDate > sessionYear.endDate) {
    throw new ValidationError(
      `Event dates must be within session year '${sessionYear.label}' (${formatDate(sessionYear.startDate)} to ${formatDate(sessionYear.endDate)})`,
    );
  }

  return {
    academicYearId: sessionYear.id,
    title: data.title,
    description: data.description || null,
    category: data.category as EventCategory,
    type: data.type as EventType,
    startDate,
    endDate,
    startTime: data.startTime || null,
    endTime: (data.startTime && data.endTime) || null,
    venue: data.venue || null,
    audience: [...new Set(data.audience)] as EventAudience[],
    imageUrl: data.imageUrl ?? null,
  };
}

export async function listEvents(institutionId: string, role: string, query: EventQueryDtoType) {
  const audience = audienceForRole(role);
  const sessionYear = query.academicYearId
    ? await eventRepository.findAcademicYear(institutionId, query.academicYearId)
    : await getDefaultSessionYear(institutionId);
  if (!sessionYear || audience === null) {
    return { sessionYear: sessionYear ?? null, events: [] };
  }

  const today = toDbDate(todayIso());
  const events = await eventRepository.findEvents(
    institutionId,
    {
      academicYearId: sessionYear.id,
      category: query.category as EventCategory | undefined,
      audience,
      ...(query.when === 'upcoming' ? { endingFrom: today } : {}),
      ...(query.when === 'past' ? { endedBefore: today } : {}),
    },
    { order: query.when === 'past' ? 'desc' : 'asc' },
  );
  return { sessionYear, events };
}

// Next events for the viewer across all session years — for dashboards.
export async function listUpcomingEvents(institutionId: string, role: string, limit: number) {
  const audience = audienceForRole(role);
  if (audience === null) return [];
  return eventRepository.findEvents(
    institutionId,
    { audience, endingFrom: toDbDate(todayIso()) },
    { take: limit },
  );
}

export async function getEvent(institutionId: string, role: string, id: string) {
  const event = await eventRepository.findEventById(institutionId, id);
  const audience = audienceForRole(role);
  if (!event || audience === null || (audience && !event.audience.includes(audience))) {
    throw new NotFoundError(`Event with ID '${id}' not found`);
  }
  return event;
}

export async function createEvent(institutionId: string, userId: string, data: CreateEventDtoType) {
  const eventData = await buildEventData(institutionId, data);
  const event = await eventRepository.createEvent(institutionId, userId, eventData);
  logger.info('Event created', { eventId: event.id, institutionId });

  if (data.notify) {
    const recipientUserIds = (await eventRepository.findActiveUserIdsByRoles(institutionId, rolesForAudience(event.audience)))
      .filter((id) => id !== userId);
    if (recipientUserIds.length > 0) {
      notifySafe({
        institutionId,
        type: 'EVENT_PUBLISHED',
        recipientUserIds,
        contextId: event.id,
        vars: {
          eventTitle: event.title,
          eventWhen: describeWhen(event),
          venue: event.venue ?? 'School',
        },
        data: { link: '/events' },
      });
    }
  }
  return event;
}

export async function updateEvent(institutionId: string, id: string, data: UpdateEventDtoType) {
  const existing = await eventRepository.findEventById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Event with ID '${id}' not found`);
  }
  const eventData = await buildEventData(institutionId, data);
  const event = await eventRepository.updateEvent(institutionId, id, eventData);
  logger.info('Event updated', { eventId: id, institutionId });
  return event;
}

export async function deleteEvent(institutionId: string, id: string) {
  const existing = await eventRepository.findEventById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Event with ID '${id}' not found`);
  }
  await eventRepository.deleteEvent(institutionId, id);
  logger.info('Event deleted', { eventId: id, institutionId });
}
