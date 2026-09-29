export interface RoutineEntry {
  id: string;
  subject: string;
  teacher: string;
  teacherUserId?: string;
  className?: string;
  sectionName?: string;
}

export interface PaletteBlockType {
  id: string;
  subject: string;
  teacherUserId: string;
  teacherName: string;
}
