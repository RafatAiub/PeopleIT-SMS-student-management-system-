import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useTableParams } from '../../hooks/useTableParams';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { PageHeader, Select } from '../../components/ui';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ErrorState } from '../../components/ui/Feedback';
import { StudentEditDrawer } from './StudentEditDrawer';
import { ClassMeta } from './studentFormUtils';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'GRADUATED', label: 'Graduated' },
  { value: 'TRANSFERRED', label: 'Transferred' },
];

const StudentListStaff = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const canAdmit = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [students, setStudents] = useState<any[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [classes, setClasses] = useState<ClassMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams();

  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<any>(null);
  const [deletingStudent, setDeletingStudent] = useState(false);

  const fetchStudents = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const queryParams = new URLSearchParams({
        page: params.page.toString(),
        pageSize: params.pageSize.toString(),
      });
      if (debouncedSearch) queryParams.append('search', debouncedSearch);
      if (params.filters.classId) queryParams.append('classId', params.filters.classId);
      if (params.filters.status) queryParams.append('status', params.filters.status);

      const response = await apiClient.get(`/students?${queryParams.toString()}`);
      setStudents(response.data.data || []);
      setTotalStudents(response.data.meta?.total || 0);
    } catch (error: any) {
      console.error('Failed to fetch students data', error);
      toast.error(error.response?.data?.message || 'Failed to fetch student data');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await apiClient.get('/students/meta/classes');
      setClasses(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch classes metadata', error);
      toast.error('Failed to load class list');
    }
  };

  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.page, params.pageSize, debouncedSearch, params.filters.classId, params.filters.status]);

  useEffect(() => {
    fetchClasses();
  }, []);

  const handleOpenEdit = (student: any) => {
    setEditingStudent(student);
    setIsEditOpen(true);
  };

  const handleConfirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    setDeletingStudent(true);
    try {
      await apiClient.delete(`/students/${studentToDelete.id}`);
      toast.success('Student deleted successfully');
      setStudentToDelete(null);
      fetchStudents();
    } catch (error: any) {
      console.error('Failed to delete student', error);
      toast.error(error.response?.data?.message || 'Failed to delete student');
    } finally {
      setDeletingStudent(false);
    }
  };

  const studentColumns: Column<any>[] = [
    {
      key: 'name',
      header: 'Student Name',
      accessor: 'firstName',
      primary: true,
      exportValue: (s) => `${s.firstName} ${s.lastName}`,
      render: (student) => (
        <div className="flex items-center gap-3">
          {student.avatarUrl || student.user?.avatarUrl ? (
            <img
              src={student.avatarUrl || student.user?.avatarUrl}
              alt="Avatar"
              className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-white/10"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              {student.firstName?.[0] || '?'}
            </div>
          )}
          <div>
            <div className="font-medium text-slate-900 dark:text-white">{student.firstName} {student.lastName}</div>
            <div className="text-xs text-slate-500">{student.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'studentId',
      header: 'Admission No',
      accessor: 'studentId',
    },
    {
      key: 'class',
      header: 'Class / Roll',
      sortable: false,
      exportValue: (s) => `${s.class?.name || 'N/A'} (Roll: ${s.rollNumber || 'N/A'})`,
      render: (student) => (
        <>
          <span className="font-medium text-slate-900 dark:text-white">{student.class?.name || 'N/A'}</span>
          <span className="text-slate-500"> (Roll: {student.rollNumber || 'N/A'})</span>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      exportValue: (s) => s.status || 'ACTIVE',
      render: (student) => (
        <Badge variant={student.status === 'ACTIVE' ? 'success' : 'danger'} motionKey={student.status}>
          {student.status || 'ACTIVE'}
        </Badge>
      ),
    },
  ];

  const studentActions: RowAction<any>[] = [
    { label: 'View profile', icon: 'view', onClick: (student) => navigate(`/students/${student.id}`) },
    { label: 'Edit student', icon: 'edit', onClick: handleOpenEdit },
    { label: 'Delete student', icon: 'delete', variant: 'danger', onClick: (student) => setStudentToDelete(student) },
  ];

  const toolbar = (
    <>
      <Select
        aria-label="Filter by class"
        value={params.filters.classId || ''}
        onChange={(e) => setFilter('classId', e.target.value)}
        className="w-auto min-w-40"
        placeholder="All Classes"
        options={classes.map((c) => ({ value: c.id, label: c.name }))}
      />
      <Select
        aria-label="Filter by status"
        value={params.filters.status || ''}
        onChange={(e) => setFilter('status', e.target.value)}
        className="w-auto min-w-36"
        placeholder="All Statuses"
        options={STATUS_OPTIONS}
      />
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Manage student enrollments and profiles."
        actions={
          canAdmit ? (
            <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => navigate('/students/admission')}>
              Add Student
            </Button>
          ) : undefined
        }
      />

      {loadError ? (
        <ErrorState message="Failed to load students." onRetry={fetchStudents} />
      ) : (
        <DataTable
          data={students}
          columns={studentColumns}
          actions={studentActions}
          onRowClick={(student) => navigate(`/students/${student.id}`)}
          isLoading={loading}
          searchPlaceholder="Search students by name or ID..."
          serverSearch
          onSearch={setSearch}
          serverPagination
          totalCount={totalStudents}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          toolbar={toolbar}
          exportFileName="students"
          emptyTitle="No students found"
          emptyDescription="Try adjusting your search or filters, or add a new student."
        />
      )}

      <StudentEditDrawer
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        mode="staff"
        student={editingStudent}
        classes={classes}
        onSaved={fetchStudents}
      />

      <ConfirmModal
        isOpen={!!studentToDelete}
        title="Delete student"
        message={`Are you sure you want to delete ${studentToDelete?.firstName} ${studentToDelete?.lastName}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deletingStudent}
        onConfirm={handleConfirmDeleteStudent}
        onCancel={() => setStudentToDelete(null)}
      />
    </div>
  );
};

export default StudentListStaff;
