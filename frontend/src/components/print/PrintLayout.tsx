import React from 'react';
import { Printer } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../ui/Button';
import { formatDate } from '../../i18n';
import { cn } from '../../lib/cn';

/**
 * Shared printable document frame for receipts, invoices, report cards,
 * transcripts, payslips and certificates. Screen: a paper-like card with a
 * Print button. Print: A4, no app chrome (the layout's `.no-print` elements
 * are hidden by the print stylesheet), institution letterhead at top.
 */
interface PrintLayoutProps {
  /** Document title, e.g. "Money Receipt", "Report Card". */
  title: string;
  /** Reference line, e.g. "Receipt No. R-2026-00012". */
  reference?: React.ReactNode;
  /** Date shown on the document (defaults to today). */
  date?: string | Date;
  children: React.ReactNode;
  /** Footer, e.g. signatures or "computer-generated" note. */
  footer?: React.ReactNode;
  /** Institution details override (defaults to the signed-in institution). */
  institution?: { name?: string; logoUrl?: string | null; address?: string; phone?: string; email?: string };
  /** Hide the on-screen Print button (e.g. inside a modal that has its own). */
  hidePrintButton?: boolean;
  size?: 'a4' | 'a5' | 'card';
  className?: string;
}

export const PrintLayout: React.FC<PrintLayoutProps> = ({
  title,
  reference,
  date,
  children,
  footer,
  institution,
  hidePrintButton,
  size = 'a4',
  className,
}) => {
  const { institutionLogo, institutionName } = useUiStore();
  const { user } = useAuthStore();
  const name = institution?.name ?? institutionName ?? user?.institutionName ?? '';
  const logo = institution?.logoUrl ?? institutionLogo;
  const width = size === 'a4' ? 'max-w-[210mm]' : size === 'a5' ? 'max-w-[148mm]' : 'max-w-[90mm]';

  return (
    <div className="space-y-3">
      {!hidePrintButton && (
        <div className="no-print flex justify-end">
          <Button variant="secondary" size="sm" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      )}
      <article
        className={cn(
          'print-target mx-auto bg-white text-slate-900 border border-slate-200 rounded-lg shadow-sm p-8 sm:p-10 print:shadow-none print:border-0 print:rounded-none print:p-0 print:max-w-none',
          width,
          className
        )}
        style={{ colorScheme: 'light' }}
      >
        <header className="flex items-start justify-between gap-6 pb-5 border-b-2 border-slate-900">
          <div className="flex items-center gap-4 min-w-0">
            {logo && <img src={logo} alt="" className="w-14 h-14 object-contain" />}
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight">{name}</h1>
              {(institution?.address || institution?.phone || institution?.email) && (
                <p className="text-xs text-slate-600 mt-1">
                  {[institution?.address, institution?.phone, institution?.email].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold uppercase tracking-wide">{title}</p>
            {reference && <p className="text-xs text-slate-600 mt-1">{reference}</p>}
            <p className="text-xs text-slate-600 mt-0.5">{formatDate(date ?? new Date())}</p>
          </div>
        </header>
        <div className="py-6 text-sm">{children}</div>
        {footer && <footer className="pt-5 border-t border-slate-200 text-xs text-slate-600">{footer}</footer>}
      </article>
    </div>
  );
};

/** Signature line block for printed documents. */
export const SignatureLines: React.FC<{ labels: string[] }> = ({ labels }) => (
  <div className="grid gap-8 pt-10" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
    {labels.map((l) => (
      <div key={l} className="text-center">
        <div className="border-t border-slate-400 pt-1.5 text-xs text-slate-600">{l}</div>
      </div>
    ))}
  </div>
);
