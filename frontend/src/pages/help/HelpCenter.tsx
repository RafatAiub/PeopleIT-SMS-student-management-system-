import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, LifeBuoy, Search, Sparkles } from 'lucide-react';
import { Badge, Button, Card, Input, PageHeader } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { HELP_ARTICLES, HELP_CATEGORIES, searchArticles, type HelpArticle } from './helpArticles';
import { SimpleMarkdown } from './SimpleMarkdown';

const ArticleView: React.FC<{ article: HelpArticle; onBack: () => void }> = ({ article, onBack }) => {
  const t = useT();
  const related = HELP_ARTICLES.filter((a) => a.category === article.category && a.slug !== article.slug);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <Card>
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={onBack} className="-ml-2 mb-2">
          {t('All articles')}
        </Button>
        <Badge variant="neutral">{t(article.category)}</Badge>
        <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{t(article.title)}</h1>
        <p className="mt-1 mb-4 text-sm text-slate-500">{t(article.summary)}</p>
        {/* Article bodies are English source text; the lead may add Bangla versions later. */}
        <SimpleMarkdown source={article.body} />
      </Card>
      <div className="space-y-3">
        {related.length > 0 && (
          <Card>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('Related')}</h2>
            <ul className="space-y-1.5 text-sm">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link to={`/help?article=${r.slug}`} className="link">
                    {t(r.title)}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{t('Still stuck?')}</p>
          <Link to="/support" className="link text-sm">
            {t('Open a support ticket')}
          </Link>
        </Card>
      </div>
    </div>
  );
};

/**
 * Static, in-repo help centre. Route: /help (every signed-in role).
 * Deep link to an article with /help?article=<slug>.
 */
const HelpCenter: React.FC = () => {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const slug = params.get('article');
  const article = slug ? HELP_ARTICLES.find((a) => a.slug === slug) : undefined;

  const results = useMemo(() => searchArticles(q), [q]);
  const forYou = useMemo(() => (role ? HELP_ARTICLES.filter((a) => a.roles.includes(role)).slice(0, 4) : []), [role]);

  const open = (s: string) => {
    setParams({ article: s });
    window.scrollTo({ top: 0 });
  };

  if (article) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('Help centre')} breadcrumbs={[{ label: t('Help'), to: '/help' }, { label: t(article.title) }]} />
        <ArticleView article={article} onBack={() => setParams({})} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Help centre')}
        description={t('Step-by-step guides for everyday tasks.')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" leftIcon={<Sparkles className="w-4 h-4" />} onClick={() => navigate('/help/whats-new')}>
              {t("What's new")}
            </Button>
            <Button variant="outline" size="sm" leftIcon={<LifeBuoy className="w-4 h-4" />} onClick={() => navigate('/support')}>
              {t('Contact support')}
            </Button>
          </div>
        }
      />
      <Input
        type="search"
        aria-label={t('Search help articles')}
        placeholder={t('Search: admission, attendance, receipt, notice…')}
        leftIcon={<Search className="w-4 h-4" />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {slug && !article && <p className="text-sm text-amber-700">{t('That article was not found — here are all articles.')}</p>}

      {q.trim() ? (
        results.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {results.map((a) => (
              <ArticleCard key={a.slug} article={a} onOpen={open} />
            ))}
          </ul>
        ) : (
          <EmptyState title={t('No articles found')} description={t('Try another word, or open a support ticket.')} icon={<BookOpen className="w-6 h-6" />} />
        )
      ) : (
        <>
          {forYou.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('Suggested for you')}</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {forYou.map((a) => (
                  <ArticleCard key={a.slug} article={a} onOpen={open} />
                ))}
              </ul>
            </section>
          )}
          {HELP_CATEGORIES.map((cat) => {
            const items = HELP_ARTICLES.filter((a) => a.category === cat);
            if (!items.length) return null;
            return (
              <section key={cat}>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">{t(cat)}</h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {items.map((a) => (
                    <ArticleCard key={a.slug} article={a} onOpen={open} />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
};

const ArticleCard: React.FC<{ article: HelpArticle; onOpen: (slug: string) => void }> = ({ article, onOpen }) => {
  const t = useT();
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(article.slug)}
        className="glass-card-hover w-full h-full text-left p-4 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        <p className="font-medium text-slate-900 dark:text-slate-100">{t(article.title)}</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t(article.summary)}</p>
      </button>
    </li>
  );
};

export default HelpCenter;
