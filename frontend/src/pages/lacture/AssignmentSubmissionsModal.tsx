import React, { useEffect, useState } from 'react';
import { X, Users, ExternalLink, FileText, Video, Link2, Presentation, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { EmptyState } from '../../components/common/EmptyState';

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
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubmissions = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get('/assignments', {
          params: { parentAssignmentId: assignment.id, pageSize: 100 },
        });
        setSubmissions(res.data.data || []);
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Failed to load submissions');
      } finally {
        setLoading(false);
      }
    };
    fetchSubmissions();
  }, [assignment.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden shadow-blue-500/10 max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between p-6 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              Submissions
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{assignment.title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center text-sm text-slate-500 py-6">Loading submissions...</div>
          ) : submissions.length === 0 ? (
            <EmptyState
              title="No submissions yet"
              description="No student has submitted their work for this assignment yet."
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
                          <Icon className="w-3.5 h-3.5" /> Open submission <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
