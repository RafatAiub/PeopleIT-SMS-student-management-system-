import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Plus, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { Button, ErrorState, Modal, PageHeader, Select } from '../../components/ui';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { PrintLayout, SignatureLines } from '../../components/print/PrintLayout';
import { useT, formatDate } from '../../i18n';
import { errorMessage, useExamOptions } from '../results/academicLookups';
import { useDeleteSlot, useExamSlots, type ExamSlot } from './examTimetable.queries';
import { ExamSlotFormModal } from './ExamSlotFormModal';

const weekday = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

const TimetablePrint: React.FC<{ examName: string; slots: ExamSlot[] }> = ({ examName, slots }) => {
  const t = useT();
  return (
    <PrintLayout title={t('Exam Routine')} reference={examName} footer={<SignatureLines labels={[t('Exam Controller'), t('Principal')]} />}>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-100">
            {[t('Date'), t('Day'), t('Time'), t('Class'), t('Subject'), t('Room')].map((h) => (
              <th key={h} className="border border-slate-300 px-2 py-1 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.id}>
              <td className="border border-slate-300 px-2 py-1">{formatDate(s.date)}</td>
              <td className="border border-slate-300 px-2 py-1">{weekday(s.date)}</td>
              <td className="border border-slate-300 px-2 py-1 tabular-nums">{s.startTime}–{s.endTime}</td>
              <td className="border border-slate-300 px-2 py-1">{s.className}{s.sectionName ? ` – ${s.sectionName}` : ''}</td>
              <td className="border border-slate-300 px-2 py-1 font-medium">{s.subjectName}</td>
              <td className="border border-slate-300 px-2 py-1">{s.room ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintLayout>
  );
};

/**
 * Route: /exams/timetable — SUPER_ADMIN, ADMIN manage; TEACHER, STUDENT,
 * GUARDIAN see their own classes only (scoped server-side).
 */
const ExamTimetable: React.FC = () => {
  const t = useT();
  const { user } = useAuthStore();
  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const exams = useExamOptions();
  const [examId, setExamId] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExamSlot | null>(null);
  const [deleting, setDeleting] = useState<ExamSlot | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    if (!examId && exams.data?.length) setExamId(exams.data[0].id);
  }, [exams.data, examId]);

  const slots = useExamSlots({ examId }, !!examId);
  const del = useDeleteSlot();

  const items = useMemo(
    () => (slots.data?.items ?? []).filter((s) => !classFilter || s.className === classFilter),
    [slots.data, classFilter],
  );
  const classNames = useMemo(() => Array.from(new Set((slots.data?.items ?? []).map((s) => s.className))).sort(), [slots.data]);
  const examName = exams.data?.find((e) => e.id === examId)?.name ?? '';

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success(t('Exam slot deleted'));
      setDeleting(null);
    } catch (err) {
      toast.error(errorMessage(err, t('Failed to delete exam slot')));
    }
  };

  const columns: Column<ExamSlot>[] = [
    {
      key: 'date',
      header: t('Date'),
      render: (s) => (
        <span className="whitespace-nowrap">
          {formatDate(s.date)} <span className="text-xs text-slate-500">{weekday(s.date)}</span>
        </span>
      ),
      exportValue: (s) => s.date,
    },
    { key: 'time', header: t('Time'), render: (s) => <span className="tabular-nums">{s.startTime}–{s.endTime}</span>, exportValue: (s) => `${s.startTime}-${s.endTime}` },
    { key: 'subjectName', header: t('Subject'), accessor: 'subjectName', primary: true },
    { key: 'class', header: t('Class'), render: (s) => `${s.className}${s.sectionName ? ` – ${s.sectionName}` : ` (${t('all sections')})`}`, exportValue: (s) => `${s.className} ${s.sectionName ?? ''}`.trim() },
    { key: 'room', header: t('Room'), render: (s) => s.room ?? '—', exportValue: (s) => s.room ?? '' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Exam timetable')}
        description={canManage ? t('Schedule exam sittings. Clashes for a class or room are blocked.') : t('Upcoming exam sittings for your classes.')}
        actions={
          <>
            <Button variant="secondary" leftIcon={<Printer className="w-4 h-4" />} onClick={() => setPrintOpen(true)} disabled={items.length === 0}>
              {t('Print')}
            </Button>
            {canManage && (
              <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setFormOpen(true); }} disabled={!exams.data?.length}>
                {t('Add slot')}
              </Button>
            )}
          </>
        }
      />

      {exams.isError ? (
        <ErrorState onRetry={() => exams.refetch()} />
      ) : !exams.isLoading && (exams.data ?? []).length === 0 ? (
        <EmptyState icon={<CalendarClock className="w-6 h-6" />} title={t('No exams yet')} description={t('Exams are created under Settings → Manage Exams.')} />
      ) : slots.isError ? (
        <ErrorState onRetry={() => slots.refetch()} />
      ) : (
        <DataTable
          data={items}
          columns={columns}
          isLoading={exams.isLoading || slots.isLoading}
          actions={
            canManage
              ? [
                  { label: t('Edit'), icon: 'edit', onClick: (s) => { setEditing(s); setFormOpen(true); } },
                  { label: t('Delete'), icon: 'delete', variant: 'danger', onClick: (s) => setDeleting(s) },
                ]
              : undefined
          }
          toolbar={
            <div className="flex flex-wrap gap-2">
              <Select
                aria-label={t('Exam')}
                value={examId}
                onChange={(e) => { setExamId(e.target.value); setClassFilter(''); }}
                options={(exams.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
              />
              {classNames.length > 1 && (
                <Select aria-label={t('Class')} value={classFilter} onChange={(e) => setClassFilter(e.target.value)} placeholder={t('All classes')} options={classNames.map((c) => ({ value: c, label: c }))} />
              )}
            </div>
          }
          exportFileName={`exam-timetable-${examName}`}
          emptyTitle={t('No exam slots scheduled')}
          emptyDescription={canManage ? t('Add the first sitting for this exam.') : t('The routine for this exam has not been published for your class yet.')}
          pageSize={50}
        />
      )}

      {canManage && (
        <ExamSlotFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} slot={editing} exams={exams.data ?? []} defaultExamId={examId} />
      )}
      <ConfirmModal
        isOpen={!!deleting}
        title={t('Delete exam slot?')}
        message={deleting ? `${deleting.subjectName} · ${deleting.className} · ${formatDate(deleting.date)}` : ''}
        confirmLabel={t('Delete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        isLoading={del.isPending}
      />
      <Modal isOpen={printOpen} onClose={() => setPrintOpen(false)} size="full">
        <TimetablePrint examName={examName} slots={items} />
      </Modal>
    </div>
  );
};

export default ExamTimetable;
