import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { GraduationCap, Send, Sparkles, CheckCircle2 } from 'lucide-react';
import apiClient from '../../api/client';
import { Alert, Button, Card, Input, Skeleton } from '../../components/ui';
import { LogoMark } from '../../components/common/LogoMark';
import { LanguageToggle } from '../public/LanguageToggle';
import { useT } from '../../i18n';
import { DemoAlert } from './aiShared';
import { errorMessage, type AiMode } from './aiUtils';

interface AssistantReply extends AiMode {
  institution?: { name: string };
  answer: string;
  citations: { title: string }[];
  recommendation: { age: number; label: string; matchedClass: string | null; note: string } | null;
  leadCaptured: boolean;
  leadError: string | null;
  askForContact: boolean;
}

interface Turn {
  id: number;
  question: string;
  reply?: AssistantReply;
  error?: string;
}

/**
 * Public admission enquiry assistant: /admission-assistant/:slug.
 * Answers only from the school's "admission" knowledge documents; captures
 * name + phone as an admission enquiry when the visitor offers them.
 */
export default function AdmissionAssistant() {
  const t = useT();
  const { slug = '' } = useParams();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [leadDone, setLeadDone] = useState(false);
  const schoolName = turns.find((x) => x.reply?.institution)?.reply?.institution?.name;

  const ask = useMutation({
    mutationFn: async (payload: { message: string; withContact?: boolean }): Promise<AssistantReply> =>
      (
        await apiClient.post('/ai/admission-assistant', {
          slug,
          message: payload.message,
          childAge: childAge ? Number(childAge) : undefined,
          ...(payload.withContact ? { name: name.trim(), phone: phone.trim(), childName: childName.trim() || undefined } : {}),
          website: website || undefined,
        })
      ).data.data,
  });

  const submitQuestion = (message: string, withContact = false) => {
    const id = Date.now();
    setTurns((ts) => [...ts, { id, question: message }]);
    ask.mutate(
      { message, withContact },
      {
        onSuccess: (reply) => {
          setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, reply } : x)));
          if (reply.leadCaptured) setLeadDone(true);
        },
        onError: (e) => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, error: errorMessage(e, t('Sorry, something went wrong. Please try again.')) } : x))),
      },
    );
  };

  const lastReply = [...turns].reverse().find((x) => x.reply)?.reply;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label={t('Home')}><LogoMark /></Link>
          <LanguageToggle />
        </div>
        <div className="flex items-center gap-3">
          <GraduationCap className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('Admission enquiry assistant')}</h1>
            {schoolName && <p className="text-sm text-slate-600 dark:text-slate-300">{schoolName}</p>}
          </div>
        </div>
        <Alert tone="info">{t('An AI assistant that answers only from this school’s published admission information. For anything else, leave your contact details and the admissions office will call you.')}</Alert>

        <Card className="space-y-4">
          {turns.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{t('Ask about admission dates, documents, fees or which class suits your child’s age.')}</p>}
          {turns.map((turn) => (
            <div key={turn.id} className="space-y-2">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary-600 text-white px-3 py-2 text-sm">{turn.question}</div>
              </div>
              {turn.error ? (
                <Alert tone="danger">{turn.error}</Alert>
              ) : !turn.reply ? (
                <Skeleton className="h-12 w-2/3 rounded-2xl" />
              ) : (
                <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-white/10 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 space-y-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300"><Sparkles className="w-3 h-3" />{t('AI assistant')}</span>
                  <DemoAlert mode={turn.reply} />
                  <p className="whitespace-pre-line">{turn.reply.answer}</p>
                  {turn.reply.recommendation && (
                    <p className="text-xs rounded-md bg-white/70 dark:bg-white/5 p-2">
                      <strong>{t('Suggested class for age {age}', { age: turn.reply.recommendation.age })}:</strong> {turn.reply.recommendation.matchedClass ?? turn.reply.recommendation.label}. {turn.reply.recommendation.note}
                    </p>
                  )}
                  {turn.reply.citations.length > 0 && <p className="text-xs text-slate-500">{t('Source')}: {turn.reply.citations.map((c) => c.title).join(', ')}</p>}
                </div>
              )}
            </div>
          ))}

          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (question.trim()) { submitQuestion(question.trim()); setQuestion(''); } }}>
            <Input aria-label={t('Your question')} containerClassName="flex-1" maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t('Type your question…')} />
            <Button type="submit" size="icon" aria-label={t('Send')} isLoading={ask.isPending} disabled={!question.trim() || !slug}><Send className="w-4 h-4" /></Button>
          </form>
        </Card>

        <Card>
          {leadDone ? (
            <div className="flex items-start gap-3 text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-slate-700 dark:text-slate-200">{t('Thank you! The admissions office has your details and will contact you.')}</p>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                submitQuestion(t('Please contact me about admission.'), true);
              }}
            >
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('Want the school to call you?')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label={t('Your name')} required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
                <Input label={t('Mobile number')} required type="tel" inputMode="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} helperText="01XXXXXXXXX" />
                <Input label={t('Child’s name (optional)')} maxLength={100} value={childName} onChange={(e) => setChildName(e.target.value)} />
                <Input label={t('Child’s age (optional)')} type="number" min={2} max={20} value={childAge} onChange={(e) => setChildAge(e.target.value)} />
              </div>
              {/* Honeypot: hidden from people, tempting to bots. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" />
              {lastReply?.leadError && <Alert tone="danger">{lastReply.leadError}</Alert>}
              <Button type="submit" isLoading={ask.isPending} disabled={name.trim().length < 2 || phone.trim().length < 6 || !slug}>{t('Request a call back')}</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
