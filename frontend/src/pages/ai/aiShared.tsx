import React from 'react';
import { Sparkles } from 'lucide-react';
import { Alert, Badge } from '../../components/ui';
import type { BadgeVariant } from '../../components/ui';
import { useT } from '../../i18n';
import { describeModel, type AiMode, type AiStatus } from './aiUtils';

// ── Labels ──────────────────────────────────────────────────────────────────

/** Small "which engine produced this" chip. */
export const ModeChip: React.FC<{ mode: AiMode }> = ({ mode }) => {
  const t = useT();
  if (mode.demo) return <Badge variant="warning">{t('Demo mode')}</Badge>;
  const d = describeModel(mode.model);
  if (!d) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300">
      <Sparkles className="w-3 h-3" />
      {d.provider} · {d.model}
    </span>
  );
};

/**
 * Required banner whenever an API response says demo: true. Distinguishes "no
 * key configured" from "key configured but the provider failed".
 */
export const DemoAlert: React.FC<{ mode?: AiMode | null; className?: string }> = ({ mode, className }) => {
  const t = useT();
  if (!mode?.demo) return null;
  return (
    <Alert tone="warning" title={t('Demo mode')} className={className}>
      {mode.aiError
        ? `${t('The AI provider could not be used for this request, so template text built from your school’s real data is shown.')} (${mode.aiError})`
        : t('AI API key not configured — this text is a template built from your school’s real data; no AI model was called and nothing was sent.')}
    </Alert>
  );
};

/** Page-level banner driven by /ai/status. */
export const AiStatusBanner: React.FC<{ status?: AiStatus }> = ({ status }) => {
  const t = useT();
  if (!status) return null;
  if (status.demo) {
    return (
      <Alert tone="warning" title={t('Demo mode')}>
        {t('No AI API key is configured. Summaries and drafts use templates built from your school’s real data; no AI model is called and nothing is sent.')}
      </Alert>
    );
  }
  const d = describeModel(status.model);
  return (
    <Alert tone="info" title={t('AI enabled')}>
      {t('Generated text comes from {provider} ({model}). All numbers are computed from your school’s records; review AI text before sharing.', {
        provider: d?.provider ?? '—',
        model: d?.model ?? '—',
      })}
      {status.providers?.anthropic.coolingDown && ` ${t('Claude is temporarily unavailable; Gemini is being used.')}`}
    </Alert>
  );
};

const RISK_VARIANT: Record<string, BadgeVariant> = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'success' };

export const RiskBadge: React.FC<{ level: string }> = ({ level }) => {
  const t = useT();
  const label = level === 'HIGH' ? t('High') : level === 'MEDIUM' ? t('Medium') : level === 'LOW' ? t('Low') : level;
  return <Badge variant={RISK_VARIANT[level] ?? 'neutral'}>{label}</Badge>;
};

/** Horizontal bar showing a factor's contribution out of its maximum. */
export const ContributionBar: React.FC<{ value: number; max: number; label?: string }> = ({ value, max, label }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tone = pct >= 66 ? 'bg-red-500' : pct >= 33 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2" aria-label={label}>
      <div className="h-2 flex-1 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300 w-14 text-right">
        {value}/{max}
      </span>
    </div>
  );
};
