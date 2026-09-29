import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Send, Sparkles, UserCheck, Clock } from 'lucide-react';
import apiClient from '../../api/client';
import { Alert, Badge, Button, Card, CardHeader, Input, PageHeader, Select, ErrorState, Skeleton } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { useT, formatDate } from '../../i18n';
import { errorMessage } from './aiUtils';

interface ChatReply {
  type: 'ANSWER' | 'QUEUED';
  intent: string;
  answer: string;
  label: string;
}

interface Message {
  id: number;
  from: 'me' | 'bot';
  text: string;
  queued?: boolean;
}

interface QueuedQuestion {
  id: string;
  question: string | null;
  askedAt: string;
  status: 'PENDING' | 'ANSWERED' | 'CLOSED';
  reply: string | null;
  repliedAt: string | null;
}

const SUGGESTIONS = ['How much fee is due?', 'Attendance this month', 'Latest exam results', "Today's routine", 'Upcoming holidays', 'Latest notices'];

/** The label the owner requires on every assistant answer shown to guardians. */
const AssistantLabel = ({ text }: { text: string }) => (
  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
    <Sparkles className="w-3 h-3" />
    {text}
  </span>
);

export default function GuardianChat() {
  const t = useT();
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const label = t('AI assistant — answers based on school records');

  const children = useQuery({
    queryKey: ['guardian', 'me', 'students'],
    queryFn: async (): Promise<{ id: string; firstName: string; lastName: string }[]> => (await apiClient.get('/guardians/me/students')).data.data ?? [],
  });

  const replies = useQuery({
    queryKey: ['ai', 'guardian-replies'],
    queryFn: async (): Promise<QueuedQuestion[]> => (await apiClient.get('/ai/guardian-chat/replies')).data.data ?? [],
  });

  const send = useMutation({
    mutationFn: async (message: string): Promise<ChatReply> => (await apiClient.post('/ai/guardian-chat', { message, studentId: studentId || undefined })).data.data,
    onSuccess: (r) => {
      setMessages((m) => [...m, { id: Date.now(), from: 'bot', text: r.answer, queued: r.type === 'QUEUED' }]);
      if (r.type === 'QUEUED') qc.invalidateQueries({ queryKey: ['ai', 'guardian-replies'] });
    },
    onError: (e) => setMessages((m) => [...m, { id: Date.now(), from: 'bot', text: errorMessage(e, t('Sorry, something went wrong. Please try again.')) }]),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, send.isPending]);

  const ask = (text: string) => {
    const q = text.trim();
    if (q.length < 2 || send.isPending) return;
    setMessages((m) => [...m, { id: Date.now(), from: 'me', text: q }]);
    setInput('');
    send.mutate(q);
  };

  return (
    <div className="space-y-5">
      <PageHeader title={<span className="flex items-center gap-2"><Bot className="w-6 h-6 text-primary-600 dark:text-primary-400" />{t('School assistant')}</span>} description={t('Ask about your child’s fees, attendance, results, routine, holidays and notices.')} />

      <Alert tone="info">
        {t('Answers about fees, attendance, results, routine, holidays and notices come straight from school records. Other questions are sent to school staff, who review and reply here.')}
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 flex flex-col min-h-[28rem]">
          <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
            <CardHeader className="mb-0" title={t('Chat')} />
            {children.data && children.data.length > 1 && (
              <Select aria-label={t('Child')} value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder={t('All my children')}
                options={children.data.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}`.trim() }))} />
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1" aria-live="polite">
            {messages.length === 0 && (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                <p className="mb-2">{t('Try one of these:')}</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} size="xs" variant="secondary" onClick={() => ask(t(s))}>{t(s)}</Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) =>
              m.from === 'me' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary-600 text-white px-3 py-2 text-sm whitespace-pre-line">{m.text}</div>
                </div>
              ) : (
                <div key={m.id} className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-white/10 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 space-y-1">
                    {m.queued ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300"><Clock className="w-3 h-3" />{t('Sent to school staff')}</span>
                    ) : (
                      <AssistantLabel text={label} />
                    )}
                    <p className="whitespace-pre-line">{m.queued ? t('A staff member will review and reply.') : m.text}</p>
                  </div>
                </div>
              ),
            )}
            {send.isPending && <Skeleton className="h-10 w-2/3 rounded-2xl" />}
            <div ref={endRef} />
          </div>

          <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            <Input aria-label={t('Your question')} containerClassName="flex-1" value={input} maxLength={500} onChange={(e) => setInput(e.target.value)} placeholder={t('Type your question…')} />
            <Button type="submit" size="icon" aria-label={t('Send')} isLoading={send.isPending} disabled={input.trim().length < 2}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title={t('Questions for staff')} description={t('Replies appear here once a staff member has reviewed them.')} />
          {replies.isLoading ? (
            <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
          ) : replies.isError ? (
            <ErrorState compact message={errorMessage(replies.error, t('Could not load your questions.'))} onRetry={() => replies.refetch()} />
          ) : !replies.data?.length ? (
            <EmptyState compact title={t('No questions yet')} />
          ) : (
            <ul className="space-y-3">
              {replies.data.map((q) => (
                <li key={q.id} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 text-sm space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">{formatDate(q.askedAt, true)}</span>
                    <Badge variant={q.status === 'ANSWERED' ? 'success' : q.status === 'CLOSED' ? 'neutral' : 'warning'}>
                      {q.status === 'ANSWERED' ? t('Answered') : q.status === 'CLOSED' ? t('Closed') : t('Awaiting staff')}
                    </Badge>
                  </div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{q.question}</p>
                  {q.reply && (
                    <div className="rounded-md bg-emerald-50 dark:bg-emerald-500/10 p-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"><UserCheck className="w-3 h-3" />{t('Reviewed by school staff')}</span>
                      <p className="text-slate-800 dark:text-slate-100 whitespace-pre-line mt-0.5">{q.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
