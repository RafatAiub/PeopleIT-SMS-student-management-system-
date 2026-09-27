import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Badge, Card, Input, PageHeader } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate, useT } from '@/i18n';
import { CHANGELOG, TAG_LABEL, type ChangeTag } from './changelog.data';

const TAG_VARIANT: Record<ChangeTag, 'success' | 'info' | 'warning' | 'danger'> = {
  new: 'success',
  improved: 'info',
  fixed: 'warning',
  security: 'danger',
};

/** "What's new" — static changelog. Route: /help/whats-new (every signed-in role). */
const WhatsNew: React.FC = () => {
  const t = useT();
  const [q, setQ] = useState('');
  const entries = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return CHANGELOG;
    return CHANGELOG.filter((e) => [e.title, e.summary, ...e.items.map((i) => i.text)].some((s) => s.toLowerCase().includes(needle)));
  }, [q]);

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader
        title={t("What's new")}
        description={t('Recent improvements to PeopleNIT SMS.')}
        breadcrumbs={[{ label: t('Help'), to: '/help' }, { label: t("What's new") }]}
      />
      <Input type="search" aria-label={t('Search updates')} placeholder={t('Search updates…')} value={q} onChange={(e) => setQ(e.target.value)} />
      {entries.length === 0 ? (
        <EmptyState title={t('No matching updates')} description={t('Try a different word.')} />
      ) : (
        <ol className="relative space-y-4 border-l border-slate-200 dark:border-white/10 pl-5">
          {entries.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[27px] top-5 flex h-3 w-3 rounded-full bg-primary-600 ring-4 ring-white dark:ring-slate-900" aria-hidden />
              <Card>
                <p className="text-xs text-slate-500">{formatDate(e.date)}</p>
                <h2 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">{t(e.title)}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t(e.summary)}</p>
                <ul className="mt-3 space-y-2">
                  {e.items.map((it, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <Badge variant={TAG_VARIANT[it.tag]} className="shrink-0 mt-0.5">
                        {t(TAG_LABEL[it.tag])}
                      </Badge>
                      <span>{t(it.text)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ol>
      )}
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Sparkles className="w-4 h-4" />
        {t('Need help with a feature?')}{' '}
        <Link to="/help" className="link">
          {t('Open the help centre')}
        </Link>
      </p>
    </div>
  );
};

export default WhatsNew;
