import React, { useEffect, useState } from 'react';
import { Users, ExternalLink, FileText, Video, Link2, Presentation, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { useT } from '../../i18n';

const RESOURCE_TYPES = [
  { value: 'NOTE', label: 'Notes', icon: FileText, color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20' },
  { value: 'SLIDE', label: 'Slides', icon: Presentation, color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' },
  { value: 'VIDEO', label: 'Video', icon: Video, color: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20' },
  { value: 'PDF', label: 'PDF', icon: FileText, color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20' },
  { value: 'LINK', label: 'Link', icon: Link2, color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' },
  { value: 'IMAGE', label: 'Image', icon: ImageIcon, color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20' },
];
const resourceMeta = (type?: string | null) => RESOURCE_TYPES.find((r) => r.value === type) || RESOURCE_TYPES[0];

const timeAgo = (iso: string) => {
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

const initials = (firstName?: string, lastName?: string) =>
  `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';

interface Submission {
  id: string;
  instructions?: string | null;
  resourceType?: string | null;
  fileUrl?: string | null;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string; role: string };
}

interface AssignmentLike {
  id: string;
  title: string;
}

interface AssignmentSubmissionsModalProps {
  assignment: AssignmentLike;
  onClose: () => void;
}

export default function AssignmentSubmissionsModal({ assignment, onClose }: AssignmentSubmissionsModalProps) {
  const t = useT();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchSubmissions = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiClient.get('/assignments', {
        params: { parentAssignmentId: assignment.id, pageSize: 100 },
      });
      setSubmissions(res.data.data || []);
    } catch (error: any) {
      setError(true);
      toast.error(error.response?.data?.message || t('Failed to load submissions'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.id]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <Users className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" /> {t('Submissions')}
        </span>
      }
      description={assignment.title}
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-3 rounded-xl border border-slate-200/50 dark:border-white/10">
              <Skeleton className="h-4 w-1/3 mb-2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title={t('Failed to load submissions')}
          description={t('Something went wrong while fetching submissions for this assignment.')}
          icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        />
      ) : submissions.length === 0 ? (
        <EmptyState
          title={t('No submissions yet')}
          description={t('No student has submitted their work for this assignment yet.')}
          icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        />
      ) : (
        <div className="space-y-3">
          {submissions.map((submission) => {
            const meta = resourceMeta(submission.resourceType);
            const Icon = meta.icon;
            return (
              <div key={submission.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/50 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-teal-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {initials(submission.createdBy?.firstName, submission.createdBy?.lastName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {submission.createdBy?.firstName} {submission.createdBy?.lastName}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{timeAgo(submission.createdAt)}</span>
                  </div>
                  {submission.instructions && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap break-words">{submission.instructions}</p>
                  )}
                  {submission.fileUrl && (
                    <a
                      href={submission.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border mt-2 ${meta.color}`}
                    >
                      <Icon className="w-3.5 h-3.5" /> {t('Open submission')} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
