import { FileText, Video, Link2, Presentation, Image as ImageIcon } from 'lucide-react';

// Shared between Lacture.tsx, MyLectureMaterials.tsx and their modals/cards —
// kept in one place so the resource-type catalogue, and the Stream/Classwork
// data shapes, never drift between the teacher/admin screen and the
// student/guardian screen.

export const RESOURCE_TYPES = [
  { value: 'NOTE', label: 'Notes', icon: FileText, color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20' },
  { value: 'SLIDE', label: 'Slides', icon: Presentation, color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' },
  { value: 'VIDEO', label: 'Video', icon: Video, color: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20' },
  { value: 'PDF', label: 'PDF', icon: FileText, color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20' },
  { value: 'LINK', label: 'Link', icon: Link2, color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' },
  { value: 'IMAGE', label: 'Image', icon: ImageIcon, color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20' },
] as const;

export const resourceMeta = (type?: string | null) => RESOURCE_TYPES.find((r) => r.value === type) || RESOURCE_TYPES[0];

// A student's submission is finished work, not lesson content — Notes/Slides
// don't apply, so the submission form offers a narrower set.
export const SUBMISSION_RESOURCE_TYPES = RESOURCE_TYPES.filter((r) => r.value !== 'NOTE' && r.value !== 'SLIDE');

export const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

export const initials = (firstName?: string, lastName?: string) =>
  `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';

// Only Teacher-assigned tasks have a due date — a Student's own submission
// has none, so this returns null and the badge is simply not rendered.
export const dueDateStatus = (iso?: string | null) => {
  if (!iso) return null;
  const due = new Date(iso);
  const now = new Date();
  const diffDays = Math.ceil((due.setHours(23, 59, 59, 999) - now.getTime()) / 86400000);
  if (diffDays < 0) return { label: 'Overdue', className: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20' };
  if (diffDays === 0) return { label: 'Due today', className: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' };
  return { label: `Due ${new Date(iso).toLocaleDateString()}`, className: 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10' };
};

export interface LectureMaterial {
  id: string;
  className: string;
  sectionName: string;
  subject: string;
  title: string;
  description?: string | null;
  resourceType: string;
  fileUrl: string;
  createdAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string; role: string };
  _count?: { comments: number };
}

export interface Submission {
  id: string;
  instructions?: string | null;
  resourceType?: string | null;
  fileUrl?: string | null;
  createdAt: string;
}

export interface Assignment {
  id: string;
  className: string;
  sectionName: string;
  subject: string;
  title: string;
  instructions?: string | null;
  resourceType?: string | null;
  fileUrl?: string | null;
  dueDate?: string | null;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string; role: string };
  _count?: { submissions: number };
  /** My (or, for a Guardian, my linked child's) own submission — Student/Guardian screen only. */
  mySubmission?: Submission | null;
}

export const emptyMaterialForm = {
  subject: '',
  title: '',
  description: '',
  resourceType: 'NOTE',
  fileUrl: '',
};

export const emptyAssignmentForm = {
  className: '',
  sectionName: '',
  subject: '',
  title: '',
  instructions: '',
  resourceType: '',
  fileUrl: '',
  dueDate: '',
};
