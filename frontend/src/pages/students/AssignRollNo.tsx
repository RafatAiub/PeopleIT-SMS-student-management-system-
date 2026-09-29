import React, { useState, useEffect } from 'react';
import { ListOrdered, Save } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { Button } from '../../components/ui/Button';

interface StudentRow {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  rollNumber?: string | null;
}

const AssignRollNo = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [sections, setSections] = useState<any[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [rollNumbers, setRollNumbers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
      setSelectedSectionId('');
      return;
    }
    try {
      const res = await apiClient.get(`/students/meta/sections?classId=${classId}`);
      setSections(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch sections', err);
      toast.error('Failed to load section list');
    }
  };

  useEffect(() => {
    setSelectedSectionId('');
    setStudents([]);
    setRollNumbers({});
    fetchSections(selectedClassId);
  }, [selectedClassId]);

  const fetchStudents = async () => {
    if (!selectedClassId || !selectedSectionId) {
      setStudents([]);
      setRollNumbers({});
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.get('/students', {
        params: { classId: selectedClassId, sectionId: selectedSectionId, pageSize: 1000 },
      });
      const list: StudentRow[] = res.data.data || [];
      setStudents(list);
      const nextRollNumbers: Record<string, string> = {};
      list.forEach((s) => {
        nextRollNumbers[s.id] = s.rollNumber || '';
      });
      setRollNumbers(nextRollNumbers);
    } catch (err: any) {
      console.error('Failed to fetch students', err);
      toast.error(err.response?.data?.message || 'Failed to load students for this section');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionId]);

  const handleRollNumberChange = (studentId: string, value: string) => {
    setRollNumbers((prev) => ({ ...prev, [studentId]: value }));
  };

  const handleSaveAll = async () => {
    if (!selectedSectionId) return;
    setSaving(true);
    try {
      const assignments = students.map((s) => ({
        studentId: s.id,
        rollNumber: rollNumbers[s.id] || '',
      }));
      await apiClient.patch('/students/roll-numbers', {
        sectionId: selectedSectionId,
        assignments,
      });
      toast.success('Roll numbers saved successfully');
      fetchStudents();
    } catch (err: any) {
      console.error('Failed to save roll numbers', err);
      toast.error(err.response?.data?.message || 'Failed to save roll numbers');
    } finally {
      setSaving(false);
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
      key: 'rollNumber',
      header: 'Roll Number',
      sortable: false,
      render: (row) => (
        <input
          type="text"
          value={rollNumbers[row.id] ?? ''}
          onChange={(e) => handleRollNumberChange(row.id, e.target.value)}
          placeholder="e.g. 15"
          className="input-field w-32"
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <ListOrdered className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Assign Roll No.</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Pick a class and section, then edit each student's roll number and save all at once.
          </p>
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Class</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="input-field cursor-pointer"
            >
              <option value="">-- Select Class --</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Section</label>
            <select
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              disabled={!selectedClassId}
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
          emptyTitle="No students found"
          emptyDescription="Select a class and section with students to assign roll numbers."
        />

        <div className="flex justify-end">
          <Button
            type="button"
            variant="gradient"
            onClick={handleSaveAll}
            isLoading={saving}
            disabled={!selectedSectionId || students.length === 0 || saving}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save All'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AssignRollNo;
