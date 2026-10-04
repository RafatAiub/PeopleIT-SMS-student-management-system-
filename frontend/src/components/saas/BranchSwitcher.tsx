import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Check, ChevronDown, Layers } from 'lucide-react';
import { Dropdown } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useT } from '@/i18n';
import { useBranches } from './saas.api';

/**
 * Header branch switcher — shown only to ADMIN / SUPER_ADMIN of an institution
 * with more than one active branch. Stores the choice in useBranchStore
 * (persisted); api/client.ts forwards it as X-Branch-Id. Renders `fallback`
 * (the plain institution chip) otherwise, and silently on API errors.
 */
export const BranchSwitcher: React.FC<{ institutionName?: string | null; fallback?: React.ReactNode }> = ({
  institutionName,
  fallback = null,
}) => {
  const t = useT();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const institutionId = user?.institutionId;
  const { data } = useBranches({ status: 'active', enabled: isAdmin && Boolean(institutionId) });
  const { institutionId: storedInstitution, branchId, setBranch } = useBranchStore();

  const branches = data?.items ?? [];
  const selectedId = storedInstitution === institutionId ? branchId : null;
  const selected = branches.find((b) => b.id === selectedId) ?? null;

  // A stored branch that's gone (deleted / deactivated) falls back to "All".
  React.useEffect(() => {
    if (data && institutionId && selectedId && !selected) setBranch(institutionId, null);
  }, [data, institutionId, selectedId, selected, setBranch]);

  if (!isAdmin || !institutionId || branches.length < 2) return <>{fallback}</>;

  const choose = (id: string | null, name: string | null) => {
    if (id === selectedId) return;
    setBranch(institutionId, id, name);
    // Branch-aware endpoints read X-Branch-Id — refetch what's on screen.
    qc.invalidateQueries();
  };

  const label = selected ? selected.name : t('All branches');

  return (
    <Dropdown
      align="left"
      width="w-64"
      trigger={(p) => (
        <button
          {...p}
          type="button"
          id="branch-switcher"
          className="hidden lg:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-slate-100 dark:bg-white/6 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 max-w-64 transition-colors"
          aria-label={`${t('Branch')}: ${label}`}
          title={institutionName ?? undefined}
        >
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            {institutionName ? `${institutionName} · ` : ''}
            {label}
          </span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        </button>
      )}
      sections={[
        {
          label: t('Branch'),
          items: [
            {
              id: 'all',
              label: t('All branches'),
              icon: selectedId === null ? <Check /> : <Layers />,
              selected: selectedId === null,
              onSelect: () => choose(null, null),
            },
            ...branches.map((b) => ({
              id: b.id,
              label: b.name,
              icon: b.id === selectedId ? <Check /> : <Building2 />,
              selected: b.id === selectedId,
              onSelect: () => choose(b.id, b.name),
            })),
          ],
        },
      ]}
    />
  );
};

export default BranchSwitcher;
