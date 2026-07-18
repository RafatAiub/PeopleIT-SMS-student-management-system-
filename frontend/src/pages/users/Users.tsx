import React, { useState, useEffect } from 'react';
import { Users as UsersIcon, Plus, Edit2, Trash2, Search, Filter, X } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useTableParams } from '../../hooks/useTableParams';
import { Pagination } from '../../components/Pagination';

interface StudentOption {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  class?: { name: string } | null;
  section?: { name: string } | null;
}

const RELATIONSHIP_OPTIONS = ['FATHER', 'MOTHER', 'GUARDIAN'];

// Lets an admin search existing students and link one or more of them to a
// GUARDIAN user as their children, right from the Add/Edit User modal —
// without this, a newly created guardian has no linked children and the
// guardian portal has nothing to show them.
const GuardianChildrenLinker = ({
  selected,
  onChange,
  relationship,
  onRelationshipChange,
}: {
  selected: StudentOption[];
  onChange: (students: StudentOption[]) => void;
  relationship: string;
  onRelationshipChange: (value: string) => void;
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get('/students', { params: { search: trimmed, pageSize: 8 } });
        if (!cancelled) setResults(res.data.data || []);
      } catch (err) {
        console.error('Failed to search students', err);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const selectedIds = new Set(selected.map((s) => s.id));
  const visibleResults = results.filter((s) => !selectedIds.has(s.id));

  const addStudent = (student: StudentOption) => {
    onChange([...selected, student]);
    setQuery('');
    setResults([]);
  };
  const removeStudent = (id: string) => onChange(selected.filter((s) => s.id !== id));

  return (
    <div className="animate-fadeIn">
      <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-4 uppercase tracking-wider">Linked Children (Students)</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Relationship</label>
          <select value={relationship} onChange={(e) => onRelationshipChange(e.target.value)} className="input-field">
            {RELATIONSHIP_OPTIONS.map((r) => (
              <option key={r} value={r} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                {r.charAt(0) + r.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Search Student to Link</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or student ID..."
              className="input-field pl-9"
            />
          </div>
          {query.trim() && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl max-h-56 overflow-y-auto">
              {searching ? (
                <div className="p-3 text-xs text-slate-500">Searching...</div>
              ) : visibleResults.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">No matching students found.</div>
              ) : (
                visibleResults.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => addStudent(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between gap-2"
                  >
                    <span className="text-slate-900 dark:text-white font-medium">{s.firstName} {s.lastName}</span>
                    <span className="text-xs text-slate-500 shrink-0">{s.class?.name || ''} {s.section?.name || ''} · {s.studentId}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {selected.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">No children linked yet. Search above to link this guardian to one or more students.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selected.map((s, idx) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold px-3 py-1.5 rounded-xl"
            >
              {idx === 0 && <span className="text-[9px] uppercase tracking-wider bg-amber-600 text-white px-1.5 py-0.5 rounded">Primary</span>}
              {s.firstName} {s.lastName} ({s.studentId})
              <button type="button" onClick={() => removeStudent(s.id)} className="hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const Users = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams();
  
  // Classes Metadata State
  const [classes, setClasses] = useState<any[]>([]);
  const [availableAddSections, setAvailableAddSections] = useState<any[]>([]);
  const [availableEditSections, setAvailableEditSections] = useState<any[]>([]);

  // Add User Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'TEACHER',
    firstName: '',
    lastName: '',
    phone: '',
    avatarUrl: '',
    // Student specifics
    dateOfBirth: '',
    gender: 'Male',
    bloodGroup: 'A+',
    religion: 'Islam',
    nationality: 'Bangladeshi',
    address: '',
    admissionDate: new Date().toISOString().split('T')[0],
    rollNumber: '',
    classId: '',
    sectionId: '',
    // Teacher specifics
    qualification: '',
    subjectExpertise: '',
    joiningDate: new Date().toISOString().split('T')[0],
    // Guardian specifics
    relationship: 'FATHER'
  });
  const [addSelectedChildren, setAddSelectedChildren] = useState<StudentOption[]>([]);

  // Edit User Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    role: 'TEACHER',
    isActive: true,
    avatarUrl: '',
    // Student specifics
    dateOfBirth: '',
    gender: 'Male',
    bloodGroup: 'A+',
    religion: 'Islam',
    nationality: 'Bangladeshi',
    address: '',
    admissionDate: new Date().toISOString().split('T')[0],
    rollNumber: '',
    classId: '',
    sectionId: '',
    // Teacher specifics
    qualification: '',
    subjectExpertise: '',
    joiningDate: new Date().toISOString().split('T')[0],
    // Guardian specifics
    relationship: 'FATHER'
  });
  const [editSelectedChildren, setEditSelectedChildren] = useState<StudentOption[]>([]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: params.page.toString(),
        pageSize: params.pageSize.toString(),
      });
      if (debouncedSearch) queryParams.append('search', debouncedSearch);
      if (params.filters.role) queryParams.append('role', params.filters.role);

      const res = await apiClient.get(`/users?${queryParams.toString()}`);
      setUsers(res.data.data || []);
      setTotalUsers(res.data.meta?.total || 0);
    } catch (err: any) {
      console.error('Failed to fetch users', err);
      toast.error(err.response?.data?.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await apiClient.get('/students/meta/classes');
      setClasses(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch classes metadata', error);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchClasses();
  }, [params.page, params.pageSize, debouncedSearch, params.filters.role]);

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
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          } else {
            resolve(event.target?.result as string);
          }
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressed = await compressImage(file);
      if (isEdit) {
        setEditFormData(prev => ({ ...prev, avatarUrl: compressed }));
      } else {
        setFormData(prev => ({ ...prev, avatarUrl: compressed }));
      }
    }
  };

  const fetchSectionsForAdd = async (classId: string) => {
    if (!classId) {
      setAvailableAddSections([]);
      setFormData(prev => ({ ...prev, sectionId: '' }));
      return;
    }
    try {
      const res = await apiClient.get(`/students/meta/sections?classId=${classId}`);
      const sections = res.data.data || [];
      setAvailableAddSections(sections);
      setFormData(prev => ({ ...prev, sectionId: sections.length > 0 ? sections[0].id : '' }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'classId') {
      fetchSectionsForAdd(value);
    }
  };

  const fetchSectionsForEdit = async (classId: string, selectFirst: boolean = false) => {
    if (!classId) {
      setAvailableEditSections([]);
      setEditFormData(prev => ({ ...prev, sectionId: '' }));
      return;
    }
    try {
      const res = await apiClient.get(`/students/meta/sections?classId=${classId}`);
      const sections = res.data.data || [];
      setAvailableEditSections(sections);
      if (selectFirst) {
        setEditFormData(prev => ({ ...prev, sectionId: sections.length > 0 ? sections[0].id : '' }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const val = name === 'isActive' ? value === 'true' : value;
    setEditFormData(prev => ({ ...prev, [name]: val }));
    if (name === 'classId') {
      fetchSectionsForEdit(value, true);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await apiClient.post('/users', {
        ...formData,
        studentIds: formData.role === 'GUARDIAN' ? addSelectedChildren.map(s => s.id) : undefined,
      });
      toast.success('User created successfully');
      setIsAddModalOpen(false);
      setFormData({
        email: '', password: '', role: 'TEACHER', firstName: '', lastName: '', phone: '',
        avatarUrl: '',
        dateOfBirth: '', gender: 'Male', bloodGroup: 'A+', religion: 'Islam', nationality: 'Bangladeshi',
        address: '', admissionDate: new Date().toISOString().split('T')[0], rollNumber: '',
        classId: '', sectionId: '',
        qualification: '', subjectExpertise: '', joiningDate: new Date().toISOString().split('T')[0],
        relationship: 'FATHER'
      });
      setAddSelectedChildren([]);
      fetchUsers();
    } catch (error: any) {
      console.error('Failed to create user', error);
      toast.error(error.response?.data?.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditModal = (user: any) => {
    setSelectedUser(user);
    const student = user.studentProfile || {};
    const teacher = user.teacherProfile || {};
    const guardian = user.guardianProfile || {};

    const classId = student.classId || '';
    if (classId) {
      fetchSectionsForEdit(classId, false).then(() => {
        setEditFormData(prev => ({ ...prev, sectionId: student.sectionId || '' }));
      });
    } else {
      setAvailableEditSections([]);
    }

    setEditFormData({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      phone: user.phone || '',
      role: user.role || 'TEACHER',
      isActive: user.isActive !== false,
      avatarUrl: user.avatarUrl || '',
      // Student specifics
      rollNumber: student.rollNumber || '',
      admissionDate: student.admissionDate ? new Date(student.admissionDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split('T')[0] : '',
      gender: student.gender || 'Male',
      bloodGroup: student.bloodGroup || 'A+',
      religion: student.religion || 'Islam',
      nationality: student.nationality || 'Bangladeshi',
      address: student.address || '',
      classId: classId,
      sectionId: student.sectionId || '',
      // Teacher specifics
      qualification: teacher.qualification || '',
      subjectExpertise: teacher.subjectExpertise || '',
      joiningDate: teacher.joiningDate ? new Date(teacher.joiningDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      // Guardian specifics
      relationship: guardian.relationship || 'FATHER'
    });
    setEditSelectedChildren((guardian.students || []).map((gs: any) => gs.student));
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      await apiClient.put(`/users/${selectedUser.id}`, {
        ...editFormData,
        studentIds: editFormData.role === 'GUARDIAN' ? editSelectedChildren.map(s => s.id) : undefined,
      });
      toast.success('User updated successfully');
      setIsEditModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      console.error('Failed to update user', error);
      toast.error(error.response?.data?.message || 'Failed to update user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await apiClient.delete(`/users/${id}`);
      toast.success('User deleted successfully');
      fetchUsers();
    } catch (error: any) {
      console.error('Failed to delete user', error);
      toast.error(error.response?.data?.message || 'Failed to delete user');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">User Management</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Manage Admins, Teachers, Students, and Guardians.</p>
        </div>
        <button
          onClick={() => { setAddSelectedChildren([]); setIsAddModalOpen(true); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]"
        >
          <Plus className="w-5 h-5" />
          Add User
        </button>
      </div>

      {/* Toolbar */}
      <div className="glass-card p-4 rounded-2xl flex flex-wrap items-center gap-4 border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 shadow-sm">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={params.search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name, email..."
            className="input-field pl-9 text-sm"
          />
        </div>
        <div className="relative">
          <select 
            value={params.filters.role || ''}
            onChange={(e) => setFilter('role', e.target.value)}
            className="input-field pl-10 pr-8 cursor-pointer"
          >
            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All Roles</option>
            <option value="ADMIN" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Admin</option>
            <option value="TEACHER" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Teacher</option>
            <option value="STUDENT" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Student</option>
            <option value="GUARDIAN" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Guardian</option>
          </select>
          <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Users Table */}
      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-555">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 flex flex-col items-center justify-center">
                    <UsersIcon className="w-12 h-12 mb-2 opacity-20" />
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {user.avatarUrl ? (
                          <img 
                            src={user.avatarUrl} 
                            alt="Avatar" 
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-white/10 shadow-sm"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold border border-slate-200 dark:border-transparent">
                            {user.firstName?.charAt(0) || user.username?.charAt(0) || 'U'}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{user.firstName} {user.lastName}</div>
                          <div className="text-xs text-slate-500">{user.email || user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                        user.isActive !== false 
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                          : 'bg-rose-50 dark:bg-red-500/10 text-rose-700 dark:text-red-400 border border-rose-200 dark:border-red-500/20'
                      }`}>
                        {user.isActive !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleOpenEditModal(user)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-450 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={params.page}
          pageSize={params.pageSize}
          total={totalUsers}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 shrink-0">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Add New User</h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <form id="addUserForm" onSubmit={handleAddSubmit} className="space-y-6">
                
                {/* Basic Details */}
                <div>
                  <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-4 uppercase tracking-wider">Basic Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">First Name</label>
                      <input type="text" name="firstName" required placeholder="e.g. John" value={formData.firstName} onChange={handleChange} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                      <input type="text" name="lastName" required placeholder="e.g. Doe" value={formData.lastName} onChange={handleChange} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                      <input type="email" name="email" required placeholder="e.g. john.doe@school.edu" value={formData.email} onChange={handleChange} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
                      <input type="password" name="password" required minLength={8} placeholder="••••••••" value={formData.password} onChange={handleChange} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
                      <select name="role" value={formData.role} onChange={handleChange} className="input-field">
                        <option value="ADMIN" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Admin</option>
                        <option value="TEACHER" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Teacher</option>
                        <option value="STUDENT" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Student</option>
                        <option value="GUARDIAN" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Guardian</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                      <input type="text" name="phone" placeholder="e.g. +8801700000000" value={formData.phone} onChange={handleChange} className="input-field" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Profile Photo <span className="text-rose-600">*</span>
                      </label>
                      <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                        {formData.avatarUrl ? (
                          <img src={formData.avatarUrl} alt="Preview" className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-white/10" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-600/10 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center text-[10px] text-blue-650 dark:text-blue-400 font-semibold">No Photo</div>
                        )}
                        <input 
                          type="file" 
                          accept="image/*" 
                          required
                          onChange={(e) => handleFileChange(e, false)} 
                          className="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-blue-600/25 file:text-blue-600 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-600/35 cursor-pointer file:transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Conditional Student Details */}
                {formData.role === 'STUDENT' && (
                  <div className="animate-fadeIn">
                    <h4 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-4 uppercase tracking-wider">Student Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class</label>
                        <select name="classId" value={formData.classId} onChange={handleChange} className="input-field">
                          <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Select Class</option>
                          {classes.map(c => (
                            <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Section</label>
                        <select name="sectionId" value={formData.sectionId} onChange={handleChange} className="input-field">
                          <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Select Section</option>
                          {availableAddSections.map(s => (
                            <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Roll Number</label>
                        <input type="text" name="rollNumber" placeholder="e.g. 15" value={formData.rollNumber} onChange={handleChange} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Admission Date</label>
                        <input type="date" name="admissionDate" value={formData.admissionDate} onChange={handleChange} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date of Birth</label>
                        <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Gender</label>
                        <select name="gender" value={formData.gender} onChange={handleChange} className="input-field">
                          <option value="Male" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Male</option>
                          <option value="Female" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Female</option>
                          <option value="Other" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Blood Group</label>
                        <select name="bloodGroup" value={formData.bloodGroup} onChange={handleChange} className="input-field">
                          <option value="A+" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">A+</option>
                          <option value="A-" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">A-</option>
                          <option value="B+" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">B+</option>
                          <option value="B-" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">B-</option>
                          <option value="O+" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">O+</option>
                          <option value="O-" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">O-</option>
                          <option value="AB+" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">AB+</option>
                          <option value="AB-" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">AB-</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Religion</label>
                        <select name="religion" value={formData.religion} onChange={handleChange} className="input-field">
                          <option value="Islam" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Islam</option>
                          <option value="Hinduism" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Hinduism</option>
                          <option value="Christianity" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Christianity</option>
                          <option value="Buddhism" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Buddhism</option>
                          <option value="Other" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nationality</label>
                        <input type="text" name="nationality" placeholder="e.g. Bangladeshi" value={formData.nationality} onChange={handleChange} className="input-field" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address</label>
                        <textarea name="address" rows={2} placeholder="e.g. 385 Goran Road, Dhaka" value={formData.address} onChange={handleChange as any} className="input-field"></textarea>
                      </div>
                    </div>
                  </div>
                )}

                {/* Conditional Teacher Details */}
                {formData.role === 'TEACHER' && (
                  <div className="animate-fadeIn">
                    <h4 className="text-sm font-semibold text-indigo-650 dark:text-purple-400 mb-4 uppercase tracking-wider">Teacher Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Qualification</label>
                        <input type="text" name="qualification" placeholder="e.g. MSc in Mathematics, BEd" value={formData.qualification} onChange={handleChange} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subject Expertise</label>
                        <input type="text" name="subjectExpertise" placeholder="e.g. Mathematics, Physics" value={formData.subjectExpertise} onChange={handleChange} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Joining Date</label>
                        <input type="date" name="joiningDate" value={formData.joiningDate} onChange={handleChange} className="input-field" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Conditional Guardian Details */}
                {formData.role === 'GUARDIAN' && (
                  <GuardianChildrenLinker
                    selected={addSelectedChildren}
                    onChange={setAddSelectedChildren}
                    relationship={formData.relationship}
                    onRelationshipChange={(value) => setFormData(prev => ({ ...prev, relationship: value }))}
                  />
                )}

              </form>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 shrink-0 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="addUserForm"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {isSubmitting ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 shrink-0">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Edit User</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <form id="editUserForm" onSubmit={handleEditSubmit} className="space-y-6">
                
                {/* Basic Details */}
                <div>
                  <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-4 uppercase tracking-wider">Basic Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">First Name</label>
                      <input type="text" name="firstName" required placeholder="e.g. John" value={editFormData.firstName} onChange={handleEditChange} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                      <input type="text" name="lastName" required placeholder="e.g. Doe" value={editFormData.lastName} onChange={handleEditChange} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
                      <select name="role" value={editFormData.role} onChange={handleEditChange} className="input-field">
                        <option value="ADMIN" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Admin</option>
                        <option value="TEACHER" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Teacher</option>
                        <option value="STUDENT" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Student</option>
                        <option value="GUARDIAN" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Guardian</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                      <input type="text" name="phone" placeholder="e.g. +8801700000000" value={editFormData.phone} onChange={handleEditChange} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                      <select name="isActive" value={editFormData.isActive ? 'true' : 'false'} onChange={handleEditChange} className="input-field">
                        <option value="true" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Active</option>
                        <option value="false" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Inactive</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Profile Photo
                      </label>
                      <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                        {editFormData.avatarUrl ? (
                          <img src={editFormData.avatarUrl} alt="Preview" className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-white/10" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-600/10 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center text-[10px] text-blue-650 dark:text-blue-400 font-semibold">No Photo</div>
                        )}
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => handleFileChange(e, true)} 
                          className="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-blue-600/25 file:text-blue-600 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-600/35 cursor-pointer file:transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Conditional Student Details */}
                {editFormData.role === 'STUDENT' && (
                  <div className="animate-fadeIn">
                    <h4 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-4 uppercase tracking-wider">Student Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class</label>
                        <select name="classId" value={editFormData.classId} onChange={handleEditChange} className="input-field">
                          <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Select Class</option>
                          {classes.map(c => (
                            <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Section</label>
                        <select name="sectionId" value={editFormData.sectionId} onChange={handleEditChange} className="input-field">
                          <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Select Section</option>
                          {availableEditSections.map(s => (
                            <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Roll Number</label>
                        <input type="text" name="rollNumber" placeholder="e.g. 15" value={editFormData.rollNumber} onChange={handleEditChange} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Admission Date</label>
                        <input type="date" name="admissionDate" value={editFormData.admissionDate} onChange={handleEditChange} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date of Birth</label>
                        <input type="date" name="dateOfBirth" value={editFormData.dateOfBirth} onChange={handleEditChange} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Gender</label>
                        <select name="gender" value={editFormData.gender} onChange={handleEditChange} className="input-field">
                          <option value="Male" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Male</option>
                          <option value="Female" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Female</option>
                          <option value="Other" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Blood Group</label>
                        <select name="bloodGroup" value={editFormData.bloodGroup} onChange={handleEditChange} className="input-field">
                          <option value="A+" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">A+</option>
                          <option value="A-" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">A-</option>
                          <option value="B+" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">B+</option>
                          <option value="B-" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">B-</option>
                          <option value="O+" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">O+</option>
                          <option value="O-" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">O-</option>
                          <option value="AB+" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">AB+</option>
                          <option value="AB-" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">AB-</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Religion</label>
                        <select name="religion" value={editFormData.religion} onChange={handleEditChange} className="input-field">
                          <option value="Islam" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Islam</option>
                          <option value="Hinduism" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Hinduism</option>
                          <option value="Christianity" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Christianity</option>
                          <option value="Buddhism" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Buddhism</option>
                          <option value="Other" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nationality</label>
                        <input type="text" name="nationality" placeholder="e.g. Bangladeshi" value={editFormData.nationality} onChange={handleEditChange} className="input-field" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address</label>
                        <textarea name="address" rows={2} placeholder="e.g. 385 Goran Road, Dhaka" value={editFormData.address} onChange={handleEditChange as any} className="input-field"></textarea>
                      </div>
                    </div>
                  </div>
                )}

                {/* Conditional Teacher Details */}
                {editFormData.role === 'TEACHER' && (
                  <div className="animate-fadeIn">
                    <h4 className="text-sm font-semibold text-indigo-650 dark:text-purple-400 mb-4 uppercase tracking-wider">Teacher Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Qualification</label>
                        <input type="text" name="qualification" placeholder="e.g. MSc in Mathematics, BEd" value={editFormData.qualification} onChange={handleEditChange} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subject Expertise</label>
                        <input type="text" name="subjectExpertise" placeholder="e.g. Mathematics, Physics" value={editFormData.subjectExpertise} onChange={handleEditChange} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Joining Date</label>
                        <input type="date" name="joiningDate" value={editFormData.joiningDate} onChange={handleEditChange} className="input-field" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Conditional Guardian Details */}
                {editFormData.role === 'GUARDIAN' && (
                  <GuardianChildrenLinker
                    selected={editSelectedChildren}
                    onChange={setEditSelectedChildren}
                    relationship={editFormData.relationship}
                    onRelationshipChange={(value) => setEditFormData(prev => ({ ...prev, relationship: value }))}
                  />
                )}

              </form>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 shrink-0 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="editUserForm"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {isSubmitting ? 'Updating...' : 'Update User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
