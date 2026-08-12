import apiClient from './client';

export interface InstitutionApplication {
  id: string;
  institutionName: string;
  slug: string;
  address: string | null;
  phone: string | null;
  applicantFirstName: string;
  applicantLastName: string;
  applicantEmail: string;
  applicantPhone: string | null;
  message: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  reviewedBy: { firstName: string; lastName: string; email: string } | null;
  reviewedAt: string | null;
  createdInstitutionId: string | null;
  createdAt: string;
}

export interface SubmitApplicationPayload {
  institutionName: string;
  slug: string;
  address?: string;
  phone?: string;
  applicantFirstName: string;
  applicantLastName: string;
  applicantEmail: string;
  applicantPhone?: string;
  message?: string;
}

export interface ApproveApplicationResult {
  institution: { id: string; name: string; slug: string };
  admin: { id: string; email: string; firstName: string; lastName: string };
  adminPassword: string;
}

export const institutionApplicationApi = {
  submit: async (payload: SubmitApplicationPayload): Promise<InstitutionApplication> => {
    const { data } = await apiClient.post<any>('/institution-applications/apply', payload);
    return data.data;
  },

  list: async (status?: string): Promise<InstitutionApplication[]> => {
    const { data } = await apiClient.get<any>('/institution-applications', { params: status ? { status } : undefined });
    return data.data;
  },

  approve: async (id: string): Promise<ApproveApplicationResult> => {
    const { data } = await apiClient.post<any>(`/institution-applications/${id}/approve`);
    return data.data;
  },

  reject: async (id: string, reason: string): Promise<InstitutionApplication> => {
    const { data } = await apiClient.post<any>(`/institution-applications/${id}/reject`, { reason });
    return data.data;
  },
};
