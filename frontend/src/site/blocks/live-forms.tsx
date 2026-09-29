/** Interactive live blocks: ResultsLookup, ClassRoutine, EnquiryForm, AiAssistant. */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Bot, CheckCircle2, MessageCircle, Printer, Send, X } from 'lucide-react';
import { SiteApiError } from '../api';
import { useIsEditing, useSiteApi, useSiteData, useSiteRuntime, useSiteText } from '../runtime';
import type { PublicFormField, PublicMarksheet, PublicRoutineSlot } from '../types';
import {
  BlockSection, EmptyBlock, ErrorBlock, i18nField, introFields, NotConnected, radioField, sectionDefaults, sectionFields,
  SectionIntro, SkeletonRows, textField, type SectionProps, type SiteBlock,
} from './shared';

const introDefaults = { eyebrow: '', eyebrowBn: '', intro: '', introBn: '', align: 'left' };

/* ── Results lookup ─────────────────────────────────────────────────────── */

export const ResultsLookup: SiteBlock = {
  label: 'Results lookup (live)',
  fields: {
    ...introFields,
    examId: textField('Fixed exam ID (empty = visitor chooses)'),
    idType: radioField('Visitors search by', [['roll', 'Roll number'], ['studentId', 'Student ID']]),
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, heading: 'Check your result', headingBn: 'ফলাফল দেখুন', examId: '', idType: 'roll', ...sectionDefaults, width: 'narrow' },
  render: (p) => <ResultsLookupView {...p} />,
};

