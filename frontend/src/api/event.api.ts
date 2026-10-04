import apiClient from './client';

export type EventType = 'SINGLE' | 'MULTIPLE';
export type EventCategory =
  | 'ACADEMIC'
  | 'SPORTS'
  | 'CULTURAL'
  | 'CELEBRATION'
  | 'EXAM'
  | 'MEETING'
  | 'TRIP'
  | 'COMPETITION'
  | 'OTHER';
export type EventAudience = 'STUDENTS' | 'GUARDIANS' | 'TEACHERS' | 'STAFF';
export type EventWhen = 'upcoming' | 'past' | 'all';

export interface SchoolEvent {
  id: string;
  institutionId: string;
  academicYearId: string;
  academicYear: { id: string; label: string };
  title: string;
  description: string | null;
  category: EventCategory;
  type: EventType;
  startDate: string;
  endDate: string;
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  venue: string | null;
  audience: EventAudience[];
  imageUrl: string | null; // data: URL
  createdAt: string;
  updatedAt: string;
}

export interface EventInput {
  title: string;
  description?: string | null;
  academicYearId: string;
  category: EventCategory;
  type: EventType;
  startDate: string;
  endDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  venue?: string | null;
  audience: EventAudience[];
  imageUrl?: string | null;
}

export interface EventFilters {
  academicYearId?: string;
  category?: EventCategory;
  when?: EventWhen;
}

export interface EventList {
  // The session year the list is for (the default one when none was asked for)
  sessionYear: { id: string; label: string; startDate: string; endDate: string } | null;
  events: SchoolEvent[];
}

export const eventApi = {
  list: async (filters: EventFilters = {}): Promise<EventList> => {
    const { data } = await apiClient.get('/events', { params: filters });
    return data.data;
  },

  upcoming: async (limit = 5): Promise<SchoolEvent[]> => {
    const { data } = await apiClient.get('/events/upcoming', { params: { limit } });
    return data.data;
  },

  create: async (dto: EventInput & { notify?: boolean }): Promise<SchoolEvent> => {
    const { data } = await apiClient.post('/events', dto);
    return data.data;
  },

  update: async (id: string, dto: EventInput): Promise<SchoolEvent> => {
    const { data } = await apiClient.put(`/events/${id}`, dto);
    return data.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/events/${id}`);
  },
};
