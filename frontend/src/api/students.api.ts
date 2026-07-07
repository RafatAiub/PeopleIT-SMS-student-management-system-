import apiClient from './client';

export interface Student {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  religion?: string;
  bloodGroup?: string;
  address?: string;
  className: string;
  section: string;
  rollNumber?: string;
  admissionDate: string;
  status: 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'GRADUATED';
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  guardianRelation: string;
  guardianOccupation?: string;
  photoUrl?: string;
  institutionId: string;
}

export interface StudentFilters {
  search?: string;
  className?: string;
  section?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedStudents {
  data: Student[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateStudentDto {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  religion?: string;
  bloodGroup?: string;
  address?: string;
  className: string;
  section: string;
  rollNumber?: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  guardianRelation: string;
  guardianOccupation?: string;
}

export const studentsApi = {
  getAll: async (filters: StudentFilters = {}): Promise<PaginatedStudents> => {
    const { data } = await apiClient.get<PaginatedStudents>('/students', { params: filters });
    return data;
  },

  getById: async (id: string): Promise<Student> => {
    const { data } = await apiClient.get<Student>(`/students/${id}`);
    return data;
  },

  create: async (student: CreateStudentDto): Promise<Student> => {
    const { data } = await apiClient.post<Student>('/students', student);
    return data;
  },

  update: async (id: string, student: Partial<CreateStudentDto>): Promise<Student> => {
    const { data } = await apiClient.patch<Student>(`/students/${id}`, student);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/students/${id}`);
  },

  uploadDocument: async (id: string, file: File, type: string): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    const { data } = await apiClient.post<{ url: string }>(
      `/students/${id}/documents`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },

  uploadPhoto: async (id: string, file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('photo', file);
    const { data } = await apiClient.post<{ url: string }>(
      `/students/${id}/photo`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },
};
