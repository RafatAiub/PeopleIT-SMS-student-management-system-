import apiClient from './client';

export type HolidayType = 'WEEKLY' | 'GOVERNMENT' | 'SCHOOL';

export interface Holiday {
  id: string;
  institutionId: string;
  date: string;
  title: string;
  description: string | null;
  type: HolidayType;
  isTentative: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HolidayCalendar {
  year: number;
  // JS weekday numbers: 0 = Sunday ... 5 = Friday, 6 = Saturday
  weeklyOffDays: number[];
  // FEED = government holidays from the published Bangladesh holiday calendar;
  // FALLBACK = that year isn't published yet, only fixed-date national days.
  governmentSource: 'FEED' | 'FALLBACK' | null;
  governmentSyncedAt: string | null;
  holidays: Holiday[];
}

export interface CreateHolidayDto {
  date: string;
  endDate?: string;
  title: string;
  description?: string;
  type?: HolidayType;
}

export interface UpdateHolidayDto {
  date?: string;
  title?: string;
  description?: string | null;
  type?: HolidayType;
}

export const holidayApi = {
  list: async (year: number): Promise<HolidayCalendar> => {
    const { data } = await apiClient.get('/holidays', { params: { year } });
    return data.data;
  },

  create: async (dto: CreateHolidayDto): Promise<{ created: number }> => {
    const { data } = await apiClient.post('/holidays', dto);
    return data.data;
  },

  update: async (id: string, dto: UpdateHolidayDto): Promise<Holiday> => {
    const { data } = await apiClient.patch(`/holidays/${id}`, dto);
    return data.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/holidays/${id}`);
  },

  updateWeeklyOffDays: async (year: number, weeklyOffDays: number[]): Promise<HolidayCalendar> => {
    const { data } = await apiClient.put(`/holidays/settings/${year}`, { weeklyOffDays });
    return data.data;
  },

  syncGovernment: async (year: number): Promise<{ source: 'FEED' | 'FALLBACK'; added: number; updated: number; removed: number }> => {
    const { data } = await apiClient.post(`/holidays/sync-government/${year}`);
    return data.data;
  },

  restoreDefaults: async (year: number): Promise<{ added: number }> => {
    const { data } = await apiClient.post(`/holidays/restore-defaults/${year}`, {});
    return data.data;
  },
};
