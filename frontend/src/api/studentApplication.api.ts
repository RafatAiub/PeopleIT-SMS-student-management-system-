import apiClient from './client';

export interface SubmitStudentApplicationPayload {
  institutionSlug: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  classId?: string;
  guardianFirstName: string;
  guardianLastName: string;
  guardianEmail: string;
  guardianPhone: string;
}

export const studentApplicationApi = {
  listPublicClasses: async (institutionSlug: string): Promise<{ id: string; name: string }[]> => {
    const { data } = await apiClient.get<any>('/student-applications/classes', { params: { institutionSlug } });
    return data.data;
  },

  submit: async (payload: SubmitStudentApplicationPayload): Promise<{ id: string; studentId: string }> => {
    const { data } = await apiClient.post<any>('/student-applications/apply', payload);
    return data.data;
  },

  approve: async (id: string, email: string): Promise<{ email: string; password: string }> => {
    const { data } = await apiClient.post<any>(`/students/${id}/approve`, { email });
    return data.data;
  },
};
