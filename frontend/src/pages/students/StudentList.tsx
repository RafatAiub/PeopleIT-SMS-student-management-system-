import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, X, Edit2, UserCheck, BookOpen, Receipt,
  Library, Bus, Megaphone, Calendar, Mail, Phone, Droplet, MapPin, Cake,
} from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useTableParams } from '../../hooks/useTableParams';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';

const StudentList = () => {
  const { user } = useAuthStore();
  const isStudent = user?.role === 'STUDENT';

  const [students, setStudents] = useState<any[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [classes, setClasses] = useState<any[]>([]);
  const [availableSections, setAvailableSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Student Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  
  const [editFormData, setEditFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    gender: 'MALE',
    classId: '',
    sectionId: '',
    rollNumber: '',
    status: 'ACTIVE',
    address: '',
    bloodGroup: '',
    religion: '',
    nationality: 'Bangladeshi',
    avatarUrl: ''
  });

  const fetchStudents = async () => {
    // The auth store hydrates from sessionStorage asynchronously, so `user`
    // is null on the very first render — bail out rather than firing the
    // staff-only /students list with a still-unresolved role.
    if (!user) return;
    setLoading(true);
    try {
      if (isStudent) {
        // Fetch own student profile
        const response = await apiClient.get('/students/me');
        setSelectedStudent(response.data.data);
      } else {
        // Fetch student list for Admins/Teachers
        const queryParams = new URLSearchParams({
          page: params.page.toString(),
          pageSize: params.pageSize.toString(),
        });
        if (debouncedSearch) queryParams.append('search', debouncedSearch);
        if (params.filters.classId) queryParams.append('classId', params.filters.classId);
        if (params.filters.status) queryParams.append('status', params.filters.status);

        const response = await apiClient.get(`/students?${queryParams.toString()}`);
        setStudents(response.data.data || []);
        setTotalStudents(response.data.meta?.total || 0);
      }
    } catch (error: any) {
      console.error('Failed to fetch students data', error);
      toast.error(error.response?.data?.message || 'Failed to fetch student data');
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    if (!user || isStudent) return; // Students don't need classes metadata
    try {
      const response = await apiClient.get('/students/meta/classes');
      setClasses(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch classes metadata', error);
      toast.error('Failed to load class list');
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, [user, isStudent, params.page, params.pageSize, debouncedSearch, params.filters.classId, params.filters.status]);

  const fetchSectionsForEdit = async (classId: string, selectFirst: boolean = false) => {
    if (!classId) {
      setAvailableSections([]);
      setEditFormData(prev => ({ ...prev, sectionId: '' }));
      return;
    }
    try {
      const res = await apiClient.get(`/students/meta/sections?classId=${classId}`);
      const sections = res.data.data || [];
      setAvailableSections(sections);
      if (selectFirst) {
        setEditFormData(prev => ({ ...prev, sectionId: sections.length > 0 ? sections[0].id : '' }));
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const validateEditField = (name: string, value: string): string => {
    if (name === 'firstName' && !value.trim()) return 'First name is required';
    if (name === 'lastName' && !value.trim()) return 'Last name is required';
    if (name === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
    return '';
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
    if (editErrors[name]) setEditErrors(prev => ({ ...prev, [name]: '' }));

    if (name === 'classId') {
      fetchSectionsForEdit(value, true);
    }
  };

  const handleEditBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditErrors(prev => ({ ...prev, [name]: validateEditField(name, value) }));
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressed = await compressImage(file);
      setEditFormData(prev => ({ ...prev, avatarUrl: compressed }));
    }
  };

  const handleOpenEditModal = (student: any) => {
    setSelectedStudent(student);
    setEditErrors({});

    // Students only edit their own personal fields — class/section are
    // staff-managed, and /students/meta/sections is a staff-only endpoint
    // that would 403 for a STUDENT caller here.
    const studentClassId = student.class?.id || '';
    if (!isStudent && studentClassId) {
      fetchSectionsForEdit(studentClassId, false).then(() => {
        setEditFormData(prev => ({ ...prev, sectionId: student.section?.id || '' }));
      });
    } else {
      setAvailableSections([]);
    }

    setEditFormData({
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      email: student.email || '',
      phone: student.phone || '',
      gender: student.gender || 'MALE',
      classId: studentClassId,
      sectionId: student.section?.id || '',
      rollNumber: student.rollNumber || '',
      status: student.status || 'ACTIVE',
      address: student.address || '',
      bloodGroup: student.bloodGroup || '',
      religion: student.religion || '',
      nationality: student.nationality || 'Bangladeshi',
      avatarUrl: student.avatarUrl || student.user?.avatarUrl || ''
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    const fieldsToValidate = ['firstName', 'lastName', 'email'];
    const nextErrors: Record<string, string> = {};
    for (const field of fieldsToValidate) {
      const err = validateEditField(field, (editFormData as any)[field] || '');
      if (err) nextErrors[field] = err;
    }
    if (Object.keys(nextErrors).length > 0) {
      setEditErrors(nextErrors);
      const firstInvalidField = fieldsToValidate.find((f) => nextErrors[f]);
      if (firstInvalidField) {
        (e.target as HTMLFormElement).querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)?.focus();
      }
      toast.error('Please fix the highlighted fields');
      return;
    }

    setIsSubmitting(true);

    // Prepare payload.
    // If student, they only edit basic personal info (firstName, lastName, phone, gender)
    const payload: any = isStudent 
      ? {
          firstName: editFormData.firstName,
          lastName: editFormData.lastName,
          phone: editFormData.phone || undefined,
          gender: editFormData.gender,
          address: editFormData.address || undefined,
          bloodGroup: editFormData.bloodGroup || undefined,
          religion: editFormData.religion || undefined,
          nationality: editFormData.nationality || undefined,
          avatarUrl: editFormData.avatarUrl || undefined
        }
      : {
          firstName: editFormData.firstName,
          lastName: editFormData.lastName,
          email: editFormData.email || undefined,
          phone: editFormData.phone || undefined,
          gender: editFormData.gender,
          rollNumber: editFormData.rollNumber || undefined,
          status: editFormData.status,
          classId: editFormData.classId || undefined,
          sectionId: editFormData.sectionId || undefined,
          address: editFormData.address || undefined,
          bloodGroup: editFormData.bloodGroup || undefined,
          religion: editFormData.religion || undefined,
          nationality: editFormData.nationality || undefined,
          avatarUrl: editFormData.avatarUrl || undefined
        };

    try {
      await apiClient.put(`/students/${selectedStudent.id}`, payload);
      toast.success('Profile updated successfully');
      setIsEditModalOpen(false);
      fetchStudents();
    } catch (error: any) {
      console.error('Failed to update student', error);
      toast.error(error.response?.data?.message || 'Failed to update student');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [studentToDelete, setStudentToDelete] = useState<any>(null);
  const [deletingStudent, setDeletingStudent] = useState(false);

  const handleConfirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    setDeletingStudent(true);
    try {
      await apiClient.delete(`/students/${studentToDelete.id}`);
      toast.success('Student deleted successfully');
      setStudentToDelete(null);
      fetchStudents();
    } catch (error: any) {
      console.error('Failed to delete student', error);
      toast.error(error.response?.data?.message || 'Failed to delete student');
    } finally {
      setDeletingStudent(false);
    }
  };

  if (loading) {
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center">Loading Student Portal...</div>;
  }

  // =============================================================================
  // STUDENT PORTAL VIEW (For role = STUDENT)
  // =============================================================================
  if (isStudent) {
    if (!selectedStudent) {
      return (
        <div className="glass-card p-8 text-center text-slate-600 dark:text-slate-400 rounded-2xl border border-slate-200/50 dark:border-white/5">
          Your student profile record could not be found. Please contact the administrator.
        </div>
      );
    }

    const quickLinks = [
      { to: '/attendance', icon: UserCheck, label: 'Attendance', desc: 'My attendance history & fines', color: 'from-emerald-500 to-teal-500' },
      { to: '/results', icon: BookOpen, label: 'Results', desc: 'Exam marks & report cards', color: 'from-indigo-500 to-blue-500' },
      { to: '/fees', icon: Receipt, label: 'Fees & Billing', desc: 'Invoices & online payment', color: 'from-amber-500 to-orange-500' },
      { to: '/timetables', icon: Calendar, label: 'Timetable', desc: 'My class routine', color: 'from-purple-500 to-fuchsia-500' },
      { to: '/library', icon: Library, label: 'Library', desc: 'My borrowed books', color: 'from-cyan-500 to-sky-500' },
      { to: '/transport', icon: Bus, label: 'Transport', desc: 'My route & vehicle', color: 'from-rose-500 to-pink-500' },
      { to: '/notices', icon: Megaphone, label: 'Notices', desc: 'School announcements', color: 'from-lime-500 to-green-500' },
    ];

    return (
      <div className="space-y-6 max-w-5xl">
        {/* Hero */}
        <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 p-6 sm:p-8 bg-gradient-to-br from-indigo-500/5 via-transparent to-teal-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            {selectedStudent.avatarUrl || selectedStudent.user?.avatarUrl ? (
              <img
                src={selectedStudent.avatarUrl || selectedStudent.user?.avatarUrl}
                alt="Avatar"
                className="w-24 h-24 rounded-2xl object-cover border border-slate-200/50 dark:border-white/10 shadow-lg flex-shrink-0"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-teal-500 flex items-center justify-center text-3xl font-bold text-white glow-indigo shadow-lg flex-shrink-0">
                {selectedStudent.firstName?.[0] || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {selectedStudent.firstName} {selectedStudent.lastName}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                  {selectedStudent.status || 'ACTIVE'}
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Student ID {selectedStudent.studentId} · {selectedStudent.class?.name || 'No class'} {selectedStudent.section?.name ? `- ${selectedStudent.section.name}` : ''} · Roll {selectedStudent.rollNumber || 'N/A'}
              </p>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-2">Welcome back! Here's your student hub — everything about your school life in one place.</p>
            </div>
            <button
              onClick={() => handleOpenEditModal(selectedStudent)}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-semibold active:scale-[0.98] self-start sm:self-center flex-shrink-0"
            >
              <Edit2 className="w-4 h-4" />
              Edit Personal Data
            </button>
          </div>
        </div>

        {/* Quick access grid */}
        <div>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Quick Access</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {quickLinks.map(({ to, icon: Icon, label, desc, color }) => (
              <Link
                key={to}
                to={to}
                className="glass-card group p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20 hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-3"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Personal & Academic Details */}
        <div className="glass-card p-6 rounded-2xl border border-slate-200/50 dark:border-white/5">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5">Personal &amp; Academic Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-sm">
            {[
              { icon: Users, label: 'Full Name', value: `${selectedStudent.firstName} ${selectedStudent.lastName}` },
              { icon: Mail, label: 'Email Address', value: selectedStudent.email || 'N/A' },
              { icon: Phone, label: 'Phone Number', value: selectedStudent.phone || 'N/A' },
              { icon: Users, label: 'Gender', value: selectedStudent.gender ? selectedStudent.gender.charAt(0) + selectedStudent.gender.slice(1).toLowerCase() : 'N/A' },
              { icon: Droplet, label: 'Blood Group', value: selectedStudent.bloodGroup || 'N/A' },
              { icon: MapPin, label: 'Address', value: selectedStudent.address || 'N/A' },
              { icon: Cake, label: 'Admission Date', value: selectedStudent.admissionDate ? new Date(selectedStudent.admissionDate).toLocaleDateString() : 'N/A' },
              { icon: Users, label: 'Branch', value: selectedStudent.branch?.name || 'Main Branch' },
              { icon: Calendar, label: 'Academic Year', value: selectedStudent.academicYear?.label || new Date().getFullYear().toString() },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 flex-shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs text-slate-500 block">{label}</span>
                  <span className="text-slate-800 dark:text-white font-medium mt-0.5 block truncate" title={value}>{value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edit Student Modal (Student Version - Personal Data Only) */}
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Edit Personal Data</h3>
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">First Name</label>
                    <input
                      type="text"
                      name="firstName"
                      required
                      value={editFormData.firstName}
                      onChange={handleEditChange}
                      onBlur={handleEditBlur}
                      className={`input-field ${editErrors.firstName ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                    />
                    {editErrors.firstName && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{editErrors.firstName}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                    <input
                      type="text"
                      name="lastName"
                      required
                      value={editFormData.lastName}
                      onChange={handleEditChange}
                      onBlur={handleEditBlur}
                      className={`input-field ${editErrors.lastName ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                    />
                    {editErrors.lastName && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{editErrors.lastName}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                  <input
                    type="text"
                    name="phone"
                    value={editFormData.phone}
                    onChange={handleEditChange}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Gender</label>
                  <select
                    name="gender"
                    value={editFormData.gender}
                    onChange={handleEditChange}
                    className="input-field appearance-none"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Blood Group</label>
                    <select
                      name="bloodGroup"
                      value={editFormData.bloodGroup}
                      onChange={handleEditChange}
                      className="input-field"
                    >
                      <option value="">Select Blood Group</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Religion</label>
                    <select
                      name="religion"
                      value={editFormData.religion}
                      onChange={handleEditChange}
                      className="input-field"
                    >
                      <option value="">Select Religion</option>
                      <option value="Islam">Islam</option>
                      <option value="Hinduism">Hinduism</option>
                      <option value="Christianity">Christianity</option>
                      <option value="Buddhism">Buddhism</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nationality</label>
                    <input
                      type="text"
                      name="nationality"
                      value={editFormData.nationality}
                      onChange={handleEditChange}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Profile Photo</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="w-full text-slate-700 dark:text-slate-300 text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600/10 file:text-blue-600 dark:file:text-blue-400 hover:file:bg-blue-600/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address</label>
                  <textarea
                    name="address"
                    rows={2}
                    value={editFormData.address}
                    onChange={handleEditChange}
                    placeholder="Enter permanent address"
                    className="input-field resize-none"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmitting ? 'Updating...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =============================================================================
  // STANDARD ADMISSIONS/DIRECTORY VIEW (For role = ADMIN / TEACHER)
  // =============================================================================
  const studentColumns: Column<any>[] = [
    {
      key: 'name',
      header: 'Student Name',
      accessor: 'firstName',
      render: (student) => (
        <div className="flex items-center gap-3">
          {student.avatarUrl || student.user?.avatarUrl ? (
            <img
              src={student.avatarUrl || student.user?.avatarUrl}
              alt="Avatar"
              className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-white/10"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              {student.firstName?.[0] || '?'}
            </div>
          )}
          <div>
            <div className="font-medium text-slate-900 dark:text-white">{student.firstName} {student.lastName}</div>
            <div className="text-xs text-slate-500">{student.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'studentId',
      header: 'Admission No',
      accessor: 'studentId',
    },
    {
      key: 'class',
      header: 'Class / Roll',
      sortable: false,
      render: (student) => (
        <>
          <span className="font-medium text-slate-900 dark:text-white">{student.class?.name || 'N/A'}</span>
          <span className="text-slate-500"> (Roll: {student.rollNumber || 'N/A'})</span>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (student) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          student.status === 'ACTIVE'
            ? 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-500/20'
            : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20'
        }`}>
          {student.status || 'ACTIVE'}
        </span>
      ),
    },
  ];

  const studentActions: RowAction<any>[] = [
    { label: 'Edit student', icon: 'edit', onClick: handleOpenEditModal },
    { label: 'Delete student', icon: 'delete', variant: 'danger', onClick: (student) => setStudentToDelete(student) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Students</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Manage student enrollments and profiles.</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 shadow-sm">
        <div className="p-4 border-b border-slate-200/50 dark:border-white/5 flex flex-wrap items-center gap-3">
          <select
            value={params.filters.classId || ''}
            onChange={(e) => setFilter('classId', e.target.value)}
            className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer transition-colors"
          >
            <option value="" className="bg-white dark:bg-slate-900">All Classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900">{c.name}</option>
            ))}
          </select>
          <select
            value={params.filters.status || ''}
            onChange={(e) => setFilter('status', e.target.value)}
            className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer transition-colors"
          >
            <option value="" className="bg-white dark:bg-slate-900">All Statuses</option>
            <option value="ACTIVE" className="bg-white dark:bg-slate-900">Active</option>
            <option value="INACTIVE" className="bg-white dark:bg-slate-900">Inactive</option>
            <option value="GRADUATED" className="bg-white dark:bg-slate-900">Graduated</option>
            <option value="TRANSFERRED" className="bg-white dark:bg-slate-900">Transferred</option>
          </select>
        </div>

        <div className="p-4">
          <DataTable
            data={students}
            columns={studentColumns}
            actions={studentActions}
            isLoading={loading}
            searchPlaceholder="Search students by name or ID..."
            serverSearch
            onSearch={setSearch}
            serverPagination
            totalCount={totalStudents}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            emptyTitle="No students found"
            emptyDescription="Try adjusting your search or filters, or add a new student."
          />
        </div>
      </div>

      {/* Edit Student Modal */}
      {isEditModalOpen && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Edit Student Profile</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">First Name</label>
                  <input
                    type="text"
                    name="firstName"
                    required
                    placeholder="e.g. John"
                    value={editFormData.firstName}
                    onChange={handleEditChange}
                    onBlur={handleEditBlur}
                    className={`input-field ${editErrors.firstName ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                  />
                  {editErrors.firstName && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{editErrors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    name="lastName"
                    required
                    placeholder="e.g. Doe"
                    value={editFormData.lastName}
                    onChange={handleEditChange}
                    onBlur={handleEditBlur}
                    className={`input-field ${editErrors.lastName ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                  />
                  {editErrors.lastName && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{editErrors.lastName}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class</label>
                  <select
                    name="classId"
                    value={editFormData.classId}
                    onChange={handleEditChange}
                    className="input-field"
                  >
                    <option value="">-- No Class Assigned --</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Section</label>
                  <select
                    name="sectionId"
                    value={editFormData.sectionId}
                    onChange={handleEditChange}
                    disabled={!editFormData.classId}
                    className="input-field disabled:opacity-50"
                  >
                    <option value="">-- Select Section --</option>
                    {availableSections.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Roll Number</label>
                  <input
                    type="text"
                    name="rollNumber"
                    value={editFormData.rollNumber}
                    onChange={handleEditChange}
                    placeholder="e.g. 15"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <select
                    name="status"
                    value={editFormData.status}
                    onChange={handleEditChange}
                    className="input-field"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="GRADUATED">Graduated</option>
                    <option value="TRANSFERRED">Transferred</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Gender</label>
                  <select
                    name="gender"
                    value={editFormData.gender}
                    onChange={handleEditChange}
                    className="input-field appearance-none"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                  <input
                    type="text"
                    name="phone"
                    placeholder="e.g. +8801700000000"
                    value={editFormData.phone}
                    onChange={handleEditChange}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  placeholder="e.g. john.doe@school.edu"
                  value={editFormData.email}
                  onChange={handleEditChange}
                  onBlur={handleEditBlur}
                  className={`input-field ${editErrors.email ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                />
                {editErrors.email && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{editErrors.email}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Blood Group</label>
                  <select
                    name="bloodGroup"
                    value={editFormData.bloodGroup}
                    onChange={handleEditChange}
                    className="input-field"
                  >
                    <option value="">Select Blood Group</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Religion</label>
                  <select
                    name="religion"
                    value={editFormData.religion}
                    onChange={handleEditChange}
                    className="input-field"
                  >
                    <option value="">Select Religion</option>
                    <option value="Islam">Islam</option>
                    <option value="Hinduism">Hinduism</option>
                    <option value="Christianity">Christianity</option>
                    <option value="Buddhism">Buddhism</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nationality</label>
                  <input
                    type="text"
                    name="nationality"
                    placeholder="e.g. Bangladeshi"
                    value={editFormData.nationality}
                    onChange={handleEditChange}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Profile Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full text-slate-700 dark:text-slate-300 text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600/10 file:text-blue-600 dark:file:text-blue-400 hover:file:bg-blue-600/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address</label>
                <textarea
                  name="address"
                  rows={2}
                  value={editFormData.address}
                  onChange={handleEditChange}
                  placeholder="Enter permanent address"
                  className="input-field resize-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting ? 'Updating...' : 'Update Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!studentToDelete}
        title="Delete student"
        message={`Are you sure you want to delete ${studentToDelete?.firstName} ${studentToDelete?.lastName}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deletingStudent}
        onConfirm={handleConfirmDeleteStudent}
        onCancel={() => setStudentToDelete(null)}
      />
    </div>
  );
};

export default StudentList;
