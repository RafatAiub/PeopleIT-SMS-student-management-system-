import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { DataTable, type Column, type RowAction } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT } from '@/i18n';
import { useContactTags, useContacts, useDeleteContact, useLinkDonor, useSaveContact, type Contact, type ContactType } from './crm.api';
import { useEnquiryAssignees } from './enquiries.queries';

const TYPES: { value: ContactType; label: string }[] = [
  { value: 'ENQUIRER', label: 'Enquirer' },
  { value: 'VOLUNTEER', label: 'Volunteer' },
  { value: 'DONOR', label: 'Donor' },
  { value: 'OTHER', label: 'Other' },
];

/** People who are not applicants: volunteers, donors, general enquirers. */
export default function ContactsPanel() {
  const t = useT();
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const { data, isLoading } = useContacts({ type, tag, search, page, pageSize });
  const { data: tags = [] } = useContactTags();
  const del = useDeleteContact();
  const link = useLinkDonor();
  const donationsOn = !!data?.donationsEnabled;

  useEffect(() => setPage(1), [type, tag, search]);

  const columns: Column<Contact>[] = [
    { key: 'name', header: t('Name'), accessor: 'name', primary: true },
    { key: 'type', header: t('Type'), render: (c) => <Badge variant={c.type === 'VOLUNTEER' ? 'info' : c.type === 'DONOR' ? 'success' : 'neutral'}>{t(TYPES.find((x) => x.value === c.type)?.label ?? c.type)}</Badge> },
    { key: 'phone', header: t('Phone'), render: (c) => (c.phone ? <a className="text-primary-700 dark:text-primary-300" href={`tel:${c.phone}`}>{c.phone}</a> : '—') },
    { key: 'email', header: t('Email'), render: (c) => c.email || '—', hideOnMobile: true },
    { key: 'tags', header: t('Tags'), render: (c) => (c.tags.length ? <span className="flex flex-wrap gap-1">{c.tags.map((x) => <Badge key={x} variant="neutral">{x}</Badge>)}</span> : '—'), hideOnMobile: true },
    ...(donationsOn ? [{ key: 'donor', header: t('Donor'), render: (c: Contact) => c.donor?.name ?? '—', hideOnMobile: true } as Column<Contact>] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Select aria-label={t('Filter by type')} value={type} onChange={(e) => setType(e.target.value)} className="w-auto min-w-36" placeholder={t('All types')} options={TYPES.map((x) => ({ value: x.value, label: t(x.label) }))} />
        <Select aria-label={t('Filter by tag')} value={tag} onChange={(e) => setTag(e.target.value)} className="w-auto min-w-32" placeholder={t('All tags')} options={tags.map((x) => ({ value: x.tag, label: `${x.tag} (${x.count})` }))} />
        <input type="search" aria-label={t('Search contacts')} placeholder={t('Search name, phone, email…')} value={search} onChange={(e) => setSearch(e.target.value)} className="input-field flex-1 min-w-40 max-w-xs" />
        <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditing('new')}>
          {t('Add contact')}
        </Button>
      </div>
      <DataTable
        data={data?.items ?? []}
        columns={columns}
        isLoading={isLoading}
        serverPagination
        totalCount={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onRowClick={(c) => setEditing(c)}
        actions={[
          { label: t('Edit'), icon: 'edit', onClick: (c: Contact) => setEditing(c) },
          // Linking an already-linked contact is a no-op on the server.
          ...(donationsOn ? [{ label: t('Link to donor'), onClick: (c: Contact) => link.mutate(c.id) }] : []),
          { label: t('Delete'), icon: 'delete', onClick: (c: Contact) => setDeleting(c), variant: 'danger' },
        ] satisfies RowAction<Contact>[]}
        exportFileName="crm-contacts"
        emptyTitle={t('No contacts yet')}
        emptyDescription={t('Keep volunteers, donors and other people who are not applicants here.')}
        caption={t('Contacts')}
      />
      <ContactModal contact={editing} onClose={() => setEditing(null)} />
      <ConfirmModal
        isOpen={!!deleting}
        title={t('Delete contact')}
        message={t('Delete "{name}"? This cannot be undone.', { name: deleting?.name ?? '' })}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function ContactModal({ contact, onClose }: { contact: Contact | 'new' | null; onClose: () => void }) {
  const t = useT();
  const save = useSaveContact();
  const { data: assignees = [] } = useEnquiryAssignees();
  const editing = contact && contact !== 'new' ? contact : null;
  const [v, setV] = useState({ type: 'VOLUNTEER' as ContactType, name: '', phone: '', email: '', organisation: '', address: '', tags: '', notes: '', ownerUserId: '' });
  const [error, setError] = useState('');
  useEffect(() => {
    if (!contact) return;
    setError('');
    setV(
      editing
        ? { type: editing.type, name: editing.name, phone: editing.phone ?? '', email: editing.email ?? '', organisation: editing.organisation ?? '', address: editing.address ?? '', tags: editing.tags.join(', '), notes: editing.notes ?? '', ownerUserId: editing.ownerUserId ?? '' }
        : { type: 'VOLUNTEER', name: '', phone: '', email: '', organisation: '', address: '', tags: '', notes: '', ownerUserId: '' },
    );
  }, [contact, editing]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setError(t('Name is required'));
    if (!v.phone.trim() && !v.email.trim()) return setError(t('Give a phone number or an email'));
    const body = { ...v, tags: v.tags.split(',').map((x) => x.trim()).filter(Boolean), ownerUserId: v.ownerUserId || null };
    save.mutate({ id: editing?.id, body }, { onSuccess: onClose });
  };
  return (
    <Modal
      isOpen={!!contact}
      onClose={onClose}
      title={editing ? t('Edit contact') : t('Add contact')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="crmContactForm" variant="primary" isLoading={save.isPending}>{t('Save')}</Button>
        </>
      }
    >
      <form id="crmContactForm" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label={t('Type')} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as ContactType })} options={TYPES.map((x) => ({ value: x.value, label: t(x.label) }))} />
          <Input label={t('Name')} required value={v.name} maxLength={150} onChange={(e) => setV({ ...v, name: e.target.value })} data-autofocus />
          <Input label={t('Phone')} value={v.phone} maxLength={20} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="01700000000" />
          <Input label={t('Email')} type="email" value={v.email} maxLength={200} onChange={(e) => setV({ ...v, email: e.target.value })} />
          <Input label={t('Organisation')} value={v.organisation} maxLength={150} onChange={(e) => setV({ ...v, organisation: e.target.value })} />
          <Select label={t('Owner')} value={v.ownerUserId} onChange={(e) => setV({ ...v, ownerUserId: e.target.value })} options={[{ value: '', label: t('Unassigned') }, ...assignees.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}`.trim() }))]} />
        </div>
        <Input label={t('Address')} value={v.address} maxLength={300} onChange={(e) => setV({ ...v, address: e.target.value })} />
        <Input label={t('Tags (comma separated)')} value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} placeholder={t('e.g. eid, drivers, alumni')} />
        <Textarea label={t('Notes')} rows={3} value={v.notes} maxLength={5000} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </form>
    </Modal>
  );
}
