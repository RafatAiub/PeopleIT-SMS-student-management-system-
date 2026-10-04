import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Eye, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { Alert, Badge, Button, Card, ErrorState, Input, Select } from '../../components/ui';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { EmptyState } from '../../components/common/EmptyState';
import { useT, formatNumber } from '../../i18n';
import {
  errorMessage,
  useClassOptions,
  useExamOptions,
  useSectionOptions,
  useSessionYears,
} from '../results/academicLookups';
import {
  PROMOTION_STATUSES,
  useCandidates,
  useExecutePromotion,
  usePreviewPromotion,
  type Candidate,
  type PlanResult,
  type PromotionRequest,
  type PromotionStatus,
} from './promotion.queries';
import { PromotionPreviewModal, STATUS_VARIANT, statusLabel } from './PromotionPreviewModal';

type Choice = PromotionStatus | 'SKIP';

export const PromotionRunTab: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const t = useT();
  const years = useSessionYears();
  const classes = useClassOptions();
  const exams = useExamOptions();

  const [fromYear, setFromYear] = useState('');
  const [fromClass, setFromClass] = useState('');
  const [fromSection, setFromSection] = useState('');
  const [examId, setExamId] = useState('');
  const [toYear, setToYear] = useState('');
  const [toClass, setToClass] = useState('');
  const [toSection, setToSection] = useState('');
  const [note, setNote] = useState('');
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [plan, setPlan] = useState<PlanResult | null>(null);

  const fromSections = useSectionOptions(fromClass || null);
  const toSections = useSectionOptions(toClass || null);

  // Default the source to the current session.
  useEffect(() => {
    if (!fromYear && years.data?.length) {
      const current = years.data.find((y) => y.isCurrent) ?? years.data[0];
      setFromYear(current.id);
    }
  }, [years.data, fromYear]);

  const ready = !!fromYear && !!fromClass;
  const candidates = useCandidates(
    {
      fromAcademicYearId: fromYear,
      fromClassId: fromClass,
      fromSectionId: fromSection || undefined,
      examId: examId || undefined,
      toAcademicYearId: toYear || undefined,
    },
    ready,
  );

  // Reset per-student choices from the server's suggestion whenever the list changes.
  useEffect(() => {
    const next: Record<string, Choice> = {};
    for (const c of candidates.data?.items ?? []) {
      next[c.id] = c.alreadyProcessed ? 'SKIP' : c.suggestedStatus ?? 'PROMOTED';
    }
    setChoices(next);
  }, [candidates.data]);

  const preview = usePreviewPromotion();
  const execute = useExecutePromotion();

  const yearOptions = (years.data ?? []).map((y) => ({ value: y.id, label: `${y.label}${y.isCurrent ? ` (${t('current')})` : ''}` }));
  const classOptions = (classes.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  const decisions = useMemo(
    () =>
      Object.entries(choices)
        .filter(([, v]) => v !== 'SKIP')
        .map(([studentId, status]) => ({ studentId, status: status as PromotionStatus })),
    [choices],
  );
  const needsClass = decisions.some((d) => d.status === 'PROMOTED');
  const sameYear = !!toYear && toYear === fromYear;
  const canPreview = ready && !!toYear && !sameYear && decisions.length > 0 && (!needsClass || !!toClass);

  const request = (): PromotionRequest => ({
    fromAcademicYearId: fromYear,
    fromClassId: fromClass,
    fromSectionId: fromSection || null,
    toAcademicYearId: toYear,
    toClassId: toClass || null,
    toSectionId: toSection || null,
    note: note.trim() || null,
    decisions,
  });

  const handlePreview = async () => {
    try {
      setPlan(await preview.mutateAsync(request()));
    } catch (err) {
      toast.error(errorMessage(err, t('Could not build the preview')));
    }
  };

  const handleConfirm = async () => {
    try {
      const res = await execute.mutateAsync(request());
      toast.success(t('{n} student(s) processed', { n: res.processed }));
      if (res.skipped.length) toast(t('{n} skipped', { n: res.skipped.length }));
      setPlan(null);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, t('Promotion failed — nothing was changed')));
    }
  };

  const setAll = (ids: string[], value: Choice) => setChoices((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, value])) }));

  const choiceOptions = [
    ...PROMOTION_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s) })),
    { value: 'SKIP', label: t('Skip') },
  ];

  const columns: Column<Candidate>[] = [
    {
      key: 'name',
      header: t('Student'),
      primary: true,
      render: (c) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-white">{c.name}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {c.studentCode}
            {c.rollNumber ? ` · ${t('Roll')} ${c.rollNumber}` : ''}
            {c.section ? ` · ${c.section.name}` : ''}
            {c.yearUnassigned ? ` · ${t('no session set')}` : ''}
          </div>
        </div>
      ),
      exportValue: (c) => `${c.name} (${c.studentCode})`,
    },
    {
      key: 'result',
      header: t('Result'),
      render: (c) =>
        c.result ? (
          <div className="text-sm">
            <span className="tabular-nums">{formatNumber(c.result.totalObtained)}/{formatNumber(c.result.totalMax)} · {formatNumber(c.result.percent)}%</span>{' '}
            <Badge variant={c.result.passed ? 'success' : 'danger'}>{c.result.passed ? t('Pass') : t('Fail')}</Badge>
          </div>
        ) : (
          <span className="text-xs text-slate-500">{examId ? t('No result') : '—'}</span>
        ),
      exportValue: (c) => (c.result ? `${c.result.percent}% ${c.result.passed ? 'Pass' : 'Fail'}` : ''),
    },
    {
      key: 'decision',
      header: t('Decision'),
      render: (c) =>
        c.alreadyProcessed ? (
          <Badge variant={STATUS_VARIANT[c.alreadyProcessed.status]}>
            {t('Already {status}', { status: statusLabel(t, c.alreadyProcessed.status) })}
          </Badge>
        ) : (
          <Select
            aria-label={t('Decision for {name}', { name: c.name })}
            value={choices[c.id] ?? 'PROMOTED'}
            onChange={(e) => setChoices((prev) => ({ ...prev, [c.id]: e.target.value as Choice }))}
            options={choiceOptions}
            className="min-w-[9rem]"
          />
        ),
      exportValue: (c) => choices[c.id] ?? '',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] items-start">
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('From')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={t('Session')} value={fromYear} onChange={(e) => setFromYear(e.target.value)} placeholder={t('Select session')} options={yearOptions} required />
            <Select label={t('Class')} value={fromClass} onChange={(e) => { setFromClass(e.target.value); setFromSection(''); }} placeholder={t('Select class')} options={classOptions} required />
            <Select label={t('Section')} value={fromSection} onChange={(e) => setFromSection(e.target.value)} placeholder={t('All sections')} options={(fromSections.data ?? []).map((s) => ({ value: s.id, label: s.name }))} disabled={!fromClass} />
            <Select
              label={t('Exam for results (optional)')}
              value={examId}
              onChange={(e) => setExamId(e.target.value)}
              placeholder={t('None')}
              options={(exams.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
              helperText={t('Suggests Promoted for pass, Retained for fail.')}
            />
          </div>
        </Card>
        <div className="hidden lg:flex items-center justify-center pt-16" aria-hidden>
          <ArrowRight className="w-6 h-6 text-slate-400" />
        </div>
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('To')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t('Session')}
              value={toYear}
              onChange={(e) => setToYear(e.target.value)}
              placeholder={t('Select session')}
              options={yearOptions}
              required
              error={sameYear ? t('Choose a different session') : undefined}
            />
            <Select
              label={t('Class (for promoted)')}
              value={toClass}
              onChange={(e) => { setToClass(e.target.value); setToSection(''); }}
              placeholder={t('Select class')}
              options={classOptions}
              error={needsClass && !toClass && toYear ? t('Required for promoted students') : undefined}
            />
            <Select label={t('Section')} value={toSection} onChange={(e) => setToSection(e.target.value)} placeholder={t('No section')} options={(toSections.data ?? []).map((s) => ({ value: s.id, label: s.name }))} disabled={!toClass} />
            <Input label={t('Note (optional)')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('Retained students stay in their class for the new session. Graduated and transferred students leave the active roll.')}
          </p>
        </Card>
      </div>

      {years.isError || classes.isError ? (
        <ErrorState onRetry={() => { years.refetch(); classes.refetch(); }} />
      ) : !ready ? (
        <EmptyState icon={<Users className="w-6 h-6" />} title={t('Choose a session and class')} description={t('Active students of that class appear here.')} />
      ) : candidates.isError ? (
        <ErrorState onRetry={() => candidates.refetch()} />
      ) : (
        <>
          {(years.data ?? []).length < 2 && (
            <Alert tone="warning">{t('Create the next session year first (Session years) — promotion moves students into a different session.')}</Alert>
          )}
          <DataTable
            data={candidates.data?.items ?? []}
            columns={columns}
            isLoading={candidates.isLoading}
            selectable
            bulkActions={(selected, clear) => (
              <div className="flex flex-wrap gap-2">
                {choiceOptions.map((o) => (
                  <Button
                    key={o.value}
                    size="xs"
                    variant="secondary"
                    onClick={() => {
                      setAll(selected.filter((c) => !c.alreadyProcessed).map((c) => c.id), o.value as Choice);
                      clear();
                    }}
                  >
                    {t('Mark {label}', { label: o.label })}
                  </Button>
                ))}
              </div>
            )}
            exportFileName="promotion-candidates"
            emptyTitle={t('No active students in this class')}
            emptyDescription={t('Check the session, class and section.')}
            pageSize={50}
          />
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-sm text-slate-600 dark:text-slate-400">{t('{n} student(s) selected for processing', { n: decisions.length })}</span>
            <Button leftIcon={<Eye className="w-4 h-4" />} onClick={handlePreview} disabled={!canPreview} isLoading={preview.isPending}>
              {t('Preview')}
            </Button>
          </div>
        </>
      )}

      <PromotionPreviewModal plan={plan} isOpen={!!plan} onClose={() => setPlan(null)} onConfirm={handleConfirm} isExecuting={execute.isPending} />
    </div>
  );
};
