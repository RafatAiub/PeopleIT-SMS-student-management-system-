import QRCode from 'qrcode';
import { BadRequestError, NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as repo from './qr.repository';
import {
  DEFAULT_CUTOFF_TIME,
  DEFAULT_TIMEZONE,
  checkInStatus,
  extractIdCardToken,
  getQrSecret,
  isDuplicateScan,
  localDayAndTime,
  signQrToken,
  verifyQrToken,
  type QrKind,
} from './qr.token';
import type { QrCheckInsQueryDtoType, QrScanDtoType, QrTokensQueryDtoType } from './qr.dto';

const STAFF_SELF_ROLES = ['ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'MANAGEMENT'];

async function qrDataUrl(token: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
  } catch (error) {
    logger.warn('QR image generation failed', { error: (error as Error).message });
    return null;
  }
}

function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

// ── Tokens ──────────────────────────────────────────────────────────────

export async function listTokens(institutionId: string, q: QrTokensQueryDtoType) {
  const secret = getQrSecret();
  const skip = (q.page - 1) * q.pageSize;
  const meta = { page: q.page, pageSize: q.pageSize };

  if (q.type === 'STUDENT') {
    const { items, total } = await repo.listStudents(institutionId, {
      className: q.className,
      sectionName: q.sectionName,
      search: q.search,
      skip,
      take: q.pageSize,
    });
    const rows = await Promise.all(
      items.map(async (s) => {
        const token = signQrToken('S', s.id, institutionId, secret);
        return {
          type: 'STUDENT' as const,
          id: s.id,
          name: `${s.firstName} ${s.lastName}`.trim(),
          code: s.studentId,
          subtitle: [s.class?.name, s.section?.name ? `Section ${s.section.name}` : null, s.rollNumber ? `Roll ${s.rollNumber}` : null]
            .filter(Boolean)
            .join(' · '),
          token,
          qrDataUrl: await qrDataUrl(token),
        };
      }),
    );
    return { items: rows, meta: { ...meta, total } };
  }

  const { items, total } = await repo.listStaffUsers(institutionId, { search: q.search, skip, take: q.pageSize });
  const rows = await Promise.all(
    items.map(async (u) => {
      const token = signQrToken('T', u.id, institutionId, secret);
      return {
        type: 'STAFF' as const,
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        code: u.staffProfile?.employeeId ?? null,
        subtitle: u.staffProfile?.designation || u.role,
        token,
        qrDataUrl: await qrDataUrl(token),
      };
    }),
  );
  return { items: rows, meta: { ...meta, total } };
}

/** The caller's own check-in QR (staff roles use their user id, students their Student id). */
export async function getMyToken(institutionId: string, user: { sub: string; role: string }) {
  const secret = getQrSecret();
  let kind: QrKind;
  let id: string;
  if (user.role === 'STUDENT') {
    const student = await repo.findStudentByUserId(institutionId, user.sub);
    if (!student) throw new NotFoundError('Student profile not found');
    kind = 'S';
    id = student.id;
  } else if (STAFF_SELF_ROLES.includes(user.role)) {
    kind = 'T';
    id = user.sub;
  } else {
    throw new BadRequestError('No check-in QR is available for this account');
  }
  const token = signQrToken(kind, id, institutionId, secret);
  return { type: kind === 'S' ? 'STUDENT' : 'STAFF', token, qrDataUrl: await qrDataUrl(token) };
}

// ── Scan ────────────────────────────────────────────────────────────────

interface ResolvedSubject {
  kind: QrKind;
  id: string;
  method: 'QR' | 'ID_CARD';
}

async function resolveSubject(institutionId: string, code: string): Promise<ResolvedSubject> {
  const signed = verifyQrToken(code, institutionId, getQrSecret());
  if (signed) return { ...signed, method: 'QR' };

  // Fallback: the QR printed on an ID card (…/verify/<verifyToken>).
  const cardToken = extractIdCardToken(code);
  if (cardToken) {
    const card = await repo.findIdCardByToken(institutionId, cardToken);
    if (card) {
      if (card.status !== 'ACTIVE' || (card.expiresAt && card.expiresAt < new Date())) {
        throw new BadRequestError('This ID card is not active');
      }
      if (card.userType === 'STUDENT' && card.studentId) return { kind: 'S', id: card.studentId, method: 'ID_CARD' };
      if (card.userType === 'STAFF' && card.staff?.userId) return { kind: 'T', id: card.staff.userId, method: 'ID_CARD' };
    }
  }
  throw new BadRequestError('Unrecognised or invalid QR code for this institution');
}

export async function scan(institutionId: string, operatorUserId: string, dto: QrScanDtoType) {
  const now = new Date();
  const cutoff = dto.cutoffTime ?? DEFAULT_CUTOFF_TIME;
  const subject = await resolveSubject(institutionId, dto.code);
  const tz = (await repo.findInstitutionTimezone(institutionId)) ?? DEFAULT_TIMEZONE;
  const { day, hhmm } = localDayAndTime(now, tz);
  const date = dayDate(day);

  if (subject.kind === 'S') {
    const student = await repo.findActiveStudent(institutionId, subject.id);
    if (!student) throw new NotFoundError('Student not found or inactive');
    const person = {
      type: 'STUDENT' as const,
      id: student.id,
      name: `${student.firstName} ${student.lastName}`.trim(),
      code: student.studentId,
      subtitle: [student.class?.name, student.section?.name ? `Section ${student.section.name}` : null].filter(Boolean).join(' · '),
      avatarUrl: student.avatarUrl,
    };

    const last = await repo.findLastScan(institutionId, { studentId: student.id });
    if (isDuplicateScan(last?.scannedAt, now)) {
      return { duplicate: true, person, lastScannedAt: last!.scannedAt, day, time: hhmm };
    }

    // QrCheckIn.userId is required: the student's own account, or — for
    // students without a login — the operator who ran the kiosk.
    await repo.createCheckIn({
      institutionId,
      userId: student.userId ?? operatorUserId,
      studentId: student.id,
      scannedAt: now,
      method: subject.method,
      deviceInfo: dto.deviceInfo ?? null,
    });

    const existing = await repo.findAttendance(institutionId, student.id, date);
    let status = existing?.status ?? null;
    let action: 'MARKED' | 'ALREADY_MARKED' = 'ALREADY_MARKED';
    if (!existing || existing.status === 'ABSENT') {
      status = checkInStatus(hhmm, cutoff);
      await repo.upsertAttendance(institutionId, student.id, date, status, `QR check-in ${hhmm}`);
      action = 'MARKED';
    }
    return { duplicate: false, person, action, status, day, time: hhmm, cutoff };
  }

  const staff = await repo.findActiveStaffUser(institutionId, subject.id);
  if (!staff) throw new NotFoundError('Staff member not found or inactive');
  const person = {
    type: 'STAFF' as const,
    id: staff.id,
    name: `${staff.firstName} ${staff.lastName}`.trim(),
    code: null,
    subtitle: staff.staffProfile?.designation || staff.role,
    avatarUrl: staff.avatarUrl,
  };

  const last = await repo.findLastScan(institutionId, { userId: staff.id });
  if (isDuplicateScan(last?.scannedAt, now)) {
    return { duplicate: true, person, lastScannedAt: last!.scannedAt, day, time: hhmm };
  }

  await repo.createCheckIn({
    institutionId,
    userId: staff.id,
    studentId: null,
    scannedAt: now,
    method: subject.method,
    deviceInfo: dto.deviceInfo ?? null,
  });

  const existing = await repo.findStaffAttendance(institutionId, staff.id, date);
  let action: 'CHECKED_IN' | 'CHECKED_OUT';
  let status: string;
  if (!existing || existing.status === 'ABSENT') {
    status = checkInStatus(hhmm, cutoff);
    await repo.upsertStaffAttendance(
      institutionId,
      staff.id,
      date,
      { institutionId, staffUserId: staff.id, date, status, checkIn: now, markedByUserId: operatorUserId },
      { status, checkIn: now, checkOut: null, markedByUserId: operatorUserId },
    );
    action = 'CHECKED_IN';
  } else if (!existing.checkIn) {
    status = existing.status;
    await repo.upsertStaffAttendance(institutionId, staff.id, date, { institutionId, staffUserId: staff.id, date, status }, { checkIn: now });
    action = 'CHECKED_IN';
  } else {
    // Second scan of the day (outside the duplicate window) = check-out; the
    // latest scan always wins so a mid-day scan doesn't lock the time.
    status = existing.status;
    await repo.upsertStaffAttendance(institutionId, staff.id, date, { institutionId, staffUserId: staff.id, date, status }, { checkOut: now });
    action = 'CHECKED_OUT';
  }
  return { duplicate: false, person, action, status, day, time: hhmm, cutoff };
}

export async function listCheckIns(institutionId: string, q: QrCheckInsQueryDtoType) {
  const skip = (q.page - 1) * q.pageSize;
  let start: Date | undefined;
  let end: Date | undefined;
  if (q.date) {
    // Local-day window for Asia/Dhaka-style zones is approximated by the UTC
    // day ±; use the institution zone offset via Intl for exactness.
    const tz = (await repo.findInstitutionTimezone(institutionId)) ?? DEFAULT_TIMEZONE;
    const probe = new Date(`${q.date}T12:00:00.000Z`);
    const { hhmm } = localDayAndTime(probe, tz);
    const [h, m] = hhmm.split(':').map(Number);
    const offsetMin = (h * 60 + m) - 12 * 60;
    start = new Date(new Date(`${q.date}T00:00:00.000Z`).getTime() - offsetMin * 60000);
    end = new Date(start.getTime() + 86400000);
  }
  const { items, total } = await repo.listCheckIns(institutionId, { start, end, skip, take: q.pageSize });
  return {
    items: items.map((c) => ({
      id: c.id,
      scannedAt: c.scannedAt,
      method: c.method,
      deviceInfo: c.deviceInfo,
      type: c.studentId ? 'STUDENT' : 'STAFF',
      name: c.student
        ? `${c.student.firstName} ${c.student.lastName}`.trim()
        : `${c.user.firstName} ${c.user.lastName}`.trim(),
      subtitle: c.student
        ? [c.student.class?.name, c.student.section?.name].filter(Boolean).join(' - ')
        : c.user.role,
    })),
    meta: { total, page: q.page, pageSize: q.pageSize },
  };
}
