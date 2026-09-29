import React, { useState, useEffect, useRef } from 'react';
import { UsersRound } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useTableParams } from '../../hooks/useTableParams';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface ParentRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  relationship: string;
  gender: string | null;
  dateOfBirth: string | null;
  occupation: string | null;
  avatarUrl: string | null;
}

const emptyEdit = () => ({
  firstName: '', lastName: '', email: '', phone: '', relationship: 'GUARDIAN',
  gender: 'MALE', dateOfBirth: '', occupation: '', avatarUrl: '',
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

const ParentsList = () => {
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();

  const [editTarget, setEditTarget] = useState<ParentRow | null>(null);
  const [editData, setEditData] = useState(emptyEdit());
  const [saving, setSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const fetchParents = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/guardians', {
        params: { page: params.page, pageSize: params.pageSize, search: debouncedSearch || undefined },
      });
      setParents(res.data.data || []);
      setTotal(res.data.meta?.total || 0);
    } catch (error) {
      console.error('Failed to fetch parents', error);
      toast.error('Failed to load parents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.page, params.pageSize, debouncedSearch]);

  const openEdit = (row: ParentRow) => {
    setEditTarget(row);
    setEditData({
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email || '',
      phone: row.phone || '',
      relationship: row.relationship || 'GUARDIAN',
      gender: row.gender || 'MALE',
      dateOfBirth: row.dateOfBirth ? String(row.dateOfBirth).slice(0, 10) : '',
      occupation: row.occupation || '',
      avatarUrl: row.avatarUrl || '',
    });
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const compressed = await compressImage(file);
    setEditData((p) => ({ ...p, avatarUrl: compressed }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!editData.firstName.trim() || !editData.lastName.trim() || !editData.phone.trim()) {
      toast.error('First name, last name and mobile are required');
      return;
    }
    if (editData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editData.email.trim())) {
      toast.error('Enter a valid email address');
      return;
    }
    setSaving(true);
    try {
      await apiClient.put(`/guardians/${editTarget.id}`, {
        firstName: editData.firstName.trim(),
        lastName: editData.lastName.trim(),
        email: editData.email.trim() || undefined,
        phone: editData.phone.trim(),
        relationship: editData.relationship,
        gender: editData.gender,
        dateOfBirth: editData.dateOfBirth || undefined,
        occupation: editData.occupation.trim() || undefined,
        avatarUrl: editData.avatarUrl || undefined,
      });
      toast.success('Parent updated successfully');
      setEditTarget(null);
      fetchParents();
    } catch (error: any) {
      console.error('Failed to update parent', error);
      toast.error(error.response?.data?.message || 'Failed to update parent');
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<ParentRow>[] = [
    {
      key: 'no', header: 'No.', sortable: false, width: '60px',
      render: (row) => (
        <span className="text-slate-500 dark:text-slate-400">
          {parents.findIndex((p) => p.id === row.id) + 1 + (params.page - 1) * params.pageSize}
        </span>
      ),
    },
    {
      key: 'parent', header: 'Parents',
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.avatarUrl ? (
            <img src={row.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-white/10" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-500/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
              {row.firstName?.[0] || '?'}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-white truncate">{row.firstName} {row.lastName}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{row.email || row.phone}</div>
          </div>
        </div>
      ),
    },
    { key: 'gender', header: 'Gender', render: (row) => (row.gender ? row.gender.charAt(0) + row.gender.slice(1).toLowerCase() : '—') },
    { key: 'dob', header: 'Date of Birth', render: (row) => formatDate(row.dateOfBirth) },
    { key: 'occupation', header: 'Occupation', render: (row) => row.occupation || '—' },
  ];

  const actions: RowAction<ParentRow>[] = [{ label: 'Edit', icon: 'edit', onClick: openEdit }];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <UsersRound className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Parents</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">List Parents</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 shadow-xs">
        <div className="p-4">
          <DataTable
            data={parents}
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
            emptyTitle="No parents found"
            emptyDescription="Parents are added from Students Admission or Online Registrations."
          />
        </div>
      </div>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} className="max-w-2xl space-y-5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-white/5">Edit Parent</h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">First Name <span className="text-rose-500">*</span></label>
              <input type="text" value={editData.firstName} onChange={(e) => setEditData((p) => ({ ...p, firstName: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name <span className="text-rose-500">*</span></label>
              <input type="text" value={editData.lastName} onChange={(e) => setEditData((p) => ({ ...p, lastName: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
              <input type="email" value={editData.email} onChange={(e) => setEditData((p) => ({ ...p, email: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mobile <span className="text-rose-500">*</span></label>
              <input type="text" value={editData.phone} onChange={(e) => setEditData((p) => ({ ...p, phone: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Gender</label>
              <div className="flex items-center gap-6 h-10">
                {(['MALE', 'FEMALE'] as const).map((g) => (
                  <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input type="radio" checked={editData.gender === g} onChange={() => setEditData((p) => ({ ...p, gender: g }))} className="w-4 h-4 accent-primary-500 cursor-pointer" />
                    {g.charAt(0) + g.slice(1).toLowerCase()}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Relationship</label>
              <select value={editData.relationship} onChange={(e) => setEditData((p) => ({ ...p, relationship: e.target.value }))} className="input-field">
                <option value="FATHER">Father</option>
                <option value="MOTHER">Mother</option>
                <option value="GUARDIAN">Guardian</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date of Birth</label>
              <input type="date" value={editData.dateOfBirth} onChange={(e) => setEditData((p) => ({ ...p, dateOfBirth: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Occupation</label>
              <input type="text" value={editData.occupation} onChange={(e) => setEditData((p) => ({ ...p, occupation: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Image</label>
            <div className="flex items-center gap-3">
              {editData.avatarUrl && (
                <img src={editData.avatarUrl} alt="Preview" className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-white/10" />
              )}
              <button type="button" onClick={() => photoInputRef.current?.click()}
                className="px-5 py-2 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold">Upload</button>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" variant="gradient" isLoading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ParentsList;
