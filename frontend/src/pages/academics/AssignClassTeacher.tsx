import React, { useState, useEffect } from 'react';
import { UserCog } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { DataTable, Column } from '../../components/DataTable/DataTable';

interface TeacherOption {
  id: string;
  label: string;
}

interface SectionRow {
  id: string;
  name: string;
  classId?: string;
  class?: { id: string; name: string } | null;
  classTeacherId?: string | null;
  classTeacher?: { id: string; user?: { firstName: string; lastName: string } } | null;
}

const AssignClassTeacher = () => {
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  const fetchSections = async () => {
    setLoading(true);
    try {
      // No classId query param — returns every section institution-wide,
      // each with its class name and current class teacher nested.
      const res = await apiClient.get('/academics/sections');
      setSections(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch sections', err);
      toast.error('Failed to load sections');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await apiClient.get('/users?role=TEACHER&pageSize=100');
      const users = res.data?.data || [];
      const options: TeacherOption[] = users
        .filter((u: any) => !!u.teacherProfile)
        .map((u: any) => ({ id: u.teacherProfile.id, label: `${u.firstName} ${u.lastName}` }));
      setTeachers(options);
    } catch (err) {
      console.warn('Failed to load teacher list', err);
      setTeachers([]);
    }
  };

  useEffect(() => {
    fetchSections();
    fetchTeachers();
  }, []);

  const handleTeacherChange = async (row: SectionRow, newTeacherId: string) => {
    const previousSections = sections;
    setSections((prev) => prev.map((s) => (s.id === row.id ? { ...s, classTeacherId: newTeacherId } : s)));
    setSavingRowId(row.id);
    try {
      await apiClient.put(`/academics/sections/${row.id}`, { classTeacherId: newTeacherId || null });
      toast.success('Class teacher updated');
      fetchSections();
    } catch (err: any) {
      console.error('Failed to update class teacher', err);
      setSections(previousSections);
      toast.error(err.response?.data?.message || 'Failed to update class teacher');
    } finally {
      setSavingRowId(null);
    }
  };

  const columns: Column<SectionRow>[] = [
    {
      key: 'class',
      header: 'Class',
      render: (row) => row.class?.name || 'N/A',
    },
    {
      key: 'name',
      header: 'Section',
      accessor: 'name',
    },
    {
      key: 'classTeacher',
      header: 'Class Teacher',
      sortable: false,
      render: (row) => (
        <select
          value={row.classTeacherId || row.classTeacher?.id || ''}
          onChange={(e) => handleTeacherChange(row, e.target.value)}
          disabled={savingRowId === row.id}
          className="input-field cursor-pointer disabled:opacity-50 max-w-[220px]"
        >
          <option value="">Unassigned</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <UserCog className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Assign Class Teacher</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Assign a class teacher to every section institution-wide. Changes save automatically.
          </p>
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl">
        <DataTable
          data={sections}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Search by class or section..."
          emptyTitle="No sections found"
          emptyDescription="Create classes and sections under Academics first."
        />
      </div>
    </div>
  );
};

export default AssignClassTeacher;
