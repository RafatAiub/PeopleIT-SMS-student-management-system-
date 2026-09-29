import React, { useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Checkbox, ErrorState, Input, Modal } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatDate, useT } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { errMsg, personName, useApiKeys, useApiKeyScopes, useCreateApiKey, useRevokeApiKey, type ApiKey } from './developer.api';
import { SecretRevealModal } from './SecretRevealModal';

const CreateKeyModal: React.FC<{ isOpen: boolean; onClose: () => void; onCreated: (key: string) => void }> = ({ isOpen, onClose, onCreated }) => {
  const t = useT();
  const scopesQuery = useApiKeyScopes();
  const create = useCreateApiKey();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ name?: string; scopes?: string }>({});

  const reset = () => {
    setName('');
    setScopes([]);
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = t('Name must be at least 2 characters');
    if (!scopes.length) next.scopes = t('Pick at least one scope');
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      const created = await create.mutateAsync({ name: name.trim(), scopes });
      reset();
      onClose();
      onCreated(created.key);
    } catch (err) {
      toast.error(errMsg(err, t('Could not create the API key')));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t('Create API key')}
      description={t('Keys are read-only and scoped to this institution.')}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4" id="create-api-key-form">
        <Input
          label={t('Key name')}
          placeholder={t('e.g. Accounting sync')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={80}
          required
        />
        <fieldset>
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('Scopes')}</legend>
          {scopesQuery.isError ? (
            <ErrorState compact message={t('Could not load scopes.')} onRetry={() => scopesQuery.refetch()} />
          ) : (
            <div className="space-y-2">
              {(scopesQuery.data ?? []).map((s) => (
                <Checkbox
                  key={s.scope}
                  label={<span className="font-mono text-sm">{s.scope}</span>}
                  description={t(s.label)}
                  checked={scopes.includes(s.scope)}
                  onChange={(e) => setScopes((prev) => (e.target.checked ? [...prev, s.scope] : prev.filter((x) => x !== s.scope)))}
                />
              ))}
            </div>
          )}
          {errors.scopes && <p className="mt-1 text-xs text-red-600">{errors.scopes}</p>}
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" isLoading={create.isPending}>
            {t('Create key')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export const ApiKeysTab: React.FC = () => {
  const t = useT();
  const tp = useTableParams(10);
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const query = useApiKeys({ page: tp.params.page, pageSize: tp.params.pageSize, includeRevoked });
  const revoke = useRevokeApiKey();
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  const columns: Column<ApiKey>[] = [
    {
      key: 'name',
      header: t('Name'),
      primary: true,
      render: (k) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-100">{k.name}</p>
          <p className="font-mono text-xs text-slate-500">{k.keyPrefix}…</p>
        </div>
      ),
      exportValue: (k) => k.name,
    },
    {
      key: 'scopes',
      header: t('Scopes'),
      sortable: false,
      render: (k) => (
        <div className="flex flex-wrap gap-1">
          {k.scopes.map((s) => (
            <Badge key={s} variant="info">
              {s}
            </Badge>
          ))}
        </div>
      ),
      exportValue: (k) => k.scopes.join(' '),
    },
    {
      key: 'lastUsedAt',
      header: t('Last used'),
      render: (k) => (k.lastUsedAt ? formatDate(k.lastUsedAt, true) : <span className="text-slate-400">{t('Never')}</span>),
      exportValue: (k) => k.lastUsedAt ?? '',
    },
    {
      key: 'status',
      header: t('Status'),
      render: (k) => (k.revokedAt ? <Badge variant="danger">{t('Revoked')}</Badge> : <Badge variant="success">{t('Active')}</Badge>),
      exportValue: (k) => (k.revokedAt ? 'Revoked' : 'Active'),
    },
    {
      key: 'createdAt',
      header: t('Created'),
      hideOnMobile: true,
      render: (k) => (
        <span className="text-sm">
          {formatDate(k.createdAt)}
          {k.createdBy && <span className="block text-xs text-slate-500">{personName(k.createdBy)}</span>}
        </span>
      ),
      exportValue: (k) => k.createdAt,
    },
  ];

  if (query.isError && !query.data) return <ErrorState message={errMsg(query.error, t('Could not load API keys.'))} onRetry={() => query.refetch()} />;

  const createButton = (
    <Button size="sm" variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
      {t('Create API key')}
    </Button>
  );

  return (
    <>
      <DataTable
        data={query.data?.items ?? []}
        columns={columns}
        isLoading={query.isLoading}
        serverPagination
        totalCount={query.data?.meta.total ?? 0}
        page={tp.params.page}
        pageSize={tp.params.pageSize}
        onPageChange={tp.setPage}
        onPageSizeChange={tp.setPageSize}
        exportFileName="api-keys"
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <Checkbox
              label={t('Show revoked')}
              checked={includeRevoked}
              onChange={(e) => {
                setIncludeRevoked(e.target.checked);
                tp.setPage(1);
              }}
            />
            {createButton}
          </div>
        }
        actions={[{ label: t('Revoke'), icon: 'delete', variant: 'danger', onClick: (k) => (k.revokedAt ? toast(t('This key is already revoked')) : setRevoking(k)) }]}
        emptyTitle={t('No API keys yet')}
        emptyDescription={t('Create a read-only key to let another system (accounting, BI, a parent app) read your data.')}
        emptyAction={createButton}
      />

      <CreateKeyModal isOpen={creating} onClose={() => setCreating(false)} onCreated={setRevealed} />

      <SecretRevealModal
        isOpen={!!revealed}
        onClose={() => setRevealed(null)}
        title={t('Your new API key')}
        label={t('API key')}
        secret={revealed}
        hint={
          <p className="flex items-start gap-2">
            <KeyRound className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {t('Send it in the')} <code className="font-mono">X-API-Key</code> {t('header to')} <code className="font-mono">/api/v1/public-api/…</code>
            </span>
          </p>
        }
      />

      <ConfirmModal
        isOpen={!!revoking}
        title={t('Revoke API key?')}
        message={t('Any system using "{name}" will immediately lose access. This cannot be undone.', { name: revoking?.name ?? '' })}
        confirmLabel={t('Revoke')}
        variant="danger"
        isLoading={revoke.isPending}
        onCancel={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await revoke.mutateAsync(revoking.id);
            toast.success(t('API key revoked'));
            setRevoking(null);
          } catch (err) {
            toast.error(errMsg(err, t('Could not revoke the key')));
          }
        }}
      />
    </>
  );
};
