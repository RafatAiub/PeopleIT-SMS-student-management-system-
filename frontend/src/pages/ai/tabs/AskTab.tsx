import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BookOpen, Send } from 'lucide-react';
import apiClient from '../../../api/client';
import { Alert, Button, Card, CardHeader, Input, AiGeneratedNotice } from '../../../components/ui';
import { useT } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import { DemoAlert, ModeChip } from '../aiShared';
import { errorMessage, type AiMode } from '../aiUtils';

interface AskResult extends AiMode {
  answer: string;
  found: boolean;
  citations: { id: string; title: string; category: string | null; excerpt: string }[];
  documentCount: number;
  retrieval?: 'semantic' | 'keyword';
}

export default function AskTab() {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const [question, setQuestion] = useState('');
  const ask = useMutation({
    mutationFn: async (q: string): Promise<AskResult> => (await apiClient.post('/ai/ask', { question: q })).data.data,
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader
          title={t('Ask the school knowledge base')}
          description={t('Answers come only from your school’s knowledge documents, with the sources cited.')}
          icon={<BookOpen className="w-4 h-4" />}
          actions={canManage ? <Link to="/ai/knowledge" className="text-sm font-medium text-primary-700 dark:text-primary-300 hover:underline">{t('Manage documents')}</Link> : undefined}
        />
        <form
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim().length >= 3) ask.mutate(question.trim());
          }}
        >
          <Input
            aria-label={t('Question')}
            containerClassName="flex-1"
            value={question}
            maxLength={500}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('e.g. What documents are needed for admission?')}
          />
          <Button type="submit" leftIcon={<Send className="w-4 h-4" />} isLoading={ask.isPending} disabled={question.trim().length < 3}>
            {t('Ask')}
          </Button>
        </form>
      </Card>

      {ask.isError && <Alert tone="danger">{errorMessage(ask.error, t('Could not get an answer.'))}</Alert>}
      {ask.data && (
        <>
          <DemoAlert mode={ask.data} />
          {ask.data.documentCount === 0 && (
            <Alert tone="info">{t('Your knowledge base has no active documents yet, so the assistant cannot answer questions.')}</Alert>
          )}
          <AiGeneratedNotice>
            <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line">{ask.data.answer}</p>
            {ask.data.citations.length > 0 && (
              <div className="mt-3 pt-2 border-t border-blue-200/60 dark:border-blue-400/15">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">{t('Sources')}</p>
                <ul className="space-y-1">
                  {ask.data.citations.map((c) => (
                    <li key={c.id} className="text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{c.title}</span>
                      {c.category ? ` · ${c.category}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-3 items-center text-xs text-slate-500">
              <ModeChip mode={ask.data} />
              {ask.data.retrieval && <span>{ask.data.retrieval === 'semantic' ? t('Semantic search') : t('Keyword search')}</span>}
            </div>
          </AiGeneratedNotice>
        </>
      )}
    </div>
  );
}
