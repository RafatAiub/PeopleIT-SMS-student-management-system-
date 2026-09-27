import React, { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { Alert, Checkbox, Select, Skeleton } from '@/components/ui';
import { formatNumber, useT } from '@/i18n';
import { useClassesMeta, useGroups, usePreviewAudience, useSectionsMeta } from './campaigns.queries';
import MemberPicker from './MemberPicker';
import {
  AUDIENCE_ROLE_OPTIONS,
  type Audience,
  type AudienceRole,
  type CampaignChannel,
  type GroupMemberUser,
} from './campaigns.types';

interface ComposerAudienceStepProps {
  channel: CampaignChannel;
  body: string;
  audience: Audience;
  onChange: (audience: Audience) => void;
  isTeacher: boolean;
  /** Users already picked by id — kept as full objects so MemberPicker can show names. */
  selectedUsers: GroupMemberUser[];
  onSelectedUsersChange: (users: GroupMemberUser[]) => void;
}

/**
 * Audience builder + live recipient-count panel. Teachers never see "whole
 * classes" or staff roles here — the backend rejects both (403) — so those
 * controls are hidden rather than shown-then-blocked.
 */
export default function ComposerAudienceStep({
  channel,
  body,
  audience,
  onChange,
  isTeacher,
  selectedUsers,
  onSelectedUsersChange,
}: ComposerAudienceStepProps) {
  const t = useT();
  const { data: classes, isLoading: classesLoading } = useClassesMeta();
  const [browseClassId, setBrowseClassId] = useState('');
  const { data: browseSections, isLoading: sectionsLoading } = useSectionsMeta(browseClassId || undefined);
  const [sectionLabels, setSectionLabels] = useState<Record<string, string>>({});
  const { data: groupsData, isLoading: groupsLoading } = useGroups({ page: 1, pageSize: 100 });

  const roleOptions = isTeacher
    ? AUDIENCE_ROLE_OPTIONS.filter((o) => o.value === 'STUDENT' || o.value === 'GUARDIAN')
    : AUDIENCE_ROLE_OPTIONS;

  const toggleRole = (role: AudienceRole) => {
    const roles = audience.roles.includes(role) ? audience.roles.filter((r) => r !== role) : [...audience.roles, role];
    onChange({ ...audience, roles });
  };

  const toggleClass = (classId: string) => {
    const classIds = audience.classIds.includes(classId)
      ? audience.classIds.filter((id) => id !== classId)
      : [...audience.classIds, classId];
    onChange({ ...audience, classIds });
  };

  const toggleSection = (sectionId: string, label: string) => {
    setSectionLabels((prev) => ({ ...prev, [sectionId]: label }));
    const sectionIds = audience.sectionIds.includes(sectionId)
      ? audience.sectionIds.filter((id) => id !== sectionId)
      : [...audience.sectionIds, sectionId];
    onChange({ ...audience, sectionIds });
  };

  const removeSection = (sectionId: string) => onChange({ ...audience, sectionIds: audience.sectionIds.filter((id) => id !== sectionId) });

  const toggleGroup = (groupId: string) => {
    const groupIds = audience.groupIds.includes(groupId)
      ? audience.groupIds.filter((id) => id !== groupId)
      : [...audience.groupIds, groupId];
    onChange({ ...audience, groupIds });
  };

  const hasAnyAudience =
    audience.roles.length > 0 ||
    audience.classIds.length > 0 ||
    audience.sectionIds.length > 0 ||
    audience.userIds.length > 0 ||
    audience.groupIds.length > 0;

  // Debounce channel/body/audience before hitting the preview endpoint.
  const [debounced, setDebounced] = useState({ channel, audience, body });
  useEffect(() => {
    const h = setTimeout(() => setDebounced({ channel, audience, body }), 400);
    return () => clearTimeout(h);
  }, [channel, audience, body]);

  const { data: preview, isFetching: previewLoading } = usePreviewAudience(
    { channel: debounced.channel, audience: debounced.audience, body: debounced.body || undefined },
    hasAnyAudience
  );

  const className = (id: string) => classes?.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6 min-w-0">
        {/* Roles */}
        <section>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">{t('Roles')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {roleOptions.map((opt) => (
              <Checkbox
                key={opt.value}
                label={opt.label}
                checked={audience.roles.includes(opt.value)}
                onChange={() => toggleRole(opt.value)}
              />
            ))}
          </div>
          {isTeacher && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {t('Teachers can only message students and guardians.')}
            </p>
          )}
        </section>

        {/* Whole classes — teachers cannot target whole classes. */}
        {!isTeacher && (
          <section>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">{t('Whole classes')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              {t('Reaches every student and guardian in the class, plus any staff roles picked above.')}
            </p>
            {classesLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (classes?.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('No classes found.')}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {classes!.map((c) => (
                  <Checkbox key={c.id} label={c.name} checked={audience.classIds.includes(c.id)} onChange={() => toggleClass(c.id)} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Specific sections */}
        <section>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">{t('Specific sections')}</h3>
          {isTeacher && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              {t('You can only message sections you are class teacher of.')}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mb-2">
            {audience.sectionIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-medium px-2.5 py-1"
              >
                {sectionLabels[id] ?? id}
                <button type="button" onClick={() => removeSection(id)} aria-label={t('Remove')} className="ml-0.5">
                  ×
                </button>
              </span>
            ))}
          </div>
          <Select
            aria-label={t('Browse a class to pick its sections')}
            value={browseClassId}
            onChange={(e) => setBrowseClassId(e.target.value)}
            placeholder={t('Choose a class to browse its sections')}
            options={(classes ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          {browseClassId && (
            <div className="mt-2 rounded-lg border border-slate-200 dark:border-white/8 p-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {sectionsLoading ? (
                <Skeleton className="h-6 w-full col-span-full" />
              ) : (browseSections?.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 col-span-full">{t('No sections in this class.')}</p>
              ) : (
                browseSections!.map((s) => (
                  <Checkbox
                    key={s.id}
                    label={s.name}
                    checked={audience.sectionIds.includes(s.id)}
                    onChange={() => toggleSection(s.id, `${className(browseClassId)} • ${s.name}`)}
                  />
                ))
              )}
            </div>
          )}
        </section>

        {/* Specific people */}
        <section>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">{t('Specific people')}</h3>
          <MemberPicker
            selected={selectedUsers}
            onChange={(users) => {
              onSelectedUsersChange(users);
              onChange({ ...audience, userIds: users.map((u) => u.id) });
            }}
            roleOptions={roleOptions}
          />
        </section>

        {/* Groups */}
        <section>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">{t('Message groups')}</h3>
          {groupsLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (groupsData?.groups.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('You have no message groups yet.')}</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {groupsData!.groups.map((g) => (
                <Checkbox
                  key={g.id}
                  label={`${g.name} (${formatNumber(g._count.members)})`}
                  checked={audience.groupIds.includes(g.id)}
                  onChange={() => toggleGroup(g.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Live recipient count — sticky on desktop */}
      <aside className="lg:sticky lg:top-0 lg:self-start">
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <Users className="w-4 h-4" /> {t('Recipients')}
          </div>
          {!hasAnyAudience ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('Pick an audience to see how many people this reaches.')}</p>
          ) : previewLoading && !preview ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <p className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {formatNumber(preview?.total ?? 0)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('will be reached by {channel}', { channel: channel === 'IN_APP' ? t('in-app notification') : channel })}
              </p>
              {(preview?.unreachable ?? 0) > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t('{n} people in this audience have no {channel} contact on file and will be skipped.', {
                    n: formatNumber(preview!.unreachable),
                    channel: channel === 'IN_APP' ? t('login account') : channel === 'EMAIL' ? t('email address') : t('phone number'),
                  })}
                </p>
              )}
              {preview && Object.keys(preview.byRole).length > 0 && (
                <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                  {Object.entries(preview.byRole).map(([role, n]) => (
                    <li key={role} className="flex justify-between">
                      <span>{role}</span>
                      <span className="tabular-nums">{formatNumber(n)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {preview && preview.sample.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('Sample')}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {preview.sample.map((s) => s.name).join(', ')}
                    {preview.total > preview.sample.length ? '…' : ''}
                  </p>
                </div>
              )}
              {channel === 'SMS' && preview?.sms && (
                <p className="text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-white/8 pt-2">
                  {t('{segments} SMS segments total ({perMessage} per message × {total} recipients)', {
                    segments: formatNumber(preview.sms.totalSegments),
                    perMessage: formatNumber(preview.sms.segments),
                    total: formatNumber(preview.total),
                  })}
                </p>
              )}
              {preview?.demo && (
                <Alert tone="warning" title={t('Demo mode')}>
                  {t('Provider not configured — recipients will be counted but nothing will really be sent.')}
                </Alert>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
