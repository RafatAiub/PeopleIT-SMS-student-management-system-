import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2, ArrowRightCircle, ExternalLink } from 'lucide-react';
import { Drawer, Button, Select, Input, Textarea, DescriptionList, Alert } from '@/components/ui';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useT, formatDate } from '@/i18n';
import { useEnquiryAssignees, useUpdateEnquiry, useUpdateEnquiryStatus, useDeleteEnquiry, useConvertEnquiry } from './enquiries.queries';
import ConvertEnquiryModal from './ConvertEnquiryModal';
import { EnquiryStatusBadge } from './EnquiryStatusBadge';
import {
  STATUS_OPTIONS,
  enquiryToFormValues,
  toLocalInput,
  type ConvertFormValues,
  type Enquiry,
  type EnquiryStatus,
} from './enquiries.types';

interface EnquiryDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  enquiry: Enquiry | null;
  onEdit: (enquiry: Enquiry) => void;
  /** Called after the enquiry is deleted so the parent can clear its selection. */
  onDeleted: () => void;
}

/** Quick view + quick edit for a single enquiry: status/assignee/follow-up,
 * notes (read-only history), delete, and "Convert to online application". */
export default function EnquiryDetailDrawer({ isOpen, onClose, enquiry, onEdit, onDeleted }: EnquiryDetailDrawerProps) {
  const t = useT();
  const { data: assignees = [] } = useEnquiryAssignees();
  const updateMutation = useUpdateEnquiry();
  const statusMutation = useUpdateEnquiryStatus();
  const deleteMutation = useDeleteEnquiry();
  const convertMutation = useConvertEnquiry();

  const [current, setCurrent] = useState<Enquiry | null>(enquiry);
  const [statusDraft, setStatusDraft] = useState<EnquiryStatus>('NEW');
  const [statusNote, setStatusNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  useEffect(() => {
    setCurrent(enquiry);
    if (enquiry) setStatusDraft(enquiry.status);
    setStatusNote('');
  }, [enquiry]);

  if (!current) return null;

  const applyStatus = () => {
    if (statusDraft === current.status && !statusNote.trim()) return;
    statusMutation.mutate(
      { id: current.id, status: statusDraft, note: statusNote.trim() || undefined },
      { onSuccess: (updated) => { setCurrent(updated); setStatusNote(''); } },
    );
  };

  const handleAssigneeChange = (assignedToUserId: string) => {
    const values = { ...enquiryToFormValues(current), assignedToUserId };
    updateMutation.mutate({ id: current.id, values }, { onSuccess: (updated) => setCurrent(updated) });
  };

  const handleFollowUpChange = (localValue: string) => {
    const values = { ...enquiryToFormValues(current), followUpAt: localValue };
    updateMutation.mutate({ id: current.id, values }, { onSuccess: (updated) => setCurrent(updated) });
  };

  const handleDelete = () => {
    deleteMutation.mutate(current.id, {
      onSuccess: () => {
        setConfirmDelete(false);
        onDeleted();
      },
    });
  };

  const handleConvert = (values: ConvertFormValues) => {
    convertMutation.mutate(
      { id: current.id, values },
      { onSuccess: (result) => { setCurrent(result.enquiry); setConvertOpen(false); } },
    );
  };

  const alreadyConverted = !!current.convertedStudentId;

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} title={current.studentName} description={t('Enquiry details')} width="lg">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <EnquiryStatusBadge status={current.status} />
            {current.followUpAt && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('Follow-up')}: {formatDate(current.followUpAt, true)}
              </span>
            )}
          </div>

          <DescriptionList
            columns={2}
            items={[
              { label: t('Guardian'), value: current.guardianName || '—' },
              { label: t('Phone'), value: current.phone },
              { label: t('Email'), value: current.email || '—' },
              { label: t('Class interested'), value: current.classInterested || '—' },
              { label: t('Source'), value: current.source },
              { label: t('Assigned to'), value: current.assignedTo ? `${current.assignedTo.firstName} ${current.assignedTo.lastName}` : '—' },
              { label: t('Created'), value: formatDate(current.createdAt, true) },
              { label: t('Last updated'), value: formatDate(current.updatedAt, true) },
            ]}
          />

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={() => onEdit(current)}>
              {t('Edit')}
            </Button>
            <Button size="sm" variant="danger-soft" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirmDelete(true)}>
              {t('Delete')}
            </Button>
          </div>

          <div className="border-t border-slate-100 dark:border-white/6 pt-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('Update status')}</h3>
            <Select
              label={t('Move to…')}
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value as EnquiryStatus)}
              options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
            />
            <Textarea
              label={t('Note (optional)')}
              rows={2}
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder={t('Add a note about this status change...')}
            />
            <Button size="sm" variant="primary" isLoading={statusMutation.isPending} onClick={applyStatus}>
              {t('Apply')}
            </Button>
          </div>

          <div className="border-t border-slate-100 dark:border-white/6 pt-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('Assignment & follow-up')}</h3>
            <Select
              label={t('Assign to')}
              value={current.assignedToUserId ?? ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              options={[{ value: '', label: t('Unassigned') }, ...assignees.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}`.trim() }))]}
              disabled={updateMutation.isPending}
            />
            <Input
              label={t('Follow-up date & time')}
              type="datetime-local"
              key={current.followUpAt ?? 'none'}
              defaultValue={toLocalInput(current.followUpAt)}
              onBlur={(e) => handleFollowUpChange(e.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>

          <div className="border-t border-slate-100 dark:border-white/6 pt-5 space-y-2">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('Notes history')}</h3>
            {current.notes ? (
              <pre className="whitespace-pre-wrap wrap-break-word text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-white/3 rounded-lg p-3 font-sans">
                {current.notes}
              </pre>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('No notes yet.')}</p>
            )}
          </div>

          <div className="border-t border-slate-100 dark:border-white/6 pt-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('Online application')}</h3>
            {alreadyConverted && current.convertedStudent ? (
              <Alert tone="success" title={t('Already converted')}>
                <p className="flex flex-wrap items-center gap-2">
                  {t('Reference')}: <span className="font-semibold">{current.convertedStudent.studentId}</span>
                  <StatusBadge status={current.convertedStudent.status} />
                </p>
                <Link
                  to="/students/online-registrations"
                  className="inline-flex items-center gap-1 mt-2 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline"
                >
                  {t('View on Online Registrations')} <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </Alert>
            ) : (
              <Button
                size="sm"
                variant="gradient"
                leftIcon={<ArrowRightCircle className="w-4 h-4" />}
                onClick={() => setConvertOpen(true)}
              >
                {t('Convert to online application')}
              </Button>
            )}
          </div>
        </div>
      </Drawer>

      <ConvertEnquiryModal
        isOpen={convertOpen}
        onClose={() => setConvertOpen(false)}
        enquiry={current}
        onSubmit={handleConvert}
        isSubmitting={convertMutation.isPending}
      />

      <ConfirmModal
        isOpen={confirmDelete}
        title={t('Delete enquiry')}
        message={t('Are you sure you want to delete "{name}"? This cannot be undone.', { name: current.studentName })}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
