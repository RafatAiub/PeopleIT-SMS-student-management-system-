import React from 'react';
import { PrintLayout, SignatureLines } from '../../components/print/PrintLayout';
import { useT, formatDate, formatNumber } from '../../i18n';
import type { Transcript } from './insights.queries';

const fmt2 = (n: number) => formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Printable academic transcript (PrintLayout; PDF via the browser's Print → Save as PDF). */
export const TranscriptDocument: React.FC<{ data: Transcript }> = ({ data }) => {
  const t = useT();
  const s = data.student;
  const inst = data.institution;
  return (
    <PrintLayout
      title={t('Academic Transcript')}
      reference={`${t('Student ID')}: ${s.studentId}`}
      date={data.generatedAt}
      institution={
        inst
          ? { name: inst.name, logoUrl: inst.logoUrl, address: inst.address ?? undefined, phone: inst.phone ?? undefined, email: inst.email ?? undefined }
          : undefined
      }
      footer={
        <>
          <p>
            {t('Grading scale: {name}. GPA is 0.00 for an exam with any failed subject.', { name: data.scale.name })}{' '}
            {t('This is a computer-generated transcript.')}
          </p>
          <SignatureLines labels={[t('Prepared by'), t('Exam Controller'), t('Principal')]} />
        </>
      }
    >
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 mb-6 text-xs">
        {[
          [t('Name'), `${s.firstName} ${s.lastName}`],
          [t('Student ID'), s.studentId],
          [t('Roll'), s.rollNumber ?? '—'],
          [t('Current class'), s.class ? `${s.class.name}${s.section ? ` – ${s.section.name}` : ''}` : '—'],
          [t('Date of birth'), s.dateOfBirth ? formatDate(s.dateOfBirth) : '—'],
          [t('Guardian'), s.guardianName ?? '—'],
          [t('Admission date'), s.admissionDate ? formatDate(s.admissionDate) : '—'],
          [t('Group'), s.department ?? '—'],
          [t('Status'), s.status],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-slate-500 uppercase tracking-wide text-[10px]">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      {data.sessions.length === 0 ? (
        <p className="text-slate-500">{t('No exam results recorded.')}</p>
      ) : (
        data.sessions.map((bucket) => (
          <section key={bucket.session?.id ?? 'none'} className="mb-6 break-inside-avoid-page">
            <h2 className="text-sm font-bold uppercase tracking-wide border-b border-slate-300 pb-1 mb-3">
              {bucket.session ? t('Session {label}', { label: bucket.session.label }) : t('Other exams')}
            </h2>
            {bucket.exams.map((e) => (
              <div key={e.exam.id} className="mb-4 break-inside-avoid">
                <div className="flex flex-wrap justify-between gap-2 mb-1">
                  <h3 className="font-semibold">{e.exam.name}</h3>
                  <span className="text-xs text-slate-600">
                    {formatDate(e.exam.startDate)} – {formatDate(e.exam.endDate)}
                  </span>
                </div>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2 py-1 text-left">{t('Subject')}</th>
                      <th className="border border-slate-300 px-2 py-1 text-right">{t('Marks')}</th>
                      <th className="border border-slate-300 px-2 py-1 text-right">%</th>
                      <th className="border border-slate-300 px-2 py-1 text-center">{t('Grade')}</th>
                      <th className="border border-slate-300 px-2 py-1 text-right">{t('Point')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.subjects.map((sub) => (
                      <tr key={sub.subject}>
                        <td className="border border-slate-300 px-2 py-1">{sub.subject}</td>
                        <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                          {formatNumber(sub.marksObtained)} / {formatNumber(sub.maxMarks)}
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">{fmt2(sub.percent)}</td>
                        <td className="border border-slate-300 px-2 py-1 text-center font-semibold">{sub.grade}</td>
                        <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">{fmt2(sub.gradePoint)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold bg-slate-50">
                      <td className="border border-slate-300 px-2 py-1">{t('Total')}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                        {formatNumber(e.summary.totalObtained)} / {formatNumber(e.summary.totalMax)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">{fmt2(e.summary.percent)}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center">{e.summary.grade}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                        {t('GPA')} {fmt2(e.summary.gpa)} · {e.summary.passed ? t('Pass') : t('Fail')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        ))
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-slate-300 pt-3">
        <div><div className="text-slate-500">{t('Exams')}</div><div className="font-semibold">{data.overall.exams}</div></div>
        <div><div className="text-slate-500">{t('Exams passed')}</div><div className="font-semibold">{data.overall.passedExams}</div></div>
        <div><div className="text-slate-500">{t('Cumulative %')}</div><div className="font-semibold">{fmt2(data.overall.percent)}</div></div>
        <div><div className="text-slate-500">{t('Average GPA')}</div><div className="font-semibold">{fmt2(data.overall.averageGpa)}</div></div>
      </div>
    </PrintLayout>
  );
};
