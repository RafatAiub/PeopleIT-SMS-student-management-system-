import React, { useEffect, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { Button, PageHeader, Select, ErrorState } from '../../components/ui';

interface ClassOption {
  id: string;
  name: string;
}

interface SectionOption {
  id: string;
  name: string;
}

interface StudentRow {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  class?: { name: string } | null;
  section?: { name: string } | null;
}

const AssignStudentClass = () => {
  const queryClient = useQueryClient();
  const [targetClassId, setTargetClassId] = useState('');
  const [targetSectionId, setTargetSectionId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<StudentRow[]>([]);

  const { data: classes = [] } = useQuery({
    queryKey: ['academics', 'classes-lite'],
    queryFn: async () => {
      const res = await apiClient.get('/students/meta/classes');
      return (res.data?.data || []) as ClassOption[];
    },
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['academics', 'sections-for-class', targetClassId],
    queryFn: async () => {
      const res = await apiClient.get(`/students/meta/sections?classId=${targetClassId}`);
      return (res.data?.data || []) as SectionOption[];
    },
    enabled: !!targetClassId,
  });

  useEffect(() => {
    setTargetSectionId('');
  }, [targetClassId]);

  const studentsKey = ['students', 'assign-class', search];
  const {
    data: studentsData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: studentsKey,
    queryFn: async () => {
      const res = await apiClient.get('/students', { params: { search, pageSize: 100 } });
      return { students: (res.data?.data || []) as StudentRow[], total: res.data?.meta?.total || 0 };
    },
  });
  const students = studentsData?.students ?? [];
  const totalStudents = studentsData?.total ?? 0;

  const moveMutation = useMutation({
    mutationFn: (studentIds: string[]) =>
      apiClient.post('/students/bulk-assign-class', {
        studentIds,
        classId: targetClassId,
        sectionId: targetSectionId || undefined,
      }),
    onSuccess: (_res, studentIds) => {
      toast.success(`Moved ${studentIds.length} student${studentIds.length === 1 ? '' : 's'} successfully`);
      setSelectedStudents([]);
      queryClient.invalidateQueries({ queryKey: ['students', 'assign-class'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to move selected students');
    },
  });

  const handleMoveSelected = (selected: StudentRow[], clear: () => void) => {
    if (!targetClassId || selected.length === 0) return;
    moveMutation.mutate(
      selected.map((s) => s.id),
      { onSuccess: () => clear() }
    );
  };

  const columns: Column<StudentRow>[] = [
    {
      key: 'name',
      header: 'Student Name',
      primary: true,
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
      <PageHeader
        title="Assign New Student Class"
        description="Search and select students, choose their target class/section, then move them in bulk."
      />

      <div className="glass-card p-4 sm:p-6 rounded-2xl space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <Select
            id="assign-target-class"
            label="Target Class"
            placeholder="-- Select Class --"
            value={targetClassId}
            onChange={(e) => setTargetClassId(e.target.value)}
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            id="assign-target-section"
            label="Target Section"
            placeholder="-- Select Section --"
            value={targetSectionId}
            onChange={(e) => setTargetSectionId(e.target.value)}
            disabled={!targetClassId}
            options={sections.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>

        {isError ? (
          <ErrorState title="Failed to load students" onRetry={() => refetch()} />
        ) : (
          <DataTable
            data={students}
            columns={columns}
            isLoading={isLoading}
            searchPlaceholder="Search students by name or ID..."
            serverSearch
            onSearch={setSearch}
            selectable
            onSelectionChange={setSelectedStudents}
            emptyTitle="No students found"
            emptyDescription="Try a different search."
            bulkActions={(selected, clear) => (
              <Button
                type="button"
                variant="gradient"
                size="sm"
                onClick={() => handleMoveSelected(selected, clear)}
                isLoading={moveMutation.isPending}
                disabled={!targetClassId || moveMutation.isPending}
              >
                <ArrowRightLeft className="w-4 h-4" />
                Move {selected.length} to {classes.find((c) => c.id === targetClassId)?.name || 'class'}
              </Button>
            )}
          />
        )}

        <p className="text-sm text-slate-500 dark:text-slate-400">
          {selectedStudents.length} of {totalStudents} student{totalStudents === 1 ? '' : 's'} selected
          {!targetClassId && selectedStudents.length > 0 && ' — choose a target class to enable the move.'}
        </p>
      </div>
    </div>
  );
};

export default AssignStudentClass;
