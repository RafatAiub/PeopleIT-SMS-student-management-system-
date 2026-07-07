import React, { useState, useEffect } from 'react';
import { Users, Search, X, Edit2, Trash2 } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';

const StudentList = () => {
  const { user } = useAuthStore();
  const isStudent = user?.role === 'STUDENT';

  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [availableSections, setAvailableSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
    setLoading(true);
    try {
      if (isStudent) {
        // Fetch own student profile
        const response = await apiClient.get('/students/me');
        setSelectedStudent(response.data.data);
      } else {
        // Fetch student list for Admins/Teachers
        const response = await apiClient.get('/students');
        setStudents(response.data.data || []);
      }
    } catch (error: any) {
      console.error('Failed to fetch students data', error);
      toast.error(error.response?.data?.message || 'Failed to fetch student data');
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    if (isStudent) return; // Students don't need classes metadata
    try {
      const response = await apiClient.get('/students/meta/classes');
      setClasses(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch classes metadata', error);
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, [isStudent]);

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => {
      const updated = { ...prev, [name]: value };
      
      // If class changes, update the available sections dynamically
      if (name === 'classId') {
        const selectedClass = classes.find(c => c.id === value);
        const sections = selectedClass ? selectedClass.sections : [];
        setAvailableSections(sections);
        updated.sectionId = sections.length > 0 ? sections[0].id : '';
      }
      
      return updated;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditFormData(prev => ({ ...prev, avatarUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOpenEditModal = (student: any) => {
    setSelectedStudent(student);
    
    if (!isStudent) {
      const studentClassId = student.class?.id || '';
      const selectedClass = classes.find(c => c.id === studentClassId);
      const sections = selectedClass ? selectedClass.sections : [];
      setAvailableSections(sections);
    }

    setEditFormData({
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      email: student.email || '',
      phone: student.phone || '',
      gender: student.gender || 'MALE',
      classId: student.class?.id || '',
      sectionId: student.section?.id || '',
      rollNumber: student.rollNumber || '',
      status: student.status || 'ACTIVE',
      address: student.address || '',
      bloodGroup: student.bloodGroup || '',
      religion: student.religion || '',
      nationality: student.nationality || 'Bangladeshi',
      avatarUrl: student.avatarUrl || ''
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
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

  const handleDeleteStudent = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this student?')) return;
    try {
      await apiClient.delete(`/students/${id}`);
      toast.success('Student deleted successfully');
      fetchStudents();
    } catch (error: any) {
      console.error('Failed to delete student', error);
      toast.error(error.response?.data?.message || 'Failed to delete student');
    }
  };

  if (loading) {
    return <div className="text-slate-400 p-8 text-center">Loading Student Portal...</div>;
  }

  // =============================================================================
  // STUDENT PORTAL VIEW (For role = STUDENT)
  // =============================================================================
  if (isStudent) {
    if (!selectedStudent) {
      return (
        <div className="glass p-8 text-center text-slate-400 rounded-2xl border border-white/5">
          Your student profile record could not be found. Please contact the administrator.
        </div>
      );
    }

    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">My Profile</h2>
            <p className="text-slate-400 mt-1">View and manage your personal student profile.</p>
          </div>
          <button 
            onClick={() => handleOpenEditModal(selectedStudent)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-semibold active:scale-[0.98]"
          >
            <Edit2 className="w-4 h-4" />
            Edit Personal Data
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Avatar and Key Info */}
          <div className="glass p-6 rounded-2xl border border-white/5 flex flex-col items-center text-center space-y-4">
            {selectedStudent.avatarUrl ? (
              <img 
                src={selectedStudent.avatarUrl} 
                alt="Avatar" 
                className="w-24 h-24 rounded-full object-cover border border-white/10 shadow-lg"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-teal-500 flex items-center justify-center text-3xl font-bold text-white glow-indigo shadow-lg">
                {selectedStudent.firstName?.[0] || '?'}
              </div>
            )}
            <div>
              <h3 className="text-lg font-bold text-white">{selectedStudent.firstName} {selectedStudent.lastName}</h3>
              <p className="text-sm text-slate-400 mt-1">ID: {selectedStudent.studentId}</p>
            </div>
            <div className="w-full pt-4 border-t border-white/5 text-left space-y-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Status</span>
                <span className="text-emerald-400 font-semibold uppercase">{selectedStudent.status || 'ACTIVE'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Class</span>
                <span className="text-white font-medium">{selectedStudent.class?.name || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Section</span>
                <span className="text-white font-medium">{selectedStudent.section?.name || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Roll Number</span>
                <span className="text-white font-medium">{selectedStudent.rollNumber || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Complete Profile Details */}
          <div className="md:col-span-2 glass p-6 rounded-2xl border border-white/5 space-y-6">
            <h3 className="text-lg font-bold text-white border-b border-white/5 pb-3">Personal & Academic Details</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
              <div>
                <span className="text-xs text-slate-500 block">First Name</span>
                <span className="text-white font-medium mt-1 block">{selectedStudent.firstName}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Last Name</span>
                <span className="text-white font-medium mt-1 block">{selectedStudent.lastName}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Email Address</span>
                <span className="text-white font-medium mt-1 block">{selectedStudent.email || 'N/A'}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Phone Number</span>
                <span className="text-white font-medium mt-1 block">{selectedStudent.phone || 'N/A'}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Gender</span>
                <span className="text-white font-medium mt-1 block capitalize">{selectedStudent.gender?.toLowerCase() || 'N/A'}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Admission Date</span>
                <span className="text-white font-medium mt-1 block">
                  {selectedStudent.admissionDate ? new Date(selectedStudent.admissionDate).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Branch</span>
                <span className="text-white font-medium mt-1 block">{selectedStudent.branch?.name || 'Main Branch'}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Academic Year</span>
                <span className="text-white font-medium mt-1 block">
                  {selectedStudent.academicYear?.label || new Date().getFullYear().toString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Student Modal (Student Version - Personal Data Only) */}
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm">
            <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Edit Personal Data</h3>
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">First Name</label>
                    <input
                      type="text"
                      name="firstName"
                      required
                      value={editFormData.firstName}
                      onChange={handleEditChange}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Last Name</label>
                    <input
                      type="text"
                      name="lastName"
                      required
                      value={editFormData.lastName}
                      onChange={handleEditChange}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
                  <input
                    type="text"
                    name="phone"
                    value={editFormData.phone}
                    onChange={handleEditChange}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Gender</label>
                  <select
                    name="gender"
                    value={editFormData.gender}
                    onChange={handleEditChange}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Blood Group</label>
                    <select
                      name="bloodGroup"
                      value={editFormData.bloodGroup}
                      onChange={handleEditChange}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                    <label className="block text-sm font-medium text-slate-300 mb-1">Religion</label>
                    <select
                      name="religion"
                      value={editFormData.religion}
                      onChange={handleEditChange}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                    <label className="block text-sm font-medium text-slate-300 mb-1">Nationality</label>
                    <input
                      type="text"
                      name="nationality"
                      value={editFormData.nationality}
                      onChange={handleEditChange}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Profile Photo</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="w-full text-slate-300 text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600/10 file:text-blue-400 hover:file:bg-blue-600/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Address</label>
                  <textarea
                    name="address"
                    rows={2}
                    value={editFormData.address}
                    onChange={handleEditChange}
                    placeholder="Enter permanent address"
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
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
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Students</h2>
          <p className="text-slate-400 mt-1">Manage student enrollments and profiles.</p>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search students by name or ID..." 
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/40 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-6 py-4 font-medium">Student Name</th>
                <th className="px-6 py-4 font-medium">Admission No</th>
                <th className="px-6 py-4 font-medium">Class / Roll</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    Loading students...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No students found.
                  </td>
                </tr>
              ) : (
                students.map((student: any) => (
                  <tr key={student.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {student.avatarUrl ? (
                          <img 
                            src={student.avatarUrl} 
                            alt="Avatar" 
                            className="w-8 h-8 rounded-full object-cover border border-white/10"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                            {student.firstName?.[0] || '?'}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-white">{student.firstName} {student.lastName}</div>
                          <div className="text-xs text-slate-500">{student.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{student.studentId}</td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-white">{student.class?.name || 'N/A'}</span>
                      <span className="text-slate-500"> (Roll: {student.rollNumber || 'N/A'})</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        student.status === 'ACTIVE' 
                          ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' 
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {student.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleOpenEditModal(student)}
                          className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors"
                        >
                          <Edit2 className="w-4.5 h-4.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteStudent(student.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Student Modal */}
      {isEditModalOpen && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Edit Student Profile</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">First Name</label>
                  <input
                    type="text"
                    name="firstName"
                    required
                    value={editFormData.firstName}
                    onChange={handleEditChange}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    name="lastName"
                    required
                    value={editFormData.lastName}
                    onChange={handleEditChange}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Class</label>
                  <select
                    name="classId"
                    value={editFormData.classId}
                    onChange={handleEditChange}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="">-- No Class Assigned --</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Section</label>
                  <select
                    name="sectionId"
                    value={editFormData.sectionId}
                    onChange={handleEditChange}
                    disabled={!editFormData.classId}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
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
                  <label className="block text-sm font-medium text-slate-300 mb-1">Roll Number</label>
                  <input
                    type="text"
                    name="rollNumber"
                    value={editFormData.rollNumber}
                    onChange={handleEditChange}
                    placeholder="e.g. 15"
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Status</label>
                  <select
                    name="status"
                    value={editFormData.status}
                    onChange={handleEditChange}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                  <label className="block text-sm font-medium text-slate-300 mb-1">Gender</label>
                  <select
                    name="gender"
                    value={editFormData.gender}
                    onChange={handleEditChange}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
                  <input
                    type="text"
                    name="phone"
                    value={editFormData.phone}
                    onChange={handleEditChange}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  value={editFormData.email}
                  onChange={handleEditChange}
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Blood Group</label>
                  <select
                    name="bloodGroup"
                    value={editFormData.bloodGroup}
                    onChange={handleEditChange}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                  <label className="block text-sm font-medium text-slate-300 mb-1">Religion</label>
                  <select
                    name="religion"
                    value={editFormData.religion}
                    onChange={handleEditChange}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                  <label className="block text-sm font-medium text-slate-300 mb-1">Nationality</label>
                  <input
                    type="text"
                    name="nationality"
                    value={editFormData.nationality}
                    onChange={handleEditChange}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Profile Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full text-slate-300 text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600/10 file:text-blue-400 hover:file:bg-blue-600/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Address</label>
                <textarea
                  name="address"
                  rows={2}
                  value={editFormData.address}
                  onChange={handleEditChange}
                  placeholder="Enter permanent address"
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting ? 'Updating...' : 'Update Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentList;
