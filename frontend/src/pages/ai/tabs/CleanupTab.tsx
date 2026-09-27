import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy as CopyIcon, UserX, PhoneOff } from 'lucide-react';
import apiClient from '../../../api/client';
import { Alert, Badge, Card, CardHeader, StatCard, Tabs, ErrorState, SkeletonStatGrid } from '../../../components/ui';
import { DataTable, type Column } from '../../../components/DataTable/DataTable';
import { useT, formatDate, formatNumber } from '../../../i18n';
import { errorMessage } from '../aiUtils';

interface StudentRef {
  id: string;
  registrationNumber: string;
  name: string;
  dateOfBirth?: string | null;
  className?: string | null;
  sectionName?: string | null;
  guardianCount?: number;
}
interface DuplicateGroup {
  id: string;
  reason: 'SAME_NAME_AND_DOB' | 'SAME_GUARDIAN_PHONE_SIMILAR_NAME';
  confidence: 'HIGH' | 'MEDIUM';
  detail: string;
  students: StudentRef[];
}
interface GuardianIssue {
  id: string;
  name: string;
  phone: string | null;
  issue: 'MISSING' | 'INVALID';
  students: StudentRef[];
}
interface Section<T> {
  items: T[];
  total: number;
}
interface CleanupResponse {
  duplicates: Section<DuplicateGroup>;
  studentsMissingGuardian: Section<StudentRef>;
  guardiansMissingPhone: Section<GuardianIssue>;
}

const StudentLink = ({ s }: { s: StudentRef }) => (
  <Link to={`/students/${s.id}`} className="font-medium text-primary-700 dark:text-primary-300 hover:underline">
    {s.name}
  </Link>
);

export default function CleanupTab() {
  const t = useT();
  const [section, setSection] = useState('duplicates');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const query = useQuery({
    queryKey: ['ai', 'cleanup', { page, pageSize }],
    queryFn: async (): Promise<CleanupResponse> => (await apiClient.get('/ai/data-cleanup', { params: { page, pageSize } })).data.data,
    placeholderData: keepPreviousData,
  });

  if (query.isError) return <ErrorState title={t('Could not load clean-up suggestions')} message={errorMessage(query.error, '')} onRetry={() => query.refetch()} />;
  const d = query.data;

  const dupColumns: Column<DuplicateGroup>[] = [
    {
      key: 'students',
      header: t('Records'),
      primary: true,
      sortable: false,
      render: (g) => (
        <div className="space-y-1">
          {g.students.map((s) => (
            <div key={s.id} className="text-sm">
              <StudentLink s={s} /> <span className="text-xs text-slate-500">{s.registrationNumber}{s.className ? ` · ${s.className}` : ''}{s.dateOfBirth ? ` · ${formatDate(s.dateOfBirth)}` : ''}</span>
            </div>
          ))}
        </div>
      ),
      exportValue: (g) => g.students.map((s) => `${s.name} (${s.registrationNumber})`).join('; '),
    },
    { key: 'detail', header: t('Why'), accessor: 'detail' },
    { key: 'confidence', header: t('Confidence'), accessor: 'confidence', render: (g) => <Badge variant={g.confidence === 'HIGH' ? 'danger' : 'warning'}>{g.confidence === 'HIGH' ? t('High') : t('Medium')}</Badge> },
  ];

  const missingColumns: Column<StudentRef>[] = [
    { key: 'name', header: t('Student'), accessor: 'name', primary: true, render: (s) => <StudentLink s={s} /> },
    { key: 'registrationNumber', header: t('ID'), accessor: 'registrationNumber' },
    { key: 'className', header: t('Class'), accessor: 'className', render: (s) => `${s.className ?? '—'}${s.sectionName ? ` ${s.sectionName}` : ''}` },
  ];

  const phoneColumns: Column<GuardianIssue>[] = [
    { key: 'name', header: t('Guardian'), accessor: 'name', primary: true },
    { key: 'phone', header: t('Phone'), accessor: 'phone', render: (g) => (g.issue === 'MISSING' ? <Badge variant="danger">{t('Missing')}</Badge> : <span>{g.phone} <Badge variant="warning">{t('Invalid')}</Badge></span>) },
    {
      key: 'students',
      header: t('Children'),
      sortable: false,
      render: (g) => (g.students.length ? <span className="flex flex-wrap gap-x-2">{g.students.map((s) => <StudentLink key={s.id} s={s} />)}</span> : '—'),
      exportValue: (g) => g.students.map((s) => s.name).join('; '),
    },
  ];

  const pager = {
    serverPagination: true as const,
    page,
    pageSize,
    onPageChange: setPage,
    onPageSizeChange: (n: number) => { setPageSize(n); setPage(1); },
    isLoading: query.isLoading,
  };

  return (
    <div className="space-y-4">
      <Alert tone="info">{t('Suggestions only — nothing is merged or changed automatically. Open a profile to fix the record.')}</Alert>
      {query.isLoading || !d ? (
        <SkeletonStatGrid count={3} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label={t('Possible duplicates')} value={formatNumber(d.duplicates.total)} icon={<CopyIcon className="w-5 h-5" />} tone="warning" onClick={() => { setSection('duplicates'); setPage(1); }} />
          <StatCard label={t('Students without guardian')} value={formatNumber(d.studentsMissingGuardian.total)} icon={<UserX className="w-5 h-5" />} tone="danger" onClick={() => { setSection('missing'); setPage(1); }} />
          <StatCard label={t('Guardians without valid phone')} value={formatNumber(d.guardiansMissingPhone.total)} icon={<PhoneOff className="w-5 h-5" />} tone="info" onClick={() => { setSection('phone'); setPage(1); }} />
        </div>
      )}

      <Card flush>
        <div className="px-4 pt-3">
          <Tabs
            value={section}
            onChange={(v) => { setSection(v); setPage(1); }}
            variant="pills"
            tabs={[
              { id: 'duplicates', label: t('Duplicates'), count: d?.duplicates.total },
              { id: 'missing', label: t('Missing guardian'), count: d?.studentsMissingGuardian.total },
              { id: 'phone', label: t('Guardian phone'), count: d?.guardiansMissingPhone.total },
            ]}
          />
        </div>
        <div className="p-2">
          {section === 'duplicates' && (
            <>
              <CardHeader className="px-3 pt-2" title={t('Likely duplicate students')} description={t('Same name and date of birth, or same guardian phone with a very similar name.')} />
              <DataTable<DuplicateGroup> data={d?.duplicates.items ?? []} columns={dupColumns} totalCount={d?.duplicates.total ?? 0} {...pager} exportFileName="ai-duplicates" emptyTitle={t('No likely duplicates')} />
            </>
          )}
          {section === 'missing' && (
            <DataTable<StudentRef> data={d?.studentsMissingGuardian.items ?? []} columns={missingColumns} totalCount={d?.studentsMissingGuardian.total ?? 0} {...pager} exportFileName="ai-missing-guardian" emptyTitle={t('Every student has a guardian')} />
          )}
          {section === 'phone' && (
            <DataTable<GuardianIssue> data={d?.guardiansMissingPhone.items ?? []} columns={phoneColumns} totalCount={d?.guardiansMissingPhone.total ?? 0} {...pager} exportFileName="ai-guardian-phone" emptyTitle={t('Every guardian has a valid phone')} />
          )}
        </div>
      </Card>
    </div>
  );
}
