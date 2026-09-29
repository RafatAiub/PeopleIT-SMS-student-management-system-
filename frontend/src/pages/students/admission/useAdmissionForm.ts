import React, { useEffect, useRef, useState } from 'react';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import {
  AdmissionResult,
  CategoryOption,
  CreateFormData,
  GuardianMode,
  GuardianSearchResult,
  SectionOption,
  UploadedFile,
  WizardStep,
} from './types';
import { useCustomFieldDefinitions } from '@/pages/settings/custom-fields/customFields.queries';
import {
  toPayload as customFieldsToPayload,
  validateCustomFields,
  type CustomFieldFormState,
} from '@/pages/settings/custom-fields/customFields.types';
import {
  SUBMIT_VALIDATION_FIELDS,
  STEP_FIELDS,
  emptyCreateFormData,
  emptyGuardianData,
  isDepartmentRequiredForClass,
  validateCreateField,
  validateFields,
} from './validation';

/**
 * All state and handlers for the Students Admission wizard. Logic is carried
 * over unchanged from the original single-page StudentsAdmission.tsx (same
 * fields, same API call sequence, same error handling) — only reorganised
 * behind a hook so the step components can stay presentational.
 */
/** Wizard step that renders the institution's custom fields. */
export const CUSTOM_FIELDS_STEP: WizardStep = 2;

