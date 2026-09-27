import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Drawer, Button, Alert } from '@/components/ui';
import { compressImage } from './imageCompression';
import UserFormFields, { type UserFormValuesShape } from './UserFormFields';
import {
  useClassesMeta,
  useCreateUser,
  useSectionsMeta,
  useUpdateUser,
  type CreateUserPayload,
  type UpdateUserPayload,
} from './users.queries';
import {
  ASSIGNABLE_ROLE_OPTIONS,
  SUPER_ADMIN_ROLE_OPTION,
  emptyAddUserForm,
  type StudentOption,
  type UserRow,
} from './users.types';

interface UserFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  user: UserRow | null;
  currentUserRole?: string;
}

function validateField(name: string, value: string): string {
  if (name === 'firstName' && !value.trim()) return 'First name is required';
  if (name === 'lastName' && !value.trim()) return 'Last name is required';
  if (name === 'email') {
    if (!value.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
  }
  if (name === 'password' && value && value.length < 8) return 'Password must be at least 8 characters';
  return '';
}

function mapUserToEditValues(user: UserRow): UserFormValuesShape {
  const student = user.studentProfile;
  const teacher = user.teacherProfile;
  const guardian = user.guardianProfile;
  const todayIso = new Date().toISOString().split('T')[0];
  return {
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    phone: user.phone || '',
    role: user.role || 'TEACHER',
    isActive: user.isActive !== false,
    avatarUrl: user.avatarUrl || '',
    rollNumber: student?.rollNumber || '',
    admissionDate: student?.admissionDate ? new Date(student.admissionDate).toISOString().split('T')[0] : todayIso,
    dateOfBirth: student?.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split('T')[0] : '',
    gender: student?.gender || 'Male',
    bloodGroup: student?.bloodGroup || 'A+',
    religion: student?.religion || 'Islam',
    nationality: student?.nationality || 'Bangladeshi',
    address: student?.address || '',
    classId: student?.classId || '',
    sectionId: student?.sectionId || '',
    qualification: teacher?.qualification || '',
    subjectExpertise: teacher?.subjectExpertise || '',
    joiningDate: teacher?.joiningDate ? new Date(teacher.joiningDate).toISOString().split('T')[0] : todayIso,
    relationship: guardian?.relationship || 'FATHER',
  };
}

export default function UserFormDrawer({ isOpen, onClose, mode, user, currentUserRole }: UserFormDrawerProps) {
  const [values, setValues] = useState<UserFormValuesShape>(emptyAddUserForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [guardianChildren, setGuardianChildren] = useState<StudentOption[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  // When the drawer opens already showing a saved class (edit mode), the
  // first section list that comes back must NOT stomp the section the
  // student already has — only actual class *changes* made in this session
  // should reset the section to the class's first one.
  const skipNextAutoSelect = useRef(false);

  const { data: classes = [] } = useClassesMeta();
  const { data: sections = [] } = useSectionsMeta(values.classId);

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && user) {
      const mapped = mapUserToEditValues(user);
      skipNextAutoSelect.current = !!mapped.classId;
      setValues(mapped);
      setGuardianChildren((user.guardianProfile?.students || []).map((gs) => gs.student));
    } else {
      skipNextAutoSelect.current = false;
      setValues(emptyAddUserForm());
      setGuardianChildren([]);
    }
    setErrors({});
  }, [isOpen, mode, user]);

  useEffect(() => {
    if (!values.classId || sections.length === 0) return;
    if (skipNextAutoSelect.current) {
      skipNextAutoSelect.current = false;
      return;
    }
    setValues((prev) => (prev.classId === values.classId ? { ...prev, sectionId: sections[0]?.id || '' } : prev));
  }, [sections, values.classId]);

  const isTargetSuperAdmin = mode === 'edit' && user?.role === 'SUPER_ADMIN';
  const blockedBySuperAdminGuard = isTargetSuperAdmin && currentUserRole !== 'SUPER_ADMIN';

  const handleFieldChange = (name: string, value: string) => {
    if (name === 'classId') {
      setValues((prev) => ({ ...prev, classId: value, sectionId: value ? prev.sectionId : '' }));
      if (errors.classId) setErrors((prev) => ({ ...prev, classId: '' }));
      return;
    }
    setValues((prev) => ({ ...prev, [name]: name === 'isActive' ? value === 'true' : value } as UserFormValuesShape));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleFieldBlur = (name: string, value: string) => {
    const err = validateField(name, value);
    setErrors((prev) => ({ ...prev, [name]: err }));
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setValues((prev) => ({ ...prev, avatarUrl: compressed }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blockedBySuperAdminGuard) return;

    const fieldsToValidate = mode === 'create' ? ['firstName', 'lastName', 'email', 'password'] : ['firstName', 'lastName'];
    const nextErrors: Record<string, string> = {};
    for (const field of fieldsToValidate) {
      const err = validateField(field, (values[field as keyof UserFormValuesShape] as string) || '');
      if (err) nextErrors[field] = err;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstInvalidField = fieldsToValidate.find((f) => nextErrors[f]);
      if (firstInvalidField) formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)?.focus();
      toast.error('Please fix the highlighted fields');
      return;
    }

    const studentIds = values.role === 'GUARDIAN' ? guardianChildren.map((s) => s.id) : undefined;

    if (mode === 'create') {
      const payload: CreateUserPayload = {
        email: values.email || '',
        password: values.password || '',
        role: values.role,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        avatarUrl: values.avatarUrl,
        dateOfBirth: values.dateOfBirth,
        gender: values.gender,
        bloodGroup: values.bloodGroup,
        religion: values.religion,
        nationality: values.nationality,
        address: values.address,
        admissionDate: values.admissionDate,
        rollNumber: values.rollNumber,
        classId: values.classId,
        sectionId: values.sectionId,
        qualification: values.qualification,
        subjectExpertise: values.subjectExpertise,
        joiningDate: values.joiningDate,
        relationship: values.relationship,
        studentIds,
      };
      createMutation.mutate(payload, { onSuccess: () => onClose() });
    } else if (user) {
      const payload: UpdateUserPayload = {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        role: values.role,
        isActive: values.isActive ?? true,
        avatarUrl: values.avatarUrl,
        dateOfBirth: values.dateOfBirth,
        gender: values.gender,
        bloodGroup: values.bloodGroup,
        religion: values.religion,
        nationality: values.nationality,
        address: values.address,
        admissionDate: values.admissionDate,
        rollNumber: values.rollNumber,
        classId: values.classId,
        sectionId: values.sectionId,
        qualification: values.qualification,
        subjectExpertise: values.subjectExpertise,
        joiningDate: values.joiningDate,
        relationship: values.relationship,
        studentIds,
      };
      updateMutation.mutate({ id: user.id, data: payload }, { onSuccess: () => onClose() });
    }
  };

  const roleOptions =
    currentUserRole === 'SUPER_ADMIN' ? [...ASSIGNABLE_ROLE_OPTIONS, SUPER_ADMIN_ROLE_OPTION] : ASSIGNABLE_ROLE_OPTIONS;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'Add New User' : 'Edit User'}
      width="xl"
      footer={
        blockedBySuperAdminGuard ? (
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" form="userForm" variant="gradient" isLoading={isSubmitting}>
              {mode === 'create' ? 'Create User' : 'Save Changes'}
            </Button>
          </>
        )
      }
    >
      {blockedBySuperAdminGuard ? (
        <Alert tone="danger" title="Access denied">
          Only a super admin can view or modify another super admin's account.
        </Alert>
      ) : (
        <form id="userForm" ref={formRef} onSubmit={handleSubmit}>
          <UserFormFields
            mode={mode}
            values={values}
            errors={errors}
            onFieldChange={handleFieldChange}
            onFieldBlur={handleFieldBlur}
            onAvatarChange={handleAvatarChange}
            roleOptions={roleOptions}
            classes={classes}
            sections={sections}
            guardianChildren={guardianChildren}
            onGuardianChildrenChange={setGuardianChildren}
          />
        </form>
      )}
    </Drawer>
  );
}