function ResultsLookupView(p: Record<string, any>) {
  const { s } = useSiteText();
  const { siteId, settings } = useSiteRuntime();
  const api = useSiteApi();
  const editing = useIsEditing();
  const uid = useId();
  const fixedExam = String(p.examId ?? '').trim();
  const examsQ = useSiteData(['exams'], (id, a) => a.exams(id), { staleTime: 5 * 60_000 });
  const [examId, setExamId] = useState('');
  const [ident, setIdent] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicMarksheet | null>(null);
  const exams = examsQ.data ?? [];
  const chosenExam = fixedExam || examId || exams[0]?.id || '';
  // Exams list is empty when the school has public results (and toppers) switched off.
  const off = settings.publicResults === false || (!fixedExam && examsQ.isSuccess && exams.length === 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!siteId || editing) return;
    setError(null);
    setResult(null);
    if (!ident.trim() || !dob || !chosenExam) { setError(s('This field is required')); return; }
    setBusy(true);
    try {
      const body = { examId: chosenExam, dob, website: '', ...(p.idType === 'studentId' ? { studentId: ident.trim() } : { roll: ident.trim() }) };
      setResult(await api.resultsLookup(siteId, body));
    } catch (err) {
      const st = err instanceof SiteApiError ? err.status : 0;
      setError(
        st === 429 ? s('Too many attempts. Please wait a minute and try again.')
          : st === 403 ? s('The school hasn’t turned on public result lookup.')
            : st === 404 ? s('No result found for these details.')
              : st === 400 ? s('More than one student matches. Enter the student ID instead.')
                : s('Something went wrong'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!siteId ? <NotConnected /> : !fixedExam && examsQ.isLoading ? <SkeletonRows rows={2} className="h-11" /> : off ? (
        <EmptyBlock title={s('Online results aren’t available')} hint={s('The school hasn’t turned on public result lookup.')} />
      ) : (
        <form onSubmit={submit} className="site-card site-card-pad grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          {!fixedExam && (
            <div className="sm:col-span-2">
              <label className="site-label" htmlFor={`${uid}-exam`}>{s('Exam')} *</label>
              <select id={`${uid}-exam`} className="site-input" value={chosenExam} onChange={(e) => setExamId(e.target.value)}>
                {exams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="site-label" htmlFor={`${uid}-id`}>{p.idType === 'studentId' ? s('Student ID') : s('Roll number')} *</label>
            <input id={`${uid}-id`} className="site-input" required value={ident} onChange={(e) => setIdent(e.target.value)} inputMode={p.idType === 'studentId' ? 'text' : 'numeric'} autoComplete="off" />
          </div>
          <div>
            <label className="site-label" htmlFor={`${uid}-dob`}>{s('Date of birth')} *</label>
            <input id={`${uid}-dob`} className="site-input" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
          {error && <p className="site-alert site-alert-error sm:col-span-2" role="alert">{error}</p>}
          <div className="sm:col-span-2">
            <button type="submit" className="site-btn site-btn-primary w-full sm:w-auto" disabled={busy || editing}>{busy ? s('Searching…') : s('Find result')}</button>
          </div>
        </form>
      )}
      {result && <Marksheet r={result} />}
    </BlockSection>
  );
}

function Marksheet({ r }: { r: PublicMarksheet }) {
  const { s } = useSiteText();
  return (
    <div className="site-card site-card-pad mt-6" aria-live="polite">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {r.examName && <p className="site-eyebrow">{r.examName}</p>}
          <h3 className="site-h3">{r.studentName}</h3>
          <p className="site-muted text-sm">{[r.className && `${s('Class')} ${r.className}`, r.section && `${s('Section')} ${r.section}`, r.roll != null && `${s('Roll number')} ${r.roll}`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex items-center gap-4">
          {r.gpa != null && <div className="text-right"><p className="site-muted text-xs">{s('GPA')}</p><p className="text-2xl font-extrabold">{String(r.gpa)}</p></div>}
          {r.grade && <span className="site-badge site-badge-accent text-base">{r.grade}</span>}
          <button type="button" className="site-btn site-btn-outline site-btn-sm" onClick={() => window.print()} aria-label={s('Print')}><Printer size={16} /></button>
        </div>
      </div>
      {r.subjects.length > 0 && (
        <div className="site-table-wrap">
          <table className="site-table">
            <thead><tr><th scope="col">{s('Subject')}</th><th scope="col">{s('Marks')}</th><th scope="col">{s('Grade')}</th></tr></thead>
            <tbody>
              {r.subjects.map((m, i) => <tr key={i}><td>{m.name}</td><td>{m.marks ?? '—'}</td><td>{m.grade ?? '—'}</td></tr>)}
              {r.totalMarks != null && <tr><td className="font-semibold">{s('Total')}</td><td className="font-semibold">{String(r.totalMarks)}</td><td /></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Class routine ──────────────────────────────────────────────────────── */

export const ClassRoutine: SiteBlock = {
  label: 'Class routine (live)',
  fields: { ...introFields, className: textField('Fixed class (empty = visitor chooses)'), section: textField('Fixed section (optional)'), ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Class routine', headingBn: 'ক্লাস রুটিন', className: '', section: '', ...sectionDefaults },
  render: (p) => <RoutineView {...p} />,
};

const DAY_ORDER = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const DAY_BN: Record<string, string> = { SATURDAY: 'শনিবার', SUNDAY: 'রবিবার', MONDAY: 'সোমবার', TUESDAY: 'মঙ্গলবার', WEDNESDAY: 'বুধবার', THURSDAY: 'বৃহস্পতিবার', FRIDAY: 'শুক্রবার' };

function RoutineView(p: Record<string, any>) {
  const { s, lang } = useSiteText();
  const uid = useId();
  const fixedClass = String(p.className ?? '').trim();
  const fixedSection = String(p.section ?? '').trim();
  const [pickClass, setPickClass] = useState('');
  const [pickSection, setPickSection] = useState('');
  // Without a class the endpoint returns the class/section choices.
  const choices = useSiteData(['routine-classes'], (id, a) => a.routine(id, {}), { enabled: !fixedClass, staleTime: 10 * 60_000 });
  const classes = choices.data?.classes ?? [];
  const cls = fixedClass || pickClass || classes[0]?.className || '';
  const sections = classes.find((c) => c.className === cls)?.sections ?? [];
  const section = fixedClass ? fixedSection : pickSection && sections.includes(pickSection) ? pickSection : sections[0] ?? '';
  const q = useSiteData(['routine', cls, section], (id, a) => a.routine(id, { class: cls, section: section || undefined }), { enabled: Boolean(cls) });

  const days = useMemo(() => {
    const m = new Map<string, PublicRoutineSlot[]>();
    for (const r of q.data?.slots ?? []) {
      const d = r.day.toUpperCase();
      m.set(d, [...(m.get(d) ?? []), r]);
    }
    for (const list of m.values()) list.sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')));
    return Array.from(m.entries()).sort((a, b) => {
      const ia = DAY_ORDER.indexOf(a[0]); const ib = DAY_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [q.data]);
  const dayLabel = (d: string) => (lang === 'bn' ? DAY_BN[d] ?? d : d.charAt(0) + d.slice(1).toLowerCase());
  const empty = <EmptyBlock title={s('No routine published')} hint={s('The class routine will appear here once it is set up.')} />;

  let body;
  if (!q.connected) body = <NotConnected />;
  else if ((!fixedClass && choices.isLoading) || (cls && q.isLoading)) body = <SkeletonRows />;
  else if (choices.isError || q.isError) body = <ErrorBlock onRetry={() => { void choices.refetch(); void q.refetch(); }} />;
  else if (!cls || !days.length) body = empty;
  else body = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {days.map(([day, slots]) => (
        <div key={day} className="site-card">
          <h3 className="site-h4 px-4 pt-4">{dayLabel(day)}</h3>
          <ul className="m-0 list-none p-2">
            {slots.map((r, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 px-2 py-2" style={{ borderTop: i ? '1px solid var(--site-border)' : undefined }}>
                <span className="min-w-0">
                  <span className="font-semibold">{r.subject}</span>
                  {(r.teacher || r.room) && <span className="site-muted block text-sm">{[r.teacher, r.room].filter(Boolean).join(' · ')}</span>}
                </span>
                <span className="site-muted flex-none text-sm tabular-nums">{r.start ? `${r.start}${r.end ? `–${r.end}` : ''}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!fixedClass && classes.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-3">
          <div className="min-w-[160px] flex-1 sm:flex-none">
            <label className="site-label" htmlFor={`${uid}-c`}>{s('Class')}</label>
            <select id={`${uid}-c`} className="site-input" value={cls} onChange={(e) => { setPickClass(e.target.value); setPickSection(''); }}>
              {classes.map((c) => <option key={c.className} value={c.className}>{c.className}</option>)}
            </select>
          </div>
          {sections.length > 1 && (
            <div className="min-w-[140px] flex-1 sm:flex-none">
              <label className="site-label" htmlFor={`${uid}-s`}>{s('Section')}</label>
              <select id={`${uid}-s`} className="site-input" value={section} onChange={(e) => setPickSection(e.target.value)}>
                {sections.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      {body}
    </BlockSection>
  );
}

/* ── Enquiry form (a SiteForm; ENQUIRY forms create an AdmissionEnquiry) ── */

export const EnquiryForm: SiteBlock = {
  label: 'Admission enquiry / form (live)',
  fields: {
    ...introFields,
    formId: textField('Form ID (from Website › Forms)'),
    ...i18nField('successMessage', 'Thank-you message', 'textarea'),
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, heading: 'Admission enquiry', headingBn: 'ভর্তি সংক্রান্ত জিজ্ঞাসা', formId: '', successMessage: '', successMessageBn: '', ...sectionDefaults, width: 'narrow' },
  render: (p) => <EnquiryView {...p} />,
};

/** Client-side check mirroring the backend's validateSubmission (the server re-validates). */
export function validateField(f: PublicFormField, v: string | boolean | undefined): string | null {
  if (f.type === 'checkbox') return f.required && v !== true ? 'This field is required' : null;
  const val = typeof v === 'string' ? v.trim() : '';
  if (f.required && !val) return 'This field is required';
  if (val && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return 'Enter a valid email';
  if (val && f.type === 'phone' && !/^\+?[\d\s-]{6,20}$/.test(val)) return 'Enter a valid mobile number';
  if (val && f.type === 'number' && !Number.isFinite(Number(val))) return 'Enter a number';
  if (val && (f.type === 'select' || f.type === 'radio') && f.options?.length && !f.options.includes(val)) return 'Choose one of the options';
  return null;
}

function EnquiryView(p: Record<string, any>) {
  const { s, tx, lang } = useSiteText();
  const { siteId, settings } = useSiteRuntime();
  const api = useSiteApi();
  const editing = useIsEditing();
  const uid = useId();
  // Blocks without a form (templates, AI generator) fall back to the site's default enquiry form.
  const formId = String(p.formId ?? '').trim() || settings.defaultEnquiryFormId || '';
  const def = useSiteData(['form', formId], (id, a) => a.form(id, formId), { enabled: Boolean(formId), staleTime: 10 * 60_000 });
  const fields = def.data?.fields ?? [];
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [honey, setHoney] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const label = (f: PublicFormField) => (lang === 'bn' && f.labelBn ? f.labelBn : f.label);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!siteId || editing || !def.data) return;
    const errs: Record<string, string> = {};
    for (const f of fields) { const er = validateField(f, values[f.key]); if (er) errs[f.key] = s(er); }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setState('sending');
    try {
      const payload = Object.fromEntries(fields.map((f) => {
        const v = values[f.key];
        return [f.key, f.type === 'checkbox' ? v === true : typeof v === 'string' ? v.trim() : ''];
      }));
      await api.submitForm(siteId, formId, payload, honey, def.data.honeypotField);
      setState('done');
      setValues({});
    } catch (err) {
      if (err instanceof SiteApiError && err.fieldErrors.length) {
        setErrors(Object.fromEntries(err.fieldErrors.map((x) => [x.field, x.message])));
        setState('idle');
      } else setState('error');
    }
  };

  let body;
  if (!siteId) body = <NotConnected />;
  else if (!formId) {
    body = editing
      ? <div className="site-alert site-alert-warning flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 flex-none" aria-hidden /><p>{s('Choose a form for this block (Website › Forms).')}</p></div>
      : <EmptyBlock title={s('Admission enquiry')} hint={s('Please contact the school office.')} />;
  } else if (def.isLoading) body = <SkeletonRows rows={4} className="h-11" />;
  else if (def.isError) body = <ErrorBlock onRetry={() => void def.refetch()} />;
  else if (state === 'done') {
    body = (
      <div className="site-alert site-alert-success flex items-start gap-3" role="status">
        <CheckCircle2 className="flex-none" aria-hidden />
        <p>{tx(p.successMessage, p.successMessageBn) || s('Thank you! We’ve received your enquiry and will contact you soon.')}</p>
      </div>
    );
  } else {
    body = (
      <form onSubmit={submit} noValidate className="site-card site-card-pad relative grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `${uid}-${f.key}`;
          const err = errors[f.key];
          const aria = { 'aria-invalid': err ? true : undefined, 'aria-describedby': err ? `${id}-err` : undefined };
          const setV = (v: string | boolean) => setValues((cur) => ({ ...cur, [f.key]: v }));
          const strVal = typeof values[f.key] === 'string' ? (values[f.key] as string) : '';
          const wide = f.type === 'textarea' || f.type === 'radio' || f.type === 'checkbox';
          return (
            <div key={f.key} className={wide ? 'sm:col-span-2' : ''}>
              {f.type === 'checkbox' ? (
                <label className="flex min-h-[44px] items-center gap-3" htmlFor={id}>
                  <input id={id} type="checkbox" className="h-5 w-5" checked={values[f.key] === true} onChange={(e) => setV(e.target.checked)} {...aria} />
                  <span>{label(f)}{f.required ? ' *' : ''}</span>
                </label>
              ) : f.type === 'radio' ? (
                <fieldset className="m-0 border-0 p-0" {...aria}>
                  <legend className="site-label">{label(f)}{f.required ? ' *' : ''}</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {(f.options ?? []).map((o) => (
                      <label key={o} className="flex min-h-[44px] items-center gap-2"><input type="radio" name={id} value={o} checked={strVal === o} onChange={() => setV(o)} />{o}</label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <>
                  <label className="site-label" htmlFor={id}>{label(f)}{f.required ? ' *' : ''}</label>
                  {f.type === 'textarea' ? (
                    <textarea id={id} rows={4} className="site-input" value={strVal} onChange={(e) => setV(e.target.value)} required={f.required} {...aria} />
                  ) : f.type === 'select' ? (
                    <select id={id} className="site-input" value={strVal} onChange={(e) => setV(e.target.value)} required={f.required} {...aria}>
                      <option value="" />
                      {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      id={id} className="site-input" value={strVal} onChange={(e) => setV(e.target.value)} required={f.required} {...aria}
                      type={f.type === 'phone' ? 'tel' : f.type} inputMode={f.type === 'phone' ? 'tel' : f.type === 'number' ? 'decimal' : undefined}
                      autoComplete={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : undefined}
                    />
                  )}
                </>
              )}
              {err && <p id={`${id}-err`} className="site-error">{err}</p>}
            </div>
          );
        })}
        {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
          <label htmlFor={`${uid}-hp`}>Website</label>
          <input id={`${uid}-hp`} name={def.data?.honeypotField ?? 'website'} tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} />
        </div>
        {state === 'error' && <p className="site-alert site-alert-error sm:col-span-2" role="alert">{s('Couldn’t send. Please check the form and try again.')}</p>}
        <div className="flex flex-col gap-2 sm:col-span-2">
          <button type="submit" className="site-btn site-btn-primary w-full sm:w-auto sm:self-start" disabled={state === 'sending' || editing}>{state === 'sending' ? s('Sending…') : s('Send enquiry')}</button>
          <p className="site-muted text-xs">{s('We only use these details to reply to your enquiry.')}</p>
        </div>
      </form>
    );
  }

  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {body}
    </BlockSection>
  );
}

/* ── AI assistant chat widget ───────────────────────────────────────────── */

export const AiAssistant: SiteBlock = {
  label: 'AI assistant chat (live)',
  fields: {
    ...introFields,
    display: radioField('Display', [['inline', 'In the page'], ['floating', 'Floating button (bottom corner)']]),
    ...i18nField('greeting', 'Greeting', 'textarea'),
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults, heading: 'Ask us anything', headingBn: 'যেকোনো প্রশ্ন করুন', display: 'inline',
    greeting: 'Hello! Ask me about admissions, fees, classes or timings at {{institution.name}}.', greetingBn: 'আসসালামু আলাইকুম! {{institution.name}}-এর ভর্তি, ফি, ক্লাস বা সময়সূচি নিয়ে প্রশ্ন করুন।',
    ...sectionDefaults, width: 'narrow',
  },
  render: (p) => <AssistantView {...p} />,
};

interface ChatMsg { role: 'user' | 'bot'; text: string }

function AssistantView(p: Record<string, any>) {
  const { s, tx } = useSiteText();
  const { institution, subdomain, siteId } = useSiteRuntime();
  const editing = useIsEditing();
  const [open, setOpen] = useState(false);
  const floating = p.display === 'floating';
  const panel = <ChatPanel greeting={tx(p.greeting, p.greetingBn)} slug={institution?.slug || subdomain || ''} disabled={editing || !siteId} onClose={floating ? () => setOpen(false) : undefined} />;
  if (!floating) {
    return <BlockSection {...(p as SectionProps)}><SectionIntro {...p} />{panel}</BlockSection>;
  }
  if (editing) {
    return (
      <BlockSection {...(p as SectionProps)} pad="sm">
        <EmptyBlock icon={<MessageCircle size={28} />} title={tx(p.heading, p.headingBn) || s('Ask us anything')} hint={s('Chat is live on the published site.')} />
      </BlockSection>
    );
  }
  return (
    <div className="fixed bottom-4 right-4 z-[55] flex flex-col items-end gap-3" style={{ maxWidth: 'calc(100vw - 32px)' }}>
      {open && <div className="w-[360px] max-w-full shadow-2xl">{panel}</div>}
      <button type="button" className="site-btn site-btn-primary h-14 w-14 rounded-full !p-0 shadow-lg" aria-expanded={open} aria-label={open ? s('Close chat') : s('Open chat')} onClick={() => setOpen((o) => !o)}>
        {open ? <X aria-hidden /> : <MessageCircle aria-hidden />}
      </button>
    </div>
  );
}

function ChatPanel({ greeting, slug, disabled, onClose }: { greeting: string; slug: string; disabled: boolean; onClose?: () => void }) {
  const { s } = useSiteText();
  const api = useSiteApi();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim().slice(0, 500);
    if (!text || busy || disabled || !slug) return;
    setMsgs((m) => [...m, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    try {
      const r = await api.admissionAssistant({ slug, message: text });
      setDemo(r.demo);
      setMsgs((m) => [...m, { role: 'bot', text: r.answer || '…' }]);
    } catch (err) {
      const st = err instanceof SiteApiError ? err.status : 0;
      setMsgs((m) => [...m, { role: 'bot', text: st === 429 ? s('Too many attempts. Please wait a minute and try again.') : s('Something went wrong') }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="site-card flex flex-col" style={{ background: 'var(--site-bg)' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'var(--site-primary)', color: 'var(--site-on-primary)' }}>
        <Bot size={20} aria-hidden />
        <p className="flex-1 font-semibold">{s('Ask us anything')}</p>
        {demo && <span className="site-badge" style={{ background: '#fde68a', color: '#78350f' }} title={s('The assistant is in demo mode until an AI key is configured.')}>{s('Demo mode')}</span>}
        {onClose && <button type="button" onClick={onClose} className="site-btn site-btn-ghost site-btn-sm !min-h-[32px] !px-2" aria-label={s('Close chat')}><X size={16} /></button>}
      </div>
      <div ref={listRef} className="flex max-h-80 min-h-[160px] flex-col gap-2 overflow-y-auto p-4" aria-live="polite">
        {greeting && <Bubble role="bot" text={greeting} />}
        {msgs.map((m, i) => <Bubble key={i} role={m.role} text={m.text} />)}
        {busy && <Bubble role="bot" text="…" />}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t p-3" style={{ borderColor: 'var(--site-border)' }}>
        <label className="sr-only" htmlFor="site-chat-input">{s('Type your question…')}</label>
        <input id="site-chat-input" className="site-input" maxLength={500} placeholder={disabled ? s('Chat is live on the published site.') : s('Type your question…')} value={input} onChange={(e) => setInput(e.target.value)} disabled={disabled} />
        <button type="submit" className="site-btn site-btn-primary !px-3" disabled={disabled || busy || !input.trim()} aria-label={s('Send')}><Send size={18} /></button>
      </form>
      <p className="site-muted px-4 pb-3 text-xs">{s('Answers are AI-generated from the school’s information and may be incomplete. Please confirm with the office.')}</p>
    </div>
  );
}

function Bubble({ role, text }: ChatMsg) {
  const mine = role === 'user';
  return (
    <p className={`max-w-[85%] whitespace-pre-line px-3 py-2 text-sm ${mine ? 'self-end' : 'self-start'}`}
      style={{ borderRadius: 'var(--site-radius)', background: mine ? 'var(--site-primary)' : 'var(--site-surface-2)', color: mine ? 'var(--site-on-primary)' : 'var(--site-text)' }}>
      {text}
    </p>
  );
}