export function useAdmissionForm() {
  const [step, setStep] = useState<WizardStep>(1);
  const [highestStepReached, setHighestStepReached] = useState<WizardStep>(1);
  const [isDirty, setIsDirty] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<AdmissionResult | null>(null);

  const [allSections, setAllSections] = useState<SectionOption[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionsError, setSectionsError] = useState(false);

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState(false);

  const [createFormData, setCreateFormData] = useState(emptyCreateFormData);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [photoFileName, setPhotoFileName] = useState('');
  const [birthCertificate, setBirthCertificate] = useState<UploadedFile | null>(null);
  const [lastPassingResult, setLastPassingResult] = useState<UploadedFile | null>(null);

  const [guardianMode, setGuardianMode] = useState<GuardianMode>('GUARDIAN');
  const [guardianData, setGuardianData] = useState(emptyGuardianData);
  const [guardianPhotoFileName, setGuardianPhotoFileName] = useState('');
  const [guardianQuery, setGuardianQuery] = useState('');
  const [guardianResults, setGuardianResults] = useState<GuardianSearchResult[]>([]);
  const [showGuardianDropdown, setShowGuardianDropdown] = useState(false);
  const [guardianSearchError, setGuardianSearchError] = useState(false);

  // Institution-defined custom fields (Settings -> Custom fields). Rendered on
  // the Academic Placement step; a load failure simply hides the section.
  const customFieldsQuery = useCustomFieldDefinitions();
  const customFieldDefs = customFieldsQuery.data || [];
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldFormState>({});
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});

  const markDirty = () => setIsDirty(true);

  const handleCustomFieldChange = (key: string, value: string) => {
    setCustomFieldValues((prev) => ({ ...prev, [key]: value }));
    if (customFieldErrors[key]) setCustomFieldErrors((prev) => ({ ...prev, [key]: '' }));
    setIsDirty(true);
  };

  const handleCustomFieldBlur = (key: string) => {
    const errs = validateCustomFields(customFieldDefs, customFieldValues);
    setCustomFieldErrors((prev) => ({ ...prev, [key]: errs[key] || '' }));
  };

  /** True when valid; otherwise shows errors, jumps to the step and focuses the first bad field. */
  const checkCustomFields = (): boolean => {
    const errs = validateCustomFields(customFieldDefs, customFieldValues);
    setCustomFieldErrors(errs);
    const firstKey = customFieldDefs.find((d) => errs[d.key])?.key;
    if (!firstKey) return true;
    if (step !== CUSTOM_FIELDS_STEP) setStep(CUSTOM_FIELDS_STEP);
    setTimeout(() => document.querySelector<HTMLElement>(`[name="custom_${firstKey}"]`)?.focus(), 0);
    toast.error('Please fix the highlighted fields');
    return false;
  };

  const fetchAllSections = async () => {
    setSectionsLoading(true);
    setSectionsError(false);
    try {
      const res = await apiClient.get('/academics/sections');
      setAllSections(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch class sections', error);
      setSectionsError(true);
      toast.error('Failed to load class/section list');
    } finally {
      setSectionsLoading(false);
    }
  };

  const fetchCategories = async () => {
    setCategoriesLoading(true);
    setCategoriesError(false);
    try {
      const res = await apiClient.get('/academics/student-categories');
      setCategories(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch student categories', error);
      setCategoriesError(true);
    } finally {
      setCategoriesLoading(false);
    }
  };

  // Prefills GR Number with a suggested "{year}-{sequence}" value, shown
  // read-only like the reference — the server still enforces uniqueness, so
  // a stale suggestion (e.g. two tabs open at once) surfaces as a normal
  // "already exists" error and re-suggests rather than silently colliding.
  const suggestNextStudentId = async () => {
    try {
      const res = await apiClient.get('/students', { params: { pageSize: 1 } });
      const total = Number(res.data?.meta?.total) || 0;
      const year = new Date().getFullYear();
      const next = String(total + 1).padStart(4, '0');
      setCreateFormData((prev) => ({ ...prev, studentId: `${year}-${next}` }));
    } catch (error) {
      console.error('Failed to suggest next GR number', error);
    }
  };

  useEffect(() => {
    fetchAllSections();
    fetchCategories();
    suggestNextStudentId();
  }, []);

  // Warn on browser unload while the form has unsaved input.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const isDepartmentRequired = (sectionId: string) => isDepartmentRequiredForClass(allSections, sectionId);

  const validateField = (name: string, value: string, formState = createFormData): string =>
    validateCreateField(name, value, formState, allSections);

  const handleCreateChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const nextFormState: CreateFormData = { ...createFormData, [name]: value } as CreateFormData;
    setCreateFormData(nextFormState);
    markDirty();
    if (createErrors[name]) setCreateErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleCreateBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCreateErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleClassSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sectionId = e.target.value;
    const section = allSections.find((s) => s.id === sectionId);
    const classId = section?.classId || section?.class?.id || '';
    const nextFormState = { ...createFormData, sectionId, classId };
    setCreateFormData(nextFormState);
    markDirty();
    setCreateErrors((prev) => ({ ...prev, department: validateField('department', nextFormState.department, nextFormState) }));
  };

  const toggleHobby = (hobby: string) => {
    setCreateFormData((prev) => {
      const has = prev.hobbies.includes(hobby);
      return { ...prev, hobbies: has ? prev.hobbies.filter((h) => h !== hobby) : [...prev.hobbies, hobby] };
    });
    markDirty();
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 400;
          const MAX_HEIGHT = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Get base64 string compressed
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = () => {
          resolve(event.target?.result as string);
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        resolve('');
      };
      reader.readAsDataURL(file);
    });
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoSelected = async (file: File) => {
    const compressed = await compressImage(file);
    setCreateFormData((prev) => ({ ...prev, avatarUrl: compressed }));
    setPhotoFileName(file.name);
    markDirty();
  };

  const handleGuardianPhotoSelected = async (file: File) => {
    const compressed = await compressImage(file);
    setGuardianData((prev) => ({ ...prev, avatarUrl: compressed }));
    setGuardianPhotoFileName(file.name);
    markDirty();
  };

  const handleDocumentSelected = async (
    file: File,
    setter: React.Dispatch<React.SetStateAction<UploadedFile | null>>,
  ) => {
    if (file.size > 4 * 1024 * 1024) {
      toast.error('File must be under 4MB');
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setter({ dataUrl, name: file.name, mimeType: file.type });
    markDirty();
  };

  const handleGuardianModeChange = (mode: GuardianMode) => {
    setGuardianMode(mode);
    setGuardianData((prev) => ({ ...prev, relationship: mode === 'GUARDIAN' ? 'GUARDIAN' : 'FATHER' }));
    markDirty();
  };

  const handleGuardianChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setGuardianData((prev) => ({ ...prev, [name]: value, ...(name !== 'guardianId' ? { guardianId: '' } : {}) }));
    if (name === 'email') setGuardianQuery(value);
    markDirty();
  };

  const selectGuardian = (g: GuardianSearchResult) => {
    setGuardianData({
      guardianId: g.id,
      relationship: g.relationship || 'GUARDIAN',
      firstName: g.firstName || '',
      lastName: g.lastName || '',
      phone: g.phone || '',
      email: g.email || '',
      gender: (g.gender as 'MALE' | 'FEMALE') || 'MALE',
      dateOfBirth: g.dateOfBirth ? String(g.dateOfBirth).slice(0, 10) : '',
      occupation: g.occupation || '',
      avatarUrl: g.avatarUrl || '',
    });
    setGuardianPhotoFileName(g.avatarUrl ? 'Existing photo' : '');
    setGuardianQuery(g.email || `${g.firstName} ${g.lastName}`);
    setGuardianResults([]);
    setShowGuardianDropdown(false);
    markDirty();
  };

  const clearGuardianSelection = () => {
    setGuardianData({ ...emptyGuardianData(), relationship: guardianMode === 'GUARDIAN' ? 'GUARDIAN' : 'FATHER' });
    setGuardianQuery('');
    setGuardianResults([]);
    setGuardianPhotoFileName('');
  };

  const guardianSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleGuardianSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setGuardianQuery(value);
    setGuardianData((prev) => ({ ...prev, guardianId: '', email: value }));
    setShowGuardianDropdown(true);
    markDirty();

    if (guardianSearchTimeout.current) clearTimeout(guardianSearchTimeout.current);
    if (!value.trim()) {
      setGuardianResults([]);
      setGuardianSearchError(false);
      return;
    }
    guardianSearchTimeout.current = setTimeout(async () => {
      try {
        const res = await apiClient.get('/guardians', { params: { search: value.trim(), pageSize: 5 } });
        setGuardianResults(res.data.data || []);
        setGuardianSearchError(false);
      } catch (error) {
        console.error('Guardian search failed', error);
        setGuardianSearchError(true);
      }
    }, 300);
  };

  const retryGuardianSearch = () => {
    if (!guardianQuery.trim()) return;
    handleGuardianSearchChange({ target: { value: guardianQuery } } as React.ChangeEvent<HTMLInputElement>);
  };

  const resetAllState = () => {
    setCreateFormData(emptyCreateFormData());
    setCreateErrors({});
    setCustomFieldValues({});
    setCustomFieldErrors({});
    setPhotoFileName('');
    setBirthCertificate(null);
    setLastPassingResult(null);
    setGuardianMode('GUARDIAN');
    clearGuardianSelection();
    suggestNextStudentId();
    setStep(1);
    setHighestStepReached(1);
    setIsDirty(false);
  };

  const goToStep = (target: WizardStep) => {
    if (target <= highestStepReached) setStep(target);
  };

  const goNext = () => {
    const fields = STEP_FIELDS[step];
    const nextErrors = validateFields(fields, createFormData, allSections);
    if (Object.keys(nextErrors).length > 0) {
      setCreateErrors((prev) => ({ ...prev, ...nextErrors }));
      const firstInvalidField = fields.find((f) => nextErrors[f]);
      if (firstInvalidField) {
        document.querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)?.focus();
      }
      toast.error('Please fix the highlighted fields');
      return;
    }
    if (step === CUSTOM_FIELDS_STEP && !checkCustomFields()) return;
    if (step < 5) {
      const next = (step + 1) as WizardStep;
      setStep(next);
      setHighestStepReached((prev) => (prev < next ? next : prev));
    }
  };

  const goBack = () => {
    if (step > 1) setStep((step - 1) as WizardStep);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors = validateFields(SUBMIT_VALIDATION_FIELDS, createFormData, allSections);
    if (Object.keys(nextErrors).length > 0) {
      setCreateErrors(nextErrors);
      const firstInvalidField = SUBMIT_VALIDATION_FIELDS.find((f) => nextErrors[f]);
      if (firstInvalidField) {
        // The invalid field may be on an earlier step — jump back to it.
        const owningStep = ([1, 2, 3, 4, 5] as WizardStep[]).find((s) => STEP_FIELDS[s]?.includes(firstInvalidField));
        if (owningStep && owningStep !== step) setStep(owningStep);
        setTimeout(() => {
          document.querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)?.focus();
        }, 0);
      }
      toast.error('Please fix the highlighted fields');
      return;
    }
    if (!checkCustomFields()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        studentId: createFormData.studentId,
        firstName: createFormData.firstName,
        lastName: createFormData.lastName,
        email: createFormData.email,
        password: createFormData.password,
        phone: createFormData.phone || undefined,
        gender: createFormData.gender,
        classId: createFormData.classId || undefined,
        sectionId: createFormData.sectionId || undefined,
        rollNumber: createFormData.rollNumber || undefined,
        department: createFormData.department || undefined,
        address: createFormData.address || undefined,
        permanentAddress: createFormData.permanentAddress || undefined,
        bloodGroup: createFormData.bloodGroup || undefined,
        religion: createFormData.religion || undefined,
        nationality: createFormData.nationality || undefined,
        avatarUrl: createFormData.avatarUrl || undefined,
        dateOfBirth: createFormData.dateOfBirth || undefined,
        categoryId: createFormData.categoryId || undefined,
        caste: createFormData.caste || undefined,
        admissionDate: createFormData.admissionDate || undefined,
        height: createFormData.height || undefined,
        weight: createFormData.weight || undefined,
        hobbies: createFormData.hobbies.length > 0 ? createFormData.hobbies.join(',') : undefined,
        previousSchool: createFormData.previousSchool.trim() || undefined,
        previousClass: createFormData.previousClass.trim() || undefined,
        medicalNotes: createFormData.medicalNotes.trim() || undefined,
        allergies: createFormData.allergies.trim() || undefined,
        emergencyContactName: createFormData.emergencyContactName.trim() || undefined,
        emergencyContactPhone: createFormData.emergencyContactPhone.trim() || undefined,
        emergencyContactRelation: createFormData.emergencyContactRelation.trim() || undefined,
        // Only sent when the institution has defined custom fields.
        customFields: customFieldDefs.length > 0 ? customFieldsToPayload(customFieldDefs, customFieldValues) : undefined,
      };
      const created = await apiClient.post('/students', payload);
      const studentId: string = created.data?.data?.id;
      toast.success('Student added successfully');

      // Secondary steps (documents + guardian linking) are best-effort — a
      // failure here shouldn't undo or mask the successful student creation
      // above, since the student can always have these added later from
      // Student Details.
      if (studentId && birthCertificate) {
        try {
          await apiClient.post(`/students/${studentId}/documents`, {
            name: birthCertificate.name,
            type: 'BIRTH_CERT',
            fileUrl: birthCertificate.dataUrl,
            mimeType: birthCertificate.mimeType,
          });
        } catch (err) {
          console.error('Failed to upload birth certificate', err);
          toast.error('Student saved, but the birth certificate upload failed — add it later from Student Details.');
        }
      }

      if (studentId && lastPassingResult) {
        try {
          await apiClient.post(`/students/${studentId}/documents`, {
            name: lastPassingResult.name,
            type: 'LAST_RESULT',
            fileUrl: lastPassingResult.dataUrl,
            mimeType: lastPassingResult.mimeType,
          });
        } catch (err) {
          console.error('Failed to upload last passing result', err);
          toast.error('Student saved, but the last passing result upload failed — add it later from Student Details.');
        }
      }

      const hasGuardianInput = guardianData.guardianId || (guardianData.firstName && guardianData.lastName && guardianData.phone);
      let guardianName = '';
      if (studentId && hasGuardianInput) {
        try {
          let guardianId = guardianData.guardianId;
          if (!guardianId) {
            const guardianRes = await apiClient.post('/guardians', {
              firstName: guardianData.firstName,
              lastName: guardianData.lastName,
              relationship: guardianData.relationship,
              phone: guardianData.phone,
              email: guardianData.email || undefined,
              gender: guardianData.gender || undefined,
              occupation: guardianData.occupation || undefined,
              dateOfBirth: guardianData.dateOfBirth || undefined,
              avatarUrl: guardianData.avatarUrl || undefined,
            });
            guardianId = guardianRes.data?.data?.id;
          }
          if (guardianId) {
            await apiClient.post(`/guardians/students/${studentId}/link`, {
              guardianId,
              relationship: guardianData.relationship,
              isPrimary: true,
            });
            guardianName = `${guardianData.firstName} ${guardianData.lastName}`.trim();
          }
        } catch (err: any) {
          console.error('Failed to save guardian details', err);
          toast.error(err.response?.data?.message || 'Student saved, but guardian details could not be saved — add them later from the Guardians page.');
        }
      }

      const section = allSections.find((s) => s.id === createFormData.sectionId);
      const category = categories.find((c) => c.id === createFormData.categoryId);

      setSubmittedResult({
        studentId: createFormData.studentId,
        firstName: createFormData.firstName,
        lastName: createFormData.lastName,
        email: createFormData.email,
        password: createFormData.password,
        sectionLabel: section ? `${section.class?.name || ''} - ${section.name}` : '',
        categoryLabel: category?.name || '',
        guardianName,
      });

      // Admissions-desk flow: clear the form back to empty (with a fresh
      // admissionDate and GR Number suggestion) so the next student can be
      // entered right away — now via the "Add Another Student" action on
      // the result screen instead of an immediate silent reset.
      resetAllState();
    } catch (error: any) {
      console.error('Failed to create student', error);
      // Server-side custom field validation (422) lists fields as "customFields.<key>".
      const serverErrors: { field?: string; message?: string }[] = Array.isArray(error.response?.data?.errors)
        ? error.response.data.errors
        : [];
      const customErrs: Record<string, string> = {};
      for (const item of serverErrors) {
        const match = item.field ? /customFields\.(.+)$/.exec(item.field) : null;
        if (match && item.message) customErrs[match[1]] = item.message;
      }
      if (Object.keys(customErrs).length > 0) {
        setCustomFieldErrors(customErrs);
        setStep(CUSTOM_FIELDS_STEP);
      }
      toast.error(serverErrors[0]?.message || error.response?.data?.message || 'Failed to create student');
      // A stale GR Number suggestion (two admissions clerks racing) surfaces
      // as a 409 here — refresh it so the next submit attempt has a fresh one.
      if (error.response?.status === 409) {
        suggestNextStudentId();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startAnother = () => {
    setSubmittedResult(null);
  };

  return {
    step,
    highestStepReached,
    goToStep,
    goNext,
    goBack,
    isDirty,
    submittedResult,
    startAnother,

    allSections,
    sectionsLoading,
    sectionsError,
    refetchSections: fetchAllSections,

    categories,
    categoriesLoading,
    categoriesError,
    refetchCategories: fetchCategories,

    createFormData,
    createErrors,
    isSubmitting,
    handleCreateChange,
    handleCreateBlur,
    handleClassSectionChange,
    toggleHobby,
    isDepartmentRequired,

    photoFileName,
    birthCertificate,
    lastPassingResult,
    handlePhotoSelected,
    handleGuardianPhotoSelected,
    handleDocumentSelected,
    setBirthCertificate,
    setLastPassingResult,

    guardianMode,
    guardianData,
    guardianPhotoFileName,
    guardianQuery,
    guardianResults,
    showGuardianDropdown,
    guardianSearchError,
    setShowGuardianDropdown,
    handleGuardianModeChange,
    handleGuardianChange,
    selectGuardian,
    clearGuardianSelection,
    handleGuardianSearchChange,
    retryGuardianSearch,

    customFieldDefs,
    customFieldsLoading: customFieldsQuery.isLoading,
    customFieldsError: customFieldsQuery.isError,
    customFieldValues,
    customFieldErrors,
    handleCustomFieldChange,
    handleCustomFieldBlur,

    handleCreateSubmit,
  };
}

export type AdmissionFormApi = ReturnType<typeof useAdmissionForm>;
