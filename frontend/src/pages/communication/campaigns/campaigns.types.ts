// =============================================================================
// Campaign + Message Group types — mirrors backend/src/modules/campaigns/*.dto.ts
// and the shapes returned by campaigns.controller.ts. Do not invent fields
// that aren't in the API contract described in the Wave C brief.
// =============================================================================

export type CampaignChannel = 'SMS' | 'EMAIL' | 'IN_APP';

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

/** Roles a campaign (or group member picker) can target. */
export type AudienceRole =
  | 'ADMIN'
  | 'TEACHER'
  | 'ACCOUNTANT'
  | 'LIBRARIAN'
  | 'TRANSPORT_OFFICER'
  | 'MANAGEMENT'
  | 'STUDENT'
  | 'GUARDIAN';

export interface Audience {
  roles: AudienceRole[];
  classIds: string[];
  sectionIds: string[];
  userIds: string[];
  groupIds: string[];
}

export const EMPTY_AUDIENCE: Audience = {
  roles: [],
  classIds: [],
  sectionIds: [],
  userIds: [],
  groupIds: [],
};

export interface CampaignAuthor {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface Campaign {
  id: string;
  channel: CampaignChannel;
  subject: string | null;
  body: string;
  audience: Audience;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  isDemo: boolean;
  createdByUserId: string;
  createdBy: CampaignAuthor;
  createdAt: string;
  updatedAt: string;
}

export type SmsEncoding = 'GSM' | 'UNICODE';

export interface SmsSegmentInfo {
  encoding: SmsEncoding;
  length: number;
  segments: number;
  perSegment: number;
  remaining: number;
}

export interface DeliveryStats {
  QUEUED: number;
  SENT: number;
  FAILED: number;
  SKIPPED: number;
}

export interface CampaignDetail extends Campaign {
  deliveryStats: DeliveryStats;
  sms?: SmsSegmentInfo;
  demo: boolean;
}

export type DeliveryStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface Delivery {
  id: string;
  channel: CampaignChannel;
  recipient: string;
  status: DeliveryStatus;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignConfig {
  channels: { SMS: boolean; EMAIL: boolean; IN_APP: boolean };
  demo: { SMS: boolean; EMAIL: boolean; IN_APP: boolean };
  sms: { unicodePerSegment: number; gsmPerSegment: number };
}

export interface PreviewResult {
  channel: CampaignChannel;
  total: number;
  unreachable: number;
  byRole: Record<string, number>;
  sample: { name: string; role: string }[];
  sms?: SmsSegmentInfo & { totalSegments: number };
  demo: boolean;
}

export interface SendCampaignResult {
  campaign: CampaignDetail;
  demo: boolean;
  scheduled: boolean;
}

export interface GroupAuthor {
  id: string;
  firstName: string;
  lastName: string;
}

export interface MessageGroup {
  id: string;
  name: string;
  description: string | null;
  createdByUserId: string;
  createdBy: GroupAuthor;
  createdAt: string;
  _count: { members: number };
}

export interface GroupMemberUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string;
}

export interface MessageGroupDetail extends MessageGroup {
  members: GroupMemberUser[];
}

export interface ClassMeta {
  id: string;
  name: string;
}

export interface SectionMeta {
  id: string;
  name: string;
  classId?: string;
}

export const AUDIENCE_ROLE_OPTIONS: { value: AudienceRole; label: string }[] = [
  { value: 'STUDENT', label: 'Students' },
  { value: 'GUARDIAN', label: 'Guardians' },
  { value: 'ADMIN', label: 'Admins' },
  { value: 'TEACHER', label: 'Teachers' },
  { value: 'ACCOUNTANT', label: 'Accountants' },
  { value: 'LIBRARIAN', label: 'Librarians' },
  { value: 'TRANSPORT_OFFICER', label: 'Transport officers' },
  { value: 'MANAGEMENT', label: 'Management' },
];

export const STAFF_AUDIENCE_ROLES: AudienceRole[] = [
  'ADMIN',
  'TEACHER',
  'ACCOUNTANT',
  'LIBRARIAN',
  'TRANSPORT_OFFICER',
  'MANAGEMENT',
];

export const CHANNEL_OPTIONS: { value: CampaignChannel; label: string; helper: string }[] = [
  { value: 'SMS', label: 'SMS', helper: 'Text message to phone numbers on file.' },
  { value: 'EMAIL', label: 'Email', helper: 'Email to addresses on file. Needs a subject.' },
  { value: 'IN_APP', label: 'In-app notification', helper: 'Shown to recipients who have a login account.' },
];
