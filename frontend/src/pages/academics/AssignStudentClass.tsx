import React, { useState, useEffect } from 'react';
import { Users2, ArrowRightLeft } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { Button } from '../../components/ui/Button';

interface StudentRow {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  class?: { name: string } | null;
  section?: { name: string } | null;
}

const AssignStudentClass = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [targetClassId, setTargetClassId] = useState('');
  const [sections, setSections] = useState<any[]>([]);
  const [targetSectionId, setTargetSectionId] = useState('');

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<StudentRow[]>([]);
  const [moving, setMoving] = useState(false);

  const fetchClasses = async () => {
    try {
      const res = await apiClient.get('/students/meta/classes');
      setClasses(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch classes', err);
      toast.error('Failed to load class list');
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchSections = async (classId: string) => {
    if (!classId) {
      setSections([]);
      setTargetSectionId('');
      return;
    }
    try {
      const res = await apiClient.get(`/students/meta/sections?classId=${classId}`);
      setSections(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch sections', err);
    }
  };

  useEffect(() => {
    setTargetSectionId('');
    fetchSections(targetClassId);
  }, [targetClassId]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/students', { params: { search, pageSize: 100 } });
      setStudents(res.data.data || []);
      setTotalStudents(res.data.meta?.total || 0);
    } catch (err: any) {
      console.error('Failed to fetch students', err);
      toast.error(err.response?.data?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleMoveSelected = async () => {
    if (!targetClassId || selectedStudents.length === 0) return;
    setMoving(true);
    try {
      await apiClient.post('/students/bulk-assign-class', {
        studentIds: selectedStudents.map((s) => s.id),
        classId: targetClassId,
        sectionId: targetSectionId || undefined,
      });
      toast.success(`Moved ${selectedStudents.length} student${selectedStudents.length === 1 ? '' : 's'} successfully`);
      setSelectedStudents([]);
      fetchStudents();
    } catch (err: any) {
      console.error('Failed to move students', err);
      toast.error(err.response?.data?.message || 'Failed to move selected students');
    } finally {
      setMoving(false);
    }
  };

  const columns: Column<StudentRow>[] = [
    {
      key: 'name',
      header: 'Student Name',
      render: (row) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-white">{row.firstName} {row.lastName}</div>
          <div className="text-xs text-slate-500">{row.studentId}</div>
        </div>
      ),
    },
    {
      key: 'currentClass',
      header: 'Current Class / Section',
      sortable: false,
      render: (row) => `${row.class?.name || 'N/A'}${row.section?.name ? ` - ${row.section.name}` : ''}`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <Users2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Assign New Student Class</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Search and select students, choose their target class/section, then move them in bulk.
          </p>
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Target Class</label>
            <select
              value={targetClassId}
              onChange={(e) => setTargetClassId(e.target.value)}
              className="input-field cursor-pointer"
            >
              <option value="">-- Select Class --</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Target Section</label>
            <select
              value={targetSectionId}
              onChange={(e) => setTargetSectionId(e.target.value)}
              disabled={!targetClassId}
              className="input-field cursor-pointer disabled:opacity-50"
            >
              <option value="">-- Select Section --</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <DataTable
          data={students}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Search students by name or ID..."
          serverSearch
          onSearch={setSearch}
          selectable
          onSelectionChange={setSelectedStudents}
          emptyTitle="No students found"
          emptyDescription="Try a different search."
        />

        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {selectedStudents.length} of {totalStudents} student{totalStudents === 1 ? '' : 's'} selected
          </p>
          <Button
            type="button"
            variant="gradient"
            onClick={handleMoveSelected}
            isLoading={moving}
            disabled={!targetClassId || selectedStudents.length === 0 || moving}
          >
            <ArrowRightLeft className="w-4 h-4" />
            {moving ? 'Moving…' : 'Move Selected'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AssignStudentClass;
