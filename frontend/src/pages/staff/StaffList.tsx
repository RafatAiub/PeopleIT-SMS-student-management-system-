import React, { useState, useEffect, useRef } from 'react';
import { Copy, ShieldAlert } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useTableParams } from '../../hooks/useTableParams';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/common/ConfirmModal';

interface StaffRow {
  id: string;
  gender: string | null;
  dateOfBirth: string | null;
  address: string | null;
  staffRole: { id: string; name: string } | null;
  user: { id: string; firstName: string; lastName: string; email: string; phone: string | null; avatarUrl: string | null };
}

const emptyForm = () => ({
  staffRoleId: '', firstName: '', lastName: '', email: '', phone: '',
  gender: '', dateOfBirth: '', avatarUrl: '', address: '',
});

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB').replace(/\//g, '-') : '—';

const compressImage = (file: File): Promise<string> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 400;
        let { width, height } = img;
        if (width > height) {
          if (width > MAX) { height = Math.round((height * MAX) / width); width = MAX; }
        } else if (height > MAX) { width = Math.round((width * MAX) / height); height = MAX; }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(event.target?.result as string);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';
const Req = () => <span className="text-rose-500">*</span>;

type FormState = ReturnType<typeof emptyForm>;

const StaffFields: React.FC<{
  data: FormState;
  setData: React.Dispatch<React.SetStateAction<FormState>>;
  roles: { id: string; name: string }[];
  photoName: string;
  onPhoto: (file: File) => void;
  emailReadOnly?: boolean;
}> = ({ data, setData, roles, photoName, onPhoto, emailReadOnly }) => {
  const photoRef = useRef<HTMLInputElement>(null);
  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setData((p) => ({ ...p, [key]: e.target.value }));

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Role <Req /></label>
          <select value={data.staffRoleId} onChange={set('staffRoleId')} className="input-field">
            <option value="">Select Role</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>First Name <Req /></label>
          <input type="text" value={data.firstName} onChange={set('firstName')} placeholder="First Name" className="input-field" />
        </div>
        <div>
          <label className={labelClass}>Last Name <Req /></label>
          <input type="text" value={data.lastName} onChange={set('lastName')} placeholder="Last Name" className="input-field" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Email <Req /></label>
          <input type="email" value={data.email} onChange={set('email')} placeholder="Email" readOnly={emailReadOnly}
            className={`input-field ${emailReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`} />
        </div>
        <div>
          <label className={labelClass}>Mobile <Req /></label>
          <input type="text" value={data.phone} onChange={set('phone')} placeholder="Mobile" className="input-field" />
        </div>
        <div>
          <label className={labelClass}>Gender <Req /></label>
          <div className="flex items-center gap-6 h-10">
            {(['MALE', 'FEMALE'] as const).map((g) => (
              <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input type="radio" checked={data.gender === g} onChange={() => setData((p) => ({ ...p, gender: g }))} className="w-4 h-4 accent-primary-500 cursor-pointer" />
                {g.charAt(0) + g.slice(1).toLowerCase()}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Date of Birth <Req /></label>
          <input type="date" value={data.dateOfBirth} onChange={set('dateOfBirth')} className="input-field" />
        </div>
        <div>
          <label className={labelClass}>Image</label>
          <div className="flex gap-2">
            <input type="text" readOnly value={photoName} placeholder="Image" onClick={() => photoRef.current?.click()}
              className="input-field flex-1 cursor-pointer bg-slate-50 dark:bg-white/5" />
            <button type="button" onClick={() => photoRef.current?.click()}
              className="px-5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold whitespace-nowrap">Upload</button>
            <input ref={photoRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f); }} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Recommended image size: 120x120px (square)</p>
        </div>
        <div>
          <label className={labelClass}>Address <Req /></label>
          <input type="text" value={data.address} onChange={set('address')} placeholder="Address" className="input-field" />
        </div>
      </div>
    </>
  );
};

const validate = (data: FormState): string | null => {
  if (!data.staffRoleId) return 'Please select a role';
  if (!data.firstName.trim() || !data.lastName.trim()) return 'First and last name are required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) return 'Enter a valid email address';
  if (!data.phone.trim()) return 'Mobile is required';
  if (!data.gender) return 'Please select a gender';
  if (!data.dateOfBirth) return 'Date of birth is required';
  if (!data.address.trim()) return 'Address is required';
  return null;
};

