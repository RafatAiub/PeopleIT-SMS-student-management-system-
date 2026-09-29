import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input, Select, Skeleton } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT } from '@/i18n';
import { useClassesMeta, useMemberCandidates, useSectionsMeta } from './campaigns.queries';
import { AUDIENCE_ROLE_OPTIONS, type AudienceRole, type GroupMemberUser } from './campaigns.types';

interface MemberPickerProps {
  selected: GroupMemberUser[];
  onChange: (selected: GroupMemberUser[]) => void;
  /** Restrict the role filter dropdown (e.g. teachers can only see STUDENT/GUARDIAN). */
  roleOptions?: { value: AudienceRole; label: string }[];
  /** Hide the class/section filters entirely (e.g. when the caller already scoped by section elsewhere). */
  showPlacementFilters?: boolean;
  helperText?: string;
}

const PAGE_SIZE = 20;

function displayName(u: GroupMemberUser) {
  // A stub entry (no name on file) happens only when a saved audience is
  // reopened for editing — there is no "get users by id list" endpoint to
  // resolve names for people picked in a previous session that don't also
  // appear on the current candidates page. It stays selectable/removable.
  return `${u.firstName} ${u.lastName}`.trim() || `Recipient ${u.id.slice(0, 6)}`;
}

/** Shared candidate search + selection UI for campaign "specific people" and group members. */
export default function MemberPicker({
  selected,
  onChange,
  roleOptions = AUDIENCE_ROLE_OPTIONS,
  showPlacementFilters = true,
  helperText,
}: MemberPickerProps) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role, setRole] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(h);
  }, [search]);

  useEffect(() => setPage(1), [debouncedSearch, role, classId, sectionId]);

  const { data: classes } = useClassesMeta();
  const { data: sections } = useSectionsMeta(classId || undefined);
  const { data, isLoading, isError } = useMemberCandidates({
    search: debouncedSearch || undefined,
    role: role || undefined,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const selectedIds = new Set(selected.map((u) => u.id));

  const toggle = (u: GroupMemberUser) => {
    if (selectedIds.has(u.id)) onChange(selected.filter((s) => s.id !== u.id));
    else onChange([...selected, u]);
  };

  const remove = (id: string) => onChange(selected.filter((s) => s.id !== id));

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-40">
          <Input
            aria-label={t('Search people')}
            placeholder={t('Search by name, email or phone')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search />}
          />
        </div>
        <Select
          aria-label={t('Filter by role')}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder={t('Any role')}
          options={roleOptions}
          className="w-auto min-w-36"
        />
        {showPlacementFilters && (
          <>
            <Select
              aria-label={t('Filter by class')}
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSectionId('');
              }}
              placeholder={t('Any class')}
              options={(classes ?? []).map((c) => ({ value: c.id, label: c.name }))}
              className="w-auto min-w-32"
            />
            <Select
              aria-label={t('Filter by section')}
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              placeholder={t('Any section')}
              options={(sections ?? []).map((s) => ({ value: s.id, label: s.name }))}
              disabled={!classId}
              className="w-auto min-w-32"
            />
          </>
        )}
      </div>
      {helperText && <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-500/10 border border-primary-200 dark:border-primary-500/20 text-primary-800 dark:text-primary-200 text-xs font-medium pl-2.5 pr-1 py-1"
            >
              {displayName(u)}
              <button
                type="button"
                onClick={() => remove(u.id)}
                aria-label={t('Remove {name}', { name: displayName(u) })}
                className="p-0.5 rounded-full hover:bg-primary-100 dark:hover:bg-primary-500/20"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 dark:border-white/8 max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-2/3" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-4 text-sm text-red-600 dark:text-red-400">{t('Could not load people.')}</div>
        ) : (data?.candidates.length ?? 0) === 0 ? (
          <EmptyState compact title={t('No matches')} description={t('Try a different search or filter.')} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {data!.candidates.map((u) => (
              <li key={u.id}>
                <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(u.id)}
                    onChange={() => toggle(u)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-white/20 accent-primary-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{displayName(u)}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                      {[u.email, u.phone].filter(Boolean).join(' · ') || u.role}
                    </span>
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-slate-400 shrink-0">{u.role}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30"
          >
            {t('Previous')}
          </button>
          <span>{t('Page {page} of {total}', { page, total: totalPages })}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30"
          >
            {t('Next')}
          </button>
        </div>
      )}
    </div>
  );
}
