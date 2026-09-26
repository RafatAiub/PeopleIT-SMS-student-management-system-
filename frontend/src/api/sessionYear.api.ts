import apiClient from './client';

export type SessionYearStatus = 'CURRENT' | 'UPCOMING' | 'COMPLETED';

export interface SessionYear {
  id: string;
  institutionId: string;
  label: string;
  startDate: string;
  endDate: string;
  // The institution's default session year (exactly one)
  isCurrent: boolean;
  status: SessionYearStatus;
  studentCount: number;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionYearInput {
  label: string;
  startDate: string;
  endDate: string;
}

export const sessionYearApi = {
  list: async (): Promise<SessionYear[]> => {
    const { data } = await apiClient.get('/session-years');
    return data.data;
  },

  create: async (dto: SessionYearInput & { isDefault?: boolean }): Promise<SessionYear> => {
    const { data } = await apiClient.post('/session-years', dto);
    return data.data;
  },

  update: async (id: string, dto: Partial<SessionYearInput>): Promise<SessionYear> => {
    const { data } = await apiClient.patch(`/session-years/${id}`, dto);
    return data.data;
  },

  setDefault: async (id: string): Promise<SessionYear> => {
    const { data } = await apiClient.post(`/session-years/${id}/set-default`);
    return data.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/session-years/${id}`);
  },
};
