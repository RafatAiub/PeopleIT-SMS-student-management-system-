import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { PageHeader, ErrorState, Alert } from '../../components/ui';

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
  /** Flattened for DataTable's client-side search (which only matches `accessor` fields). */
  className?: string;
}

const SECTIONS_KEY = ['academics', 'all-sections'];

const AssignClassTeacher = () => {
  const queryClient = useQueryClient();
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  const {
    data: sections = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: SECTIONS_KEY,
    queryFn: async () => {
      // No classId query param — returns every section institution-wide,
      // each with its class name and current class teacher nested.
      const res = await apiClient.get('/academics/sections');
      const rows = (res.data?.data || []) as SectionRow[];
      return rows.map((r) => ({ ...r, className: r.class?.name || 'N/A' }));
    },
  });

  const { data: teacherData } = useQuery({
    queryKey: ['teachers-lite-with-total'],
    queryFn: async () => {
      const res = await apiClient.get('/users?role=TEACHER&pageSize=100');
      const users = res.data?.data || [];
      const options: TeacherOption[] = users
        .filter((u: any) => !!u.teacherProfile)
        .map((u: any) => ({ id: u.teacherProfile.id, label: `${u.firstName} ${u.lastName}` }));
      return { options, total: res.data?.meta?.total ?? options.length };
    },
  });
  const teachers = teacherData?.options ?? [];
  const teachersTruncated = (teacherData?.total ?? 0) > teachers.length;

  const updateMutation = useMutation({
    mutationFn: ({ id, classTeacherId }: { id: string; classTeacherId: string }) =>
      apiClient.put(`/academics/sections/${id}`, { classTeacherId: classTeacherId || null }),
    onSuccess: () => {
      toast.success('Class teacher updated');
      queryClient.invalidateQueries({ queryKey: SECTIONS_KEY });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update class teacher');
    },
    onSettled: () => setSavingRowId(null),
  });

  const handleTeacherChange = (row: SectionRow, newTeacherId: string) => {
    setSavingRowId(row.id);
    updateMutation.mutate({ id: row.id, classTeacherId: newTeacherId });
  };

  const columns: Column<SectionRow>[] = [
    {
      key: 'class',
      header: 'Class',
      accessor: 'className',
    },
    {
      key: 'name',
      header: 'Section',
      accessor: 'name',
      primary: true,
    },
    {
      key: 'classTeacher',
      header: 'Class Teacher',
      sortable: false,
      hideOnMobile: false,
      render: (row) => {
        const current = row.classTeacherId || row.classTeacher?.id || '';
        const label = `Class teacher for ${row.className || 'N/A'} ${row.name}`;
        return (
          <select
            value={current}
            onChange={(e) => handleTeacherChange(row, e.target.value)}
            disabled={savingRowId === row.id}
            aria-label={label}
            title={label}
            className="input-field cursor-pointer disabled:opacity-50 max-w-[220px]"
          >
            <option value="">Unassigned</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assign Class Teacher"
        description="Assign a class teacher to every section institution-wide. Changes save automatically."
      />

      {teachersTruncated && (
        <Alert tone="warning" title="Teacher list truncated">
          Showing the first {teachers.length} of {teacherData?.total} teachers. Use the school-wide teacher search under
          Manage Teacher to find someone not listed here.
        </Alert>
      )}

      <div className="glass-card p-4 sm:p-6 rounded-2xl">
        {isError ? (
          <ErrorState title="Failed to load sections" onRetry={() => refetch()} />
        ) : (
          <DataTable
            data={sections}
            columns={columns}
            isLoading={isLoading}
            searchPlaceholder="Search by class or section..."
            emptyTitle="No sections found"
            emptyDescription="Create classes and sections under Academics first."
          />
        )}
      </div>
    </div>
  );
};

export default AssignClassTeacher;
