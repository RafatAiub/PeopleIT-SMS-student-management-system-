import React, { useCallback, useState } from 'react';
import { Printer, QrCode, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, ErrorState, Input, PageHeader, Skeleton, Tabs, Alert } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT, formatNumber } from '@/i18n';
import ClassSectionPicker from '../subject-attendance/ClassSectionPicker';
import { useQrTokens } from './qr.queries';

const PAGE_SIZE = 48;

/** SUPER_ADMIN / ADMIN — printable check-in QR codes (GET /qr/tokens). */
export default function QrCodesPage() {
  const t = useT();
  const [type, setType] = useState<'STUDENT' | 'STAFF'>('STUDENT');
  const [className, setClassName] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const onClassChange = useCallback((c: string, s: string) => {
    setClassName(c);
    setSectionName(s);
    setPage(1);
  }, []);

  const { data, isLoading, isError, refetch } = useQrTokens({
    type,
    className: type === 'STUDENT' ? className : undefined,
    sectionName: type === 'STUDENT' ? sectionName || undefined : undefined,
    search: search.trim() || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="no-print">
        <PageHeader
          title={t('Check-in QR Codes')}
          description={t('Print QR codes for the check-in kiosk. Each code is signed for your institution and can’t be used elsewhere.')}
          actions={
            <Button leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()} disabled={!data?.items.length}>
              {t('Print this page')}
            </Button>
          }
        />
      </div>

      <div className="no-print space-y-4">
        <Tabs
          tabs={[
            { id: 'STUDENT', label: t('Students') },
            { id: 'STAFF', label: t('Staff') },
          ]}
          value={type}
          onChange={(id) => { setType(id as 'STUDENT' | 'STAFF'); setPage(1); }}
          variant="pills"
        />
        <div className="glass-card rounded-2xl p-4 flex flex-wrap items-end gap-3">
          {type === 'STUDENT' && (
            <ClassSectionPicker isTeacher={false} className={className} sectionName={sectionName} onChange={onClassChange} idPrefix="qr-codes" />
          )}
          <Input
            label={t('Search')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={type === 'STUDENT' ? t('Name or student ID') : t('Name or email')}
            containerClassName="min-w-[200px] flex-1"
          />
        </div>
        <Alert tone="info">
          {t('ID-card QR codes also work at the kiosk. Staff and students can show their own code from “My check-in QR”.')}
        </Alert>
      </div>

      {isError ? (
        <div className="glass-card rounded-2xl"><ErrorState message={t('Could not load QR codes.')} onRetry={() => refetch()} /></div>
      ) : isLoading && (type === 'STAFF' || className) ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-60 rounded-xl" />)}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="glass-card rounded-2xl">
          <EmptyState icon={<QrCode />} title={t('No people found')} description={type === 'STUDENT' ? t('Pick a class with active students.') : t('No active staff accounts.')} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
            {data.items.map((p) => (
              <div key={p.id} className="glass-card rounded-xl p-3 text-center break-inside-avoid print:border print:border-slate-300 print:shadow-none">
                {p.qrDataUrl ? (
                  <img src={p.qrDataUrl} alt={t('Check-in QR for {name}', { name: p.name })} className="w-full max-w-[180px] mx-auto aspect-square" />
                ) : (
                  <div className="aspect-square flex items-center justify-center text-xs text-slate-500">{t('QR image unavailable')}</div>
                )}
                <p className="mt-2 font-semibold text-sm text-slate-900 dark:text-white truncate">{p.name}</p>
                <p className="text-xs text-slate-500 truncate">{[p.code, p.subtitle].filter(Boolean).join(' · ')}</p>
              </div>
            ))}
          </div>
          {pages > 1 && (
            <div className="no-print flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" leftIcon={<ChevronLeft className="w-4 h-4" />} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t('Previous')}
              </Button>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {t('Page {page} of {pages}', { page: formatNumber(page), pages: formatNumber(pages) })}
              </span>
              <Button variant="outline" size="sm" rightIcon={<ChevronRight className="w-4 h-4" />} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                {t('Next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
