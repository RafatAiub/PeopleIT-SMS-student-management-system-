import React from 'react';
import { Users } from 'lucide-react';
import { Modal, Select, Button } from '../../components/ui';
import type { ClassMeta, SectionMeta } from '../../utils/classSections';

interface TeacherOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface AssignForm {
  teacherId: string;
  class: string;
  section: string;
}

interface AssignTeacherModalProps {
  isOpen: boolean;
  onClose: () => void;
  teachersList: TeacherOption[];
  classes: ClassMeta[];
  sections: SectionMeta[];
  form: AssignForm;
  onFormChange: (form: AssignForm) => void;
  onSubmit: (e: React.FormEvent) => void;
  assigning: boolean;
}

/** Admin-only "Assign Class Teacher" dialog, restyled on the shared <Modal>. */
export const AssignTeacherModal: React.FC<AssignTeacherModalProps> = ({
  isOpen,
  onClose,
  teachersList,
  classes,
  sections,
  form,
  onFormChange,
  onSubmit,
  assigning,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={
      <span className="flex items-center gap-2.5">
        <Users className="w-5 h-5 text-primary-500" />
        Assign Class Teacher
      </span>
    }
    size="md"
    footer={
      <>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="assign-teacher-form" isLoading={assigning}>
          Confirm Assignment
        </Button>
      </>
    }
  >
    <form id="assign-teacher-form" onSubmit={onSubmit} className="space-y-4">
      <Select
        label="Select Class Teacher"
        required
        value={form.teacherId}
        onChange={(e) => onFormChange({ ...form, teacherId: e.target.value })}
        placeholder="-- Choose Teacher --"
        options={teachersList.map((t) => ({ value: t.id, label: `${t.firstName} ${t.lastName} (${t.email})` }))}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Class"
          value={form.class}
          onChange={(e) => onFormChange({ ...form, class: e.target.value })}
          options={classes.map((cls) => ({ value: cls.name, label: cls.name }))}
        />
        <Select
          label="Section"
          value={form.section}
          onChange={(e) => onFormChange({ ...form, section: e.target.value })}
          options={sections.map((sec) => ({ value: sec.name, label: sec.name }))}
        />
      </div>
    </form>
  </Modal>
);