const StaffList = () => {
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();

  const [form, setForm] = useState(emptyForm());
  const [photoName, setPhotoName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  const [editTarget, setEditTarget] = useState<StaffRow | null>(null);
  const [editForm, setEditForm] = useState(emptyForm());
  const [editPhotoName, setEditPhotoName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/staff-management/staff', {
        params: { page: params.page, pageSize: params.pageSize, search: debouncedSearch || undefined },
      });
      setStaff(res.data.data || []);
      setTotal(res.data.meta?.total || 0);
    } catch (error) {
      console.error('Failed to fetch staff', error);
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiClient.get('/staff-management/roles')
      .then((res) => setRoles(res.data.data || []))
      .catch((err) => console.error('Failed to fetch roles', err));
  }, []);

  useEffect(() => {
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.page, params.pageSize, debouncedSearch]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(form);
    if (err) { toast.error(err); return; }
    setSubmitting(true);
    try {
      const res = await apiClient.post('/staff-management/staff', {
        staffRoleId: form.staffRoleId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
        avatarUrl: form.avatarUrl || undefined,
        address: form.address.trim(),
      });
      toast.success('Staff member created successfully');
      setCredentials({ email: res.data.data.email, password: res.data.data.password });
      setForm(emptyForm());
      setPhotoName('');
      fetchStaff();
    } catch (error: any) {
      console.error('Failed to create staff', error);
      toast.error(error.response?.data?.message || 'Failed to create staff member');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (row: StaffRow) => {
    setEditTarget(row);
    setEditPhotoName(row.user.avatarUrl ? 'Current photo' : '');
    setEditForm({
      staffRoleId: row.staffRole?.id || '',
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      email: row.user.email,
      phone: row.user.phone || '',
      gender: row.gender || '',
      dateOfBirth: row.dateOfBirth ? String(row.dateOfBirth).slice(0, 10) : '',
      avatarUrl: row.user.avatarUrl || '',
      address: row.address || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    const err = validate(editForm);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      await apiClient.put(`/staff-management/staff/${editTarget.id}`, {
        staffRoleId: editForm.staffRoleId,
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        phone: editForm.phone.trim(),
        gender: editForm.gender,
        dateOfBirth: editForm.dateOfBirth,
        avatarUrl: editForm.avatarUrl || null,
        address: editForm.address.trim(),
      });
      toast.success('Staff member updated successfully');
      setEditTarget(null);
      fetchStaff();
    } catch (error: any) {
      console.error('Failed to update staff', error);
      toast.error(error.response?.data?.message || 'Failed to update staff member');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/staff-management/staff/${deleteTarget.id}`);
      toast.success('Staff member removed');
      setDeleteTarget(null);
      fetchStaff();
    } catch (error: any) {
      console.error('Failed to remove staff', error);
      toast.error(error.response?.data?.message || 'Failed to remove staff member');
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<StaffRow>[] = [
    {
      key: 'no', header: 'No.', sortable: false, width: '60px',
      render: (row) => <span className="text-slate-500 dark:text-slate-400">{staff.findIndex((s) => s.id === row.id) + 1 + (params.page - 1) * params.pageSize}</span>,
    },
    {
      key: 'name', header: 'Name',
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.user.avatarUrl ? (
            <img src={row.user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-white/10" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-500/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
              {row.user.firstName?.[0] || '?'}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-white truncate">{row.user.firstName} {row.user.lastName}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{row.user.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (row) => row.staffRole?.name || '—' },
    { key: 'mobile', header: 'Mobile', render: (row) => row.user.phone || '—' },
    { key: 'dob', header: 'Date of Birth', render: (row) => formatDate(row.dateOfBirth) },
    { key: 'gender', header: 'Gender', render: (row) => (row.gender ? row.gender.charAt(0) + row.gender.slice(1).toLowerCase() : '—') },
    { key: 'address', header: 'Address', render: (row) => row.address || '—' },
  ];

  const actions: RowAction<StaffRow>[] = [
    { label: 'Edit', icon: 'edit', onClick: openEdit },
    { label: 'Remove', icon: 'delete', onClick: (row) => setDeleteTarget(row), variant: 'danger' },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Staff</h3>
        {roles.length === 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400 mb-4">Create a role under Roles &amp; Permissions first — every staff member needs one.</p>
        )}
        <form onSubmit={handleCreate} className="space-y-4">
          <StaffFields data={form} setData={setForm} roles={roles} photoName={photoName}
            onPhoto={async (file) => { const url = await compressImage(file); setForm((p) => ({ ...p, avatarUrl: url })); setPhotoName(file.name); }} />
          <div className="pt-2">
            <Button type="submit" variant="gradient" isLoading={submitting}>{submitting ? 'Submitting…' : 'Submit'}</Button>
          </div>
        </form>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 shadow-xs">
        <div className="px-6 pt-5">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">List Staff</h3>
        </div>
        <div className="p-4">
          <DataTable
            data={staff}
            columns={columns}
            actions={actions}
            isLoading={loading}
            searchPlaceholder="Search by name, email or mobile..."
            serverSearch
            onSearch={setSearch}
            serverPagination
            totalCount={total}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            emptyTitle="No staff yet"
            emptyDescription="Staff you create above will show up here."
          />
        </div>
      </div>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} className="max-w-4xl space-y-5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-white/5">Edit Staff</h3>
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <StaffFields data={editForm} setData={setEditForm} roles={roles} photoName={editPhotoName} emailReadOnly
            onPhoto={async (file) => { const url = await compressImage(file); setEditForm((p) => ({ ...p, avatarUrl: url })); setEditPhotoName(file.name); }} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" variant="gradient" isLoading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!credentials} onClose={() => setCredentials(null)} className="max-w-md space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Staff Login Created</h3>
        <div className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-3">
          <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-xs">This password is shown only once. Share it with the staff member securely.</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Email</p>
            <code className="block px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-sm font-mono text-slate-900 dark:text-white break-all">{credentials?.email}</code>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Password</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-sm font-mono text-slate-900 dark:text-white break-all">{credentials?.password}</code>
              <button type="button" title="Copy password"
                onClick={() => { if (credentials) { navigator.clipboard.writeText(credentials.password); toast.success('Copied to clipboard!'); } }}
                className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex-shrink-0">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="gradient" onClick={() => setCredentials(null)}>Done</Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Remove this staff member?"
        message={`${deleteTarget?.user.firstName} ${deleteTarget?.user.lastName} will be removed from the list and their login disabled. Payroll and ID card history is kept.`}
        confirmLabel="Remove"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default StaffList;
