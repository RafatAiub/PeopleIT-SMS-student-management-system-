import apiClient from './client';

export type LeadStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'DISMISSED';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  institutionName: string | null;
  institutionType: string | null;
  message: string | null;
  source: string | null;
  status: LeadStatus;
  authorizedEmailId: string | null;
  authorizedEmail: { id: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitLeadPayload {
  name: string;
  phone: string;
  email?: string;
  institutionName?: string;
  institutionType?: string;
  message?: string;
  source?: string;
  website?: string; // honeypot — always left blank by real users
}

export interface UpdateLeadPayload {
  status?: LeadStatus;
  email?: string;
  authorizedEmailId?: string;
}

export const leadApi = {
  submit: async (payload: SubmitLeadPayload): Promise<Lead | null> => {
    const { data } = await apiClient.post<any>('/leads', payload);
    return data.data;
  },

  list: async (status?: string): Promise<Lead[]> => {
    const { data } = await apiClient.get<any>('/leads', { params: status ? { status } : undefined });
    return data.data;
  },

  update: async (id: string, payload: UpdateLeadPayload): Promise<Lead> => {
    const { data } = await apiClient.patch<any>(`/leads/${id}`, payload);
    return data.data;
  },
};
