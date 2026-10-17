import React from 'react';
import toast from 'react-hot-toast';
import { Save, Wand2 } from 'lucide-react';
import { Badge, Button, Card, ErrorState, Select, SkeletonText } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatNumber, useT } from '@/i18n';
import { apiErrorMessage, useAssessSections, useAutoAward, useGrid, usePeriods, useSaveGrid, type Grid } from '../character.api';
import { bulkFill, diffComments, diffScores, moveCell, overallPercent, parseCell, type ScoreMap } from '../character.logic';
import { useBi } from '../shared';

// =============================================================================
// T2 score grid — a class/section roster × active traits. Fast keyboard entry:
// type a digit, arrows/Enter move, Tab follows the row. "Fill all with N"
// sets every cell (or only empty ones). Only changed cells are sent.
// =============================================================================

const GridEditor: React.FC<{ grid: Grid; periodId: string; sectionId: string }> = ({ grid, periodId, sectionId }) => {
  const t = useT();
  const bi = useBi();
  const save = useSaveGrid();
  const auto = useAutoAward();
  const original = React.useMemo<ScoreMap>(() => Object.fromEntries(grid.students.map((s) => [s.id, { ...s.scores }])), [grid]);
  const originalComments = React.useMemo(() => Object.fromEntries(grid.students.map((s) => [s.id, s.comment])), [grid]);
  const [scores, setScores] = React.useState<ScoreMap>(original);
  const [text, setText] = React.useState<Record<string, string>>({});
  const [comments, setComments] = React.useState<Record<string, string>>({});
  const [invalid, setInvalid] = React.useState<Set<string>>(new Set());
  const [fill, setFill] = React.useState('');
  const [onlyEmpty, setOnlyEmpty] = React.useState(true);
  const cells = React.useRef<Map<string, HTMLInputElement>>(new Map());

  React.useEffect(() => {
    setScores(original);
    setText({});
    setComments(Object.fromEntries(Object.entries(originalComments).map(([k, v]) => [k, v ?? ''])));
    setInvalid(new Set());
  }, [original, originalComments]);

  const traits = grid.traits;
  const studentIds = grid.students.map((s) => s.id);
  const changes = diffScores(original, scores);
  const commentChanges = diffComments(originalComments, comments);
  const dirty = changes.length + commentChanges.length;
  const readOnly = !grid.canEdit;

  const setCell = (sid: string, tid: string, raw: string) => {
    const k = `${sid}:${tid}`;
    setText((x) => ({ ...x, [k]: raw }));
    const trait = traits.find((tr) => tr.id === tid)!;
    const v = parseCell(raw, trait);
    setInvalid((s) => {
      const n = new Set(s);
      if (v === 'invalid') n.add(k);
      else n.delete(k);
      return n;
    });
    if (v !== 'invalid') setScores((x) => ({ ...x, [sid]: { ...(x[sid] ?? {}), [tid]: v } }));
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const to = moveCell({ row, col }, e.key, grid.students.length, traits.length);
    if (!to) return;
    e.preventDefault();
    cells.current.get(`${to.row}:${to.col}`)?.focus();
    cells.current.get(`${to.row}:${to.col}`)?.select();
  };

  const applyFill = () => {
    const n = Number(fill);
    if (!Number.isInteger(n)) return;
    setScores((cur) => bulkFill(cur, studentIds, traits, n, { onlyEmpty }));
    setText({});
    setInvalid(new Set());
  };

  const submit = () => {
    if (invalid.size) {
      toast.error(t('Fix the highlighted scores first'));
      return;
    }
    save.mutate(
      { periodId, sectionId, scores: changes, comments: commentChanges },
      {
        onSuccess: () => toast.success(t('Scores saved')),
        onError: (err) => toast.error(apiErrorMessage(err, t('Could not save scores'))),
      },
    );
  };

  const runAuto = () =>
    auto.mutate(
      { periodId, sectionId },
      {
        onSuccess: (r) => toast.success(t('{n} badges awarded automatically', { n: formatNumber(r.awarded) })),
        onError: (err) => toast.error(apiErrorMessage(err, t('Could not check automatic badges'))),
      },
    );

  if (traits.length === 0) return <EmptyState title={t('No traits yet')} description={t('An admin adds traits in the Setup tab first.')} />;
  if (grid.students.length === 0) return <EmptyState title={t('No students in this section')} />;

  return (
    <div className="space-y-4">
      {readOnly && <p className="text-sm text-amber-700 dark:text-amber-400">{t('This period is locked. Scores can no longer be changed.')}</p>}
      {!readOnly && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-xs text-slate-500 mb-1">{t('Fill all with')}</span>
            <input className="input-field w-20" inputMode="numeric" value={fill} onChange={(e) => setFill(e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label={t('Fill all with')} />
          </label>
          <label className="flex items-center gap-1.5 text-sm pb-2">
            <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
            {t('Only empty cells')}
          </label>
          <Button variant="secondary" onClick={applyFill} disabled={!fill}>{t('Apply')}</Button>
          <div className="flex-1" />
          <Button variant="secondary" leftIcon={<Wand2 className="w-4 h-4" />} onClick={runAuto} isLoading={auto.isPending} disabled={dirty > 0} title={dirty > 0 ? t('Save first') : undefined}>
            {t('Check automatic badges')}
          </Button>
          <Button leftIcon={<Save className="w-4 h-4" />} onClick={submit} isLoading={save.isPending} disabled={dirty === 0}>
            {dirty > 0 ? t('Save {n} changes', { n: formatNumber(dirty) }) : t('Saved')}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
        <table className="min-w-full text-sm">
          <caption className="sr-only">{t('Character scores')}</caption>
          <thead className="bg-slate-50 dark:bg-white/4">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 text-left px-3 py-2 font-semibold min-w-[10rem]">{t('Student')}</th>
              {traits.map((tr) => (
                <th key={tr.id} scope="col" className="px-2 py-2 font-semibold text-center whitespace-nowrap" title={tr.description ?? undefined}>
                  {bi(tr.name, tr.nameBn)}
                  <span className="block text-[11px] font-normal text-slate-500">{tr.scaleMin}–{tr.scaleMax}</span>
                </th>
              ))}
              <th scope="col" className="px-2 py-2 font-semibold text-center">{t('Overall')}</th>
              <th scope="col" className="px-2 py-2 font-semibold text-left min-w-[12rem]">{t('Comment (optional)')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/6">
            {grid.students.map((s, row) => {
              const ov = overallPercent(scores[s.id] as Record<string, number | null>, traits);
              return (
                <tr key={s.id}>
                  <th scope="row" className="sticky left-0 z-10 bg-white dark:bg-slate-900 text-left px-3 py-1.5 font-medium">
                    <span className="block truncate max-w-[12rem]">{s.firstName} {s.lastName}</span>
                    <span className="block text-xs text-slate-500">{s.rollNumber ? `${t('Roll')} ${s.rollNumber}` : s.studentId}{s.badgesThisPeriod > 0 ? ` · ${formatNumber(s.badgesThisPeriod)} ★` : ''}</span>
                  </th>
                  {traits.map((tr, col) => {
                    const k = `${s.id}:${tr.id}`;
                    const val = text[k] ?? (scores[s.id]?.[tr.id] != null ? String(scores[s.id][tr.id]) : '');
                    const bad = invalid.has(k);
                    return (
                      <td key={tr.id} className="px-1 py-1 text-center">
                        <input
                          ref={(el) => {
                            if (el) cells.current.set(`${row}:${col}`, el);
                            else cells.current.delete(`${row}:${col}`);
                          }}
                          className={`w-12 h-9 text-center rounded-md border tabular-nums bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 ${bad ? 'border-red-500 text-red-700' : 'border-slate-200 dark:border-white/10'}`}
                          inputMode="numeric"
                          maxLength={2}
                          value={val}
                          disabled={readOnly}
                          aria-label={`${s.firstName} ${s.lastName} — ${bi(tr.name, tr.nameBn)}`}
                          aria-invalid={bad || undefined}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => onKey(e, row, col)}
                          onChange={(e) => setCell(s.id, tr.id, e.target.value)}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center tabular-nums font-semibold">{ov == null ? '—' : `${formatNumber(ov)}%`}</td>
                  <td className="px-2 py-1">
                    <input
                      className="input-field h-9 text-sm"
                      maxLength={1000}
                      value={comments[s.id] ?? ''}
                      disabled={readOnly}
                      aria-label={t('Comment for {name}', { name: `${s.firstName} ${s.lastName}` })}
                      onChange={(e) => setComments((c) => ({ ...c, [s.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('Tip: type a number, then use the arrow keys or Enter to move. Leave a cell empty to clear it.')}</p>
    </div>
  );
};

const ScoresTab: React.FC = () => {
  const t = useT();
  const periods = usePeriods();
  const sections = useAssessSections();
  const [periodId, setPeriodId] = React.useState('');
  const [sectionId, setSectionId] = React.useState('');

  React.useEffect(() => {
    if (!periodId && periods.data?.length) setPeriodId(periods.data[0].id);
  }, [periods.data, periodId]);
  React.useEffect(() => {
    if (!sectionId && sections.data?.length) setSectionId(sections.data[0].id);
  }, [sections.data, sectionId]);

  const grid = useGrid(periodId, sectionId);

  if (periods.isLoading || sections.isLoading) return <SkeletonText lines={6} />;
  if (periods.isError || sections.isError) return <ErrorState title={t('Could not load periods or sections')} onRetry={() => { periods.refetch(); sections.refetch(); }} />;
  if (!periods.data?.length) return <EmptyState title={t('No assessment periods yet')} description={t('An admin creates a weekly, monthly or term period in the Setup tab.')} />;
  if (!sections.data?.length) return <EmptyState title={t('No sections assigned to you')} description={t('Ask an admin to make you class teacher of a section, or add you to the timetable.')} />;

  return (
    <Card className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label={t('Assessment period')}
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          options={periods.data.map((p) => ({ value: p.id, label: `${p.name}${p.locked ? ` (${t('Locked')})` : ''}` }))}
        />
        <Select
          label={t('Class / section')}
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          options={sections.data.map((s) => ({ value: s.id, label: `${s.className} — ${s.name} (${s.studentCount})` }))}
        />
      </div>
      {grid.isLoading ? <SkeletonText lines={8} /> : grid.isError || !grid.data ? (
        <ErrorState title={t('Could not load the score sheet')} onRetry={() => grid.refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="neutral">{grid.data.section.className} · {grid.data.section.name}</Badge>
            <Badge variant="neutral">{t('{n} students', { n: formatNumber(grid.data.students.length) })}</Badge>
          </div>
          <GridEditor grid={grid.data} periodId={periodId} sectionId={sectionId} />
        </>
      )}
    </Card>
  );
};

export default ScoresTab;
