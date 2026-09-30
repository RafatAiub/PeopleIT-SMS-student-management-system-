import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Plus } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/common/ConfirmModal';

interface RoleRow {
  id: string;
  name: string;
  permissions: string[];
  staffCount: number;
}

const PERMISSION_MODULES: { key: string; label: string }[] = [
  { key: 'student', label: 'Students' },
  { key: 'teacher', label: 'Teachers' },
  { key: 'parent', label: 'Parents' },
  { key: 'academics', label: 'Academics' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'timetable', label: 'Timetable' },
  { key: 'exam', label: 'Exams' },
  { key: 'fees', label: 'Fees' },
  { key: 'library', label: 'Library' },
  { key: 'transport', label: 'Transport' },
  { key: 'notice', label: 'Notices' },
  { key: 'leave', label: 'Leave' },
  { key: 'report', label: 'Reports' },
  { key: 'idcard', label: 'ID Cards' },
];
const PERMISSION_ACTIONS = ['list', 'create', 'edit', 'delete'] as const;

const StaffRoles = () => {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [viewing, setViewing] = useState<RoleRow | null>(null);
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/staff-management/roles');
      setRoles(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch roles', error);
      toast.error('Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const filteredRoles = useMemo(
    () => roles.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase())),
    [roles, search],
  );

  const openCreate = () => {
    setEditing(null);
    setName('');
    setPermissions(new Set());
    setFormOpen(true);
  };

  const openEdit = (row: RoleRow) => {
    setEditing(row);
    setName(row.name);
    setPermissions(new Set(row.permissions));
    setFormOpen(true);
  };

  const togglePermission = (key: string) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleModule = (moduleKey: string) => {
    const keys = PERMISSION_ACTIONS.map((a) => `${moduleKey}.${a}`);
    setPermissions((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Role name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), permissions: Array.from(permissions) };
      if (editing) await apiClient.put(`/staff-management/roles/${editing.id}`, payload);
      else await apiClient.post('/staff-management/roles', payload);
      toast.success(editing ? 'Role updated successfully' : 'Role created successfully');
      setFormOpen(false);
      fetchRoles();
    } catch (error: any) {
      console.error('Failed to save role', error);
      toast.error(error.response?.data?.message || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/staff-management/roles/${deleteTarget.id}`);
      toast.success('Role deleted successfully');
      setDeleteTarget(null);
      fetchRoles();
    } catch (error: any) {
      console.error('Failed to delete role', error);
      toast.error(error.response?.data?.message || 'Failed to delete role');
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<RoleRow>[] = [
    {
      key: 'no', header: 'No.', sortable: false, width: '60px',
      render: (row) => <span className="text-slate-500 dark:text-slate-400">{filteredRoles.findIndex((r) => r.id === row.id) + 1}</span>,
    },
    { key: 'name', header: 'Name', accessor: 'name' },
    { key: 'staffCount', header: 'Staff', render: (row) => row.staffCount },
  ];

  const actions: RowAction<RoleRow>[] = [
    { label: 'View', icon: 'view', onClick: (row) => setViewing(row) },
    { label: 'Edit', icon: 'edit', onClick: openEdit },
    { label: 'Delete', icon: 'delete', onClick: (row) => setDeleteTarget(row), variant: 'danger' },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Role Management</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">List Roles</p>
          </div>
        </div>
        <Button variant="gradient" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Create New Role
        </Button>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 shadow-xs">
        <div className="p-4">
          <DataTable
            data={filteredRoles}
            columns={columns}
            actions={actions}
            isLoading={loading}
            searchPlaceholder="Search roles..."
            serverSearch
            onSearch={setSearch}
            emptyTitle="No roles yet"
            emptyDescription="Create a role, then assign it to staff members."
          />
        </div>
      </div>

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} className="max-w-3xl space-y-5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-white/5">
          {editing ? 'Edit Role' : 'Create New Role'}
        </h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name <span className="text-rose-500">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Administrative Staff" className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Permissions</label>
            <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-white/5 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">Module</th>
                    {PERMISSION_ACTIONS.map((a) => (
                      <th key={a} className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 capitalize">{a}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_MODULES.map((m) => (
                    <tr key={m.key} className="border-t border-slate-100 dark:border-white/5">
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => toggleModule(m.key)} className="text-slate-800 dark:text-slate-200 hover:text-primary-600 font-medium">
                          {m.label}
                        </button>
                      </td>
                      {PERMISSION_ACTIONS.map((a) => {
                        const key = `${m.key}.${a}`;
                        return (
                          <td key={a} className="px-3 py-2 text-center">
                            <input type="checkbox" checked={permissions.has(key)} onChange={() => togglePermission(key)} className="w-4 h-4 rounded-sm accent-primary-500 cursor-pointer" />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Click a module name to toggle all its permissions.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" variant="gradient" isLoading={saving}>{saving ? 'Saving…' : 'Submit'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!viewing} onClose={() => setViewing(null)} className="max-w-lg space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-white/5">{viewing?.name}</h3>
        {viewing && viewing.permissions.length > 0 ? (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {PERMISSION_MODULES.filter((m) => viewing.permissions.some((p) => p.startsWith(`${m.key}.`))).map((m) => (
              <div key={m.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-800 dark:text-slate-200">{m.label}</span>
                <span className="flex flex-wrap gap-1 justify-end">
                  {PERMISSION_ACTIONS.filter((a) => viewing.permissions.includes(`${m.key}.${a}`)).map((a) => (
                    <span key={a} className="badge-info capitalize">{a}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">No permissions assigned to this role.</p>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete this role?"
        message={`This permanently removes the "${deleteTarget?.name}" role. Roles still assigned to staff can't be deleted.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default StaffRoles;
