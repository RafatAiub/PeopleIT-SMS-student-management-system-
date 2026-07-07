import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsApi, type StudentFilters, type CreateStudentDto } from '@/api/students.api';
import toast from 'react-hot-toast';

export const STUDENTS_KEY = 'students';

export function useStudents(filters: StudentFilters = {}) {
  return useQuery({
    queryKey: [STUDENTS_KEY, filters],
    queryFn: () => studentsApi.getAll(filters),
  });
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: [STUDENTS_KEY, id],
    queryFn: () => studentsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStudentDto) => studentsApi.create(data),
    onSuccess: (student) => {
      qc.invalidateQueries({ queryKey: [STUDENTS_KEY] });
      toast.success(`${student.firstName} ${student.lastName} admitted successfully!`);
    },
    onError: () => {
      toast.error('Failed to create student. Please try again.');
    },
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateStudentDto> }) =>
      studentsApi.update(id, data),
    onSuccess: (student) => {
      qc.invalidateQueries({ queryKey: [STUDENTS_KEY] });
      toast.success(`${student.firstName}'s profile updated.`);
    },
    onError: () => {
      toast.error('Failed to update student.');
    },
  });
}

export function useDeleteStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => studentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [STUDENTS_KEY] });
      toast.success('Student record deleted.');
    },
    onError: () => {
      toast.error('Failed to delete student.');
    },
  });
}
