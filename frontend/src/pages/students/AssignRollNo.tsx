import React, { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { PageHeader } from '../../components/ui/Display';
import { ErrorState } from '../../components/ui/Feedback';
import { EmptyState } from '../../components/common/EmptyState';

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
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  // One ref per row, in display order, so Enter / ArrowDown can move focus
  // to the next roll-number box without relying on DOM tab order.
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

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
    setLoadError(false);
    try {
      // Scoped to the chosen class+section only (not the whole institution) —
      // a section's roster is always well under the API's pageSize cap.
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
      setLoadError(true);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
      inputRefs.current[index + 1]?.select();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
      inputRefs.current[index - 1]?.select();
    }
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assign Roll No."
        description="Pick a class and section, then edit each student's roll number and save all at once."
      />

      <div className="glass-card p-5 sm:p-6 rounded-2xl space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <Select
            label="Class"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            placeholder="-- Select Class --"
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="Section"
            value={selectedSectionId}
            onChange={(e) => setSelectedSectionId(e.target.value)}
            disabled={!selectedClassId}
            placeholder="-- Select Section --"
            options={sections.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>

        {loadError ? (
          <ErrorState message="Failed to load students for this section." onRetry={fetchStudents} compact />
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-white/8">
            <EmptyState
              compact
              title="No students found"
              description="Select a class and section with students to assign roll numbers."
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/8 bg-white dark:bg-slate-900 shadow-xs">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-white/3">
                  <th scope="col" className="table-header">Student Name</th>
                  <th scope="col" className="table-header">Roll Number</th>
                </tr>
              </thead>
              <tbody>
                {students.map((row, index) => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-white/5 last:border-0">
                    <td className="table-cell">
                      <div className="font-medium text-slate-900 dark:text-white">{row.firstName} {row.lastName}</div>
                      <div className="text-xs text-slate-500">{row.studentId}</div>
                    </td>
                    <td className="table-cell">
                      <input
                        ref={(el) => (inputRefs.current[index] = el)}
                        type="text"
                        value={rollNumbers[row.id] ?? ''}
                        onChange={(e) => handleRollNumberChange(row.id, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        placeholder="e.g. 15"
                        aria-label={`Roll number for ${row.firstName} ${row.lastName}`}
                        className="input-field w-32"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="primary"
            onClick={handleSaveAll}
            isLoading={saving}
            disabled={!selectedSectionId || students.length === 0 || saving}
            leftIcon={<Save className="w-4 h-4" />}
          >
            {saving ? 'Saving...' : 'Save All'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AssignRollNo;
