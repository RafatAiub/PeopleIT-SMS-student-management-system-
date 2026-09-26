import React from 'react';
import { Edit2, Trash2, MessageSquare } from 'lucide-react';
import { useT } from '../../i18n';
import { resourceMeta, timeAgo, initials, type LectureMaterial } from './lectureShared';

interface MaterialCardProps {
  material: LectureMaterial;
  onOpen: () => void;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** Shows a small role tag next to the uploader's name for the "other side" role. */
  flagRole?: 'STUDENT' | 'TEACHER';
  /** Show the class/section (Admin/Teacher browse view spans multiple classes). */
  showClassSection?: boolean;
}

/** One Stream (announcement/material) card — used in both the teacher/admin
 * grid and the student/guardian grid. */
export default function MaterialCard({ material, onOpen, canManage, onEdit, onDelete, flagRole, showClassSection }: MaterialCardProps) {
  const t = useT();
  const meta = resourceMeta(material.resourceType);
  const Icon = meta.icon;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white dark:bg-transparent shadow-sm hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all group cursor-pointer h-full flex flex-col"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-teal-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {initials(material.uploadedBy?.firstName, material.uploadedBy?.lastName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[140px]">{material.uploadedBy?.firstName} {material.uploadedBy?.lastName}</span>
            {flagRole && material.uploadedBy?.role === flagRole && (
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded-full">
                {flagRole === 'STUDENT' ? t('Student') : t('Teacher')}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {t('shared {type}', { type: meta.label.toLowerCase() })} · {timeAgo(material.createdAt)}
            {showClassSection && <span className="ml-1">· {material.className} - {material.sectionName}</span>}
          </div>
        </div>
      </div>

      <h3 className="text-base font-bold text-slate-900 dark:text-white mt-3 line-clamp-1">{material.title}</h3>
      {material.description && (
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">{material.description}</p>
      )}

      <div className="flex items-center gap-3 mt-3 flex-wrap pt-3 border-t border-slate-100 dark:border-white/10 mt-auto">
        <a
          href={material.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border ${meta.color}`}
        >
          <Icon className="w-3.5 h-3.5" /> {t('Open {type}', { type: meta.label })}
        </a>
        <span className="flex items-center gap-1 text-xs text-slate-400" title={t('Comments')}>
          <MessageSquare className="w-3.5 h-3.5" /> {material._count?.comments ?? 0} {t('comments')}
        </span>
        {canManage && (
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label={`Edit ${material.title}`} title={t('Edit')} className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label={`Delete ${material.title}`} title={t('Delete')} className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
