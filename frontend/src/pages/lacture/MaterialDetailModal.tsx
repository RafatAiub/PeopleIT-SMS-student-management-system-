import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Send, Trash2, MessageSquare, FileText, Video, Link2, Presentation } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { ConfirmModal } from '../../components/common/ConfirmModal';

const RESOURCE_TYPES = [
  { value: 'NOTE', label: 'Notes', icon: FileText, color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20' },
  { value: 'SLIDE', label: 'Slides', icon: Presentation, color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' },
  { value: 'VIDEO', label: 'Video', icon: Video, color: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20' },
  { value: 'PDF', label: 'PDF', icon: FileText, color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20' },
  { value: 'LINK', label: 'Link', icon: Link2, color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' },
];
const resourceMeta = (type: string) => RESOURCE_TYPES.find((r) => r.value === type) || RESOURCE_TYPES[0];

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

export interface MaterialLike {
  id: string;
  title: string;
  description?: string | null;
  subject: string;
  className: string;
  sectionName: string;
  resourceType: string;
  fileUrl: string;
  uploadedBy: { id: string; firstName: string; lastName: string; role: string };
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; firstName: string; lastName: string; role: string };
}

interface MaterialDetailModalProps {
  material: MaterialLike;
  currentUserId?: string;
  /** Only Teacher/Student may post — Admin/Guardian get a read-only thread. */
  canComment: boolean;
  /** Set when the viewer is a Guardian browsing through a specific linked child. */
  guardianStudentId?: string;
  onClose: () => void;
}

export default function MaterialDetailModal({ material, currentUserId, canComment, guardianStudentId, onClose }: MaterialDetailModalProps) {
  const meta = resourceMeta(material.resourceType);
  const Icon = meta.icon;

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [toDelete, setToDelete] = useState<Comment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/lectures/${material.id}/comments`, {
        params: guardianStudentId ? { studentId: guardianStudentId } : undefined,
      });
      setComments(res.data.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material.id]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await apiClient.post(`/lectures/${material.id}/comments`, { content: newComment.trim() });
      setNewComment('');
      fetchComments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to post comment');
    } finally {
      setPosting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/lectures/${material.id}/comments/${toDelete.id}`);
      setComments((prev) => prev.filter((c) => c.id !== toDelete.id));
      setToDelete(null);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete comment');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden shadow-blue-500/10 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex gap-3 min-w-0">
            <div className={`w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center border ${meta.color}`}>
              <Icon className="w-5.5 h-5.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">{material.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {material.subject} · {material.className} - {material.sectionName} · {material.uploadedBy?.firstName} {material.uploadedBy?.lastName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: description + open link + comments */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4 border-b border-slate-100 dark:border-white/5">
            {material.description && (
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{material.description}</p>
            )}
            <a
              href={material.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Open material
            </a>
          </div>

          <div className="p-6">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-4">
              <MessageSquare className="w-3.5 h-3.5" /> Class comments
            </h4>

            {loading ? (
              <div className="text-center text-sm text-slate-500 py-6">Loading comments...</div>
            ) : comments.length === 0 ? (
              <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-6">
                No comments yet. {canComment ? 'Start the conversation.' : ''}
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex items-start gap-3 group">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-teal-400 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                      {initials(comment.author?.firstName, comment.author?.lastName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {comment.author?.firstName} {comment.author?.lastName}
                        </span>
                        {comment.author?.role === 'TEACHER' && (
                          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded-full">Teacher</span>
                        )}
                        <span className="text-xs text-slate-400 dark:text-slate-500">{timeAgo(comment.createdAt)}</span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5 whitespace-pre-wrap break-words">{comment.content}</p>
                    </div>
                    {comment.author?.id === currentUserId && (
                      <button
                        onClick={() => setToDelete(comment)}
                        aria-label="Delete comment"
                        title="Delete comment"
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Comment input */}
        <div className="p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
          {canComment ? (
            <form onSubmit={handlePost} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-teal-400 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                {initials()}
              </div>
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add class comment..."
                maxLength={2000}
                className="input-field flex-1"
              />
              <button
                type="submit"
                disabled={posting || !newComment.trim()}
                aria-label="Post comment"
                title="Post comment"
                className="p-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 active:scale-[0.98] flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <p className="text-xs text-center text-slate-400 dark:text-slate-500">Only teachers and students can post comments.</p>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!toDelete}
        title="Delete comment"
        message="Are you sure you want to delete this comment? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
