import apiClient from './client';

export interface AuthorizedEmail {
  id: string;
  email: string;
  note: string | null;
  addedBy: { firstName: string; lastName: string; email: string } | null;
  createdAt: string;
}

export interface AddAuthorizedEmailPayload {
  email: string;
  note?: string;
}

export const authorizedEmailApi = {
  list: async (): Promise<AuthorizedEmail[]> => {
    const { data } = await apiClient.get<any>('/authorized-emails');
    return data.data;
  },

  add: async (payload: AddAuthorizedEmailPayload): Promise<AuthorizedEmail> => {
    const { data } = await apiClient.post<any>('/authorized-emails', payload);
    return data.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/authorized-emails/${id}`);
  },
};
