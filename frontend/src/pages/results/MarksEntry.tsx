import React, { useState, useEffect } from 'react';
import { Award, ChevronDown, Check, Save, Sparkles, Loader2, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import * as XLSX from 'xlsx';
const CLASSES = [
  'KG', 'Nursery', 'Junior One',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'
];

const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const DEPARTMENTS = ['Science', 'Commerce', 'Arts', 'None'];

const COMMON_SUBJECTS_JUNIOR = [
  'Bangla', 'English', 'Mathematics', 'General Science', 'Social Science', 'Religion & Moral Education', 'ICT'
];

const COMPULSORY_SUBJECTS_SENIOR = [
  'Bangla 1st Paper', 'Bangla 2nd Paper', 'English 1st Paper', 'English 2nd Paper', 'General Mathematics', 'Religion & Moral Education', 'ICT'
];

const SCIENCE_SUBJECTS = ['Physics', 'Chemistry', 'Higher Mathematics', 'Biology'];
const COMMERCE_SUBJECTS = ['Accounting', 'Finance & Banking', 'Business Entrepreneurship', 'General Science'];
const ARTS_SUBJECTS = ['History', 'Geography', 'Economics', 'Civics', 'General Science'];

const getSubjectsForClassAndDept = (className: string, dept: string) => {
  const isSenior = className.includes('9') || className.includes('10');
  if (!isSenior || dept === 'None') {
    return COMMON_SUBJECTS_JUNIOR;
  }
  
  if (dept === 'Science') return [...COMPULSORY_SUBJECTS_SENIOR, ...SCIENCE_SUBJECTS];
  if (dept === 'Commerce') return [...COMPULSORY_SUBJECTS_SENIOR, ...COMMERCE_SUBJECTS];
  if (dept === 'Arts') return [...COMPULSORY_SUBJECTS_SENIOR, ...ARTS_SUBJECTS];
  
  return COMMON_SUBJECTS_JUNIOR;
};

const MarksEntry = () => {
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'TEACHER';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [exams, setExams] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [selectedClass, setSelectedClass] = useState('Class 8');
  const [selectedSection, setSelectedSection] = useState('A');
  const [selectedDepartment, setSelectedDepartment] = useState('None');
  const [availableSubjects, setAvailableSubjects] = useState<string[]>(COMMON_SUBJECTS_JUNIOR);
  const [selectedSubject, setSelectedSubject] = useState(COMMON_SUBJECTS_JUNIOR[0]);
  const [maxMarks, setMaxMarks] = useState(100);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<{students: number, marks: number} | null>(null);

  const [assignedSections, setAssignedSections] = useState<any[]>([]);
  const [hasAssignments, setHasAssignments] = useState(true);
  const [classesMeta, setClassesMeta] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<'upload' | 'sheet'>('upload');
  const [completeResults, setCompleteResults] = useState<any[]>([]);
  const [completeResultsLoading, setCompleteResultsLoading] = useState(false);
  const [resultSheetClassTeacher, setResultSheetClassTeacher] = useState<string>('Not Assigned');

  const [students, setStudents] = useState<any[]>([]);
  const [marks, setMarks] = useState<Record<string, Record<string, { score: string; remarks: string }>>>({});

  const loadInitialMetadata = async () => {
    try {
      setInitialLoading(true);
      const examsRes = await apiClient.get('/results');
      const examsData = examsRes.data.data || [];
      setExams(examsData);
      if (examsData.length > 0 && !selectedExam) {
        setSelectedExam(examsData[0].id);
      }

      const metaRes = await apiClient.get('/students/meta/classes');
      const metaData = metaRes.data.data || [];
      setClassesMeta(metaData);

      if (isTeacher) {
        const res = await apiClient.get('/attendance/my-sections');
        const sections = res.data.data || [];
        setAssignedSections(sections);
        if (sections.length > 0) {
          setSelectedClass(sections[0].class.name);
          setSelectedSection(sections[0].name);
          setHasAssignments(true);
        } else {
          setHasAssignments(false);
        }
      }
    } catch (err) {
      console.error('Failed to fetch exams/sections', err);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadInitialMetadata();
  }, [user]);

  const fetchStudentsAndMarks = async () => {
    if (isTeacher && !hasAssignments) return;
    try {
      setLoading(true);
      // Reusing attendance sheet endpoint to easily fetch students by class/section name
      const res = await apiClient.get(
        `/attendance/sheet?className=${encodeURIComponent(selectedClass)}&sectionName=${encodeURIComponent(selectedSection)}&date=${new Date().toISOString()}`
      );
      const studentsData = res.data.data || [];
      setStudents(studentsData);
      
      setMarks(prev => {
        const next = { ...prev };
        availableSubjects.forEach((sub) => {
          if (!next[sub]) next[sub] = {};
          studentsData.forEach((student: any) => {
            if (!next[sub][student.id]) {
              next[sub][student.id] = { score: '', remarks: '' };
            }
          });
        });
        return next;
      });
    } catch (err) {
      console.error('Failed to fetch students', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentsAndMarks();
  }, [selectedClass, selectedSection, selectedSubject, hasAssignments]);

  useEffect(() => {
    const subjects = getSubjectsForClassAndDept(selectedClass, selectedDepartment);
    setAvailableSubjects(subjects);
    if (!subjects.includes(selectedSubject)) {
      setSelectedSubject(subjects[0]);
    }
  }, [selectedClass, selectedDepartment]);

  const isSeniorClass = selectedClass.includes('9') || selectedClass.includes('10');

  const fetchCompleteResultSheet = async () => {
    if (!selectedExam) return;
    
    const cls = classesMeta.find((c: any) => c.name === selectedClass);
    let sec = null;
    if (cls) {
      try {
        const sectionsRes = await apiClient.get(`/students/meta/sections?classId=${cls.id}`);
        const sectionsList = sectionsRes.data.data || [];
        sec = sectionsList.find((s: any) => s.name === selectedSection);
      } catch (err) {
        console.error(err);
      }
    }
    
    if (sec) {
      if (sec.classTeacher?.user) {
        setResultSheetClassTeacher(`${sec.classTeacher.user.firstName} ${sec.classTeacher.user.lastName} (${sec.classTeacher.user.email})`);
      } else {
        setResultSheetClassTeacher('Not Assigned');
      }
    } else {
      setResultSheetClassTeacher('Not Assigned');
    }

    try {
      setCompleteResultsLoading(true);
      const queryParams = new URLSearchParams();
      queryParams.append('examId', selectedExam);
      if (cls) queryParams.append('classId', cls.id);
      if (sec) queryParams.append('sectionId', sec.id);
      queryParams.append('pageSize', '100');

      const res = await apiClient.get(`/results/results-list?${queryParams.toString()}`);
      setCompleteResults(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch complete result sheet', err);
    } finally {
      setCompleteResultsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sheet') {
      fetchCompleteResultSheet();
    }
  }, [activeTab, selectedExam, selectedClass, selectedSection, classesMeta]);

  // Construct complete result matrix
  const uniqueSubjects = Array.from(new Set(completeResults.map(r => r.subject)));

  const studentRowsMap: Record<string, {
    studentId: string;
    rollNumber: string;
    firstName: string;
    lastName: string;
    scores: Record<string, number>;
    maxMarks: Record<string, number>;
    totalObtained: number;
    totalPossible: number;
  }> = {};

  completeResults.forEach((record) => {
    const student = record.student;
    if (!student) return;

    if (!studentRowsMap[student.id]) {
      studentRowsMap[student.id] = {
        studentId: student.studentId,
        rollNumber: student.rollNumber || '—',
        firstName: student.firstName,
        lastName: student.lastName,
        scores: {},
        maxMarks: {},
        totalObtained: 0,
        totalPossible: 0
      };
    }

    const marksVal = Number(record.marksObtained);
    const maxVal = Number(record.maxMarks);

    studentRowsMap[student.id].scores[record.subject] = marksVal;
    studentRowsMap[student.id].maxMarks[record.subject] = maxVal;
    studentRowsMap[student.id].totalObtained += marksVal;
    studentRowsMap[student.id].totalPossible += maxVal;
  });

  const studentRows = Object.values(studentRowsMap).sort((a, b) => {
    const rollA = parseInt(a.rollNumber) || 999;
    const rollB = parseInt(b.rollNumber) || 999;
    return rollA - rollB;
  });

  const downloadCSV = () => {
    if (studentRows.length === 0) {
      toast.error('No results found to download.');
      return;
    }
    
    const headers = ['Roll No', 'Student ID', 'Student Name', ...uniqueSubjects, 'Total Obtained', 'Total Possible', 'Percentage'];
    
    const rows = studentRows.map((row) => {
      const percentage = row.totalPossible > 0 
        ? `${Math.round((row.totalObtained / row.totalPossible) * 100)}%` 
        : '—';
      
      const subjectScores = uniqueSubjects.map(sub => row.scores[sub] !== undefined ? row.scores[sub] : '—');
      
      return [
        `"${row.rollNumber}"`,
        `"${row.studentId}"`,
        `"${row.firstName} ${row.lastName}"`,
        ...subjectScores,
        row.totalObtained,
        row.totalPossible,
        `"${percentage}"`
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Result_Sheet_${selectedClass}_Section_${selectedSection}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTemplate = () => {
    if (students.length === 0) {
      toast.error('Please load the student list first.');
      return;
    }
    const headers = ['Roll No', 'Student ID', 'Student Name', ...availableSubjects];
    const rows = students.map(s => [
      s.rollNumber || '',
      s.studentId,
      `${s.firstName} ${s.lastName}`,
      ...availableSubjects.map(() => '')
    ]);
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Marks Template");
    XLSX.writeFile(wb, `Template_${selectedClass}_Section_${selectedSection}.xlsx`);
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (!jsonData || jsonData.length < 2) {
          toast.error('File must contain at least a header row and one student record.');
          return;
        }

        const headers = (jsonData[0] || []).map((h: any) => h ? String(h).trim() : '');
        const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

        const idIdx = headers.findIndex((h: string) => {
          const normalized = normalizeHeader(h);
          return normalized.includes('studentid') || normalized === 'id' || normalized.includes('admissionno');
        });

        if (idIdx === -1) {
          console.warn('Parsed headers:', headers);
          toast.error(`Invalid template. Could not find "Student ID" column. Parsed columns: ${headers.slice(0, 3).join(', ')}`);
          return;
        }

        const subjectCols: { subjectName: string; colIdx: number }[] = [];
        headers.forEach((header: string, idx: number) => {
          if (!header) return;
          const normalizedHeader = normalizeHeader(header);
          const matchedSubject = availableSubjects.find(sub => normalizeHeader(sub) === normalizedHeader);
          if (matchedSubject) {
            subjectCols.push({ subjectName: matchedSubject, colIdx: idx });
          }
        });

        if (subjectCols.length === 0) {
          toast.error('Could not find any matching subject columns in the uploaded file.');
          return;
        }

        const newMarks = { ...marks };
        let importStudentsCount = 0;
        let importMarksCount = 0;

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] || [];
          if (row.length <= idIdx) continue;

          const studentIdStr = row[idIdx] ? String(row[idIdx]).trim() : '';
          if (!studentIdStr) continue;

          const matchedStudent = students.find(s => s.studentId === studentIdStr);
          if (matchedStudent) {
            let foundAnyMark = false;
            subjectCols.forEach(({ subjectName, colIdx }) => {
              const rawVal = row[colIdx];
              const score = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
              if (score !== '') {
                if (!newMarks[subjectName]) newMarks[subjectName] = {};
                newMarks[subjectName][matchedStudent.id] = {
                  score: score,
                  remarks: newMarks[subjectName]?.[matchedStudent.id]?.remarks || ''
                };
                importMarksCount++;
                foundAnyMark = true;
              }
            });
            if (foundAnyMark) importStudentsCount++;
          }
        }

        setMarks(newMarks);
        if (importMarksCount > 0) {
          setUnsavedChanges(true);
          setUploadSummary({ students: importStudentsCount, marks: importMarksCount });
          toast.success(`Successfully parsed ${importMarksCount} marks for ${importStudentsCount} students! Please review and click "Confirm & Save".`);
        } else {
          toast.error('No marks found in the uploaded file. Please enter scores before uploading.');
        }
      } catch (err) {
        console.error('Error importing Excel/CSV:', err);
        toast.error('Failed to parse the file. Please ensure it is a valid Excel (.xlsx) or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleScoreChange = (studentId: string, val: string) => {
    setUnsavedChanges(true);
    setMarks(prev => ({
      ...prev,
      [selectedSubject]: {
        ...(prev[selectedSubject] || {}),
        [studentId]: {
          score: val,
          remarks: prev[selectedSubject]?.[studentId]?.remarks || ''
        }
      }
    }));
  };

  const handleRemarksChange = (studentId: string, val: string) => {
    setUnsavedChanges(true);
    setMarks(prev => ({
      ...prev,
      [selectedSubject]: {
        ...(prev[selectedSubject] || {}),
        [studentId]: {
          score: prev[selectedSubject]?.[studentId]?.score || '',
          remarks: val
        }
      }
    }));
  };

  const handleGenerateComment = async (studentId: string, score: string) => {
    if (!score) {
      toast.error('Please enter a score first to generate a comment.');
      return;
    }
    setGeneratingFor(studentId);
    try {
      const response = await apiClient.post('/ai/comments', {
        score: Number(score),
        maxMarks: maxMarks,
        subject: selectedSubject,
        studentId: studentId
      });
      const aiComment = response.data?.data?.comment || response.data?.data?.remarks || response.data?.comment || response.data?.remarks || 'Excellent work and dedication.';
      handleRemarksChange(studentId, aiComment);
      toast.success('AI remark generated successfully!');
    } catch (error) {
      console.warn('AI comment API error, using smart fallback logic:', error);
      const numericScore = Number(score);
      const percent = (numericScore / maxMarks) * 100;
      let mockComment = 'Shows consistent efforts and participates actively in class discussions.';
      if (percent >= 90) {
        mockComment = 'Outstanding performance! Demonstrates exceptional mastery of the concepts and analytical skills.';
      } else if (percent >= 80) {
        mockComment = 'Excellent work. Very strong understanding, keeps up high performance consistently.';
      } else if (percent >= 70) {
        mockComment = 'Good progress. Grasps main concepts well, with potential to achieve higher results.';
      } else if (percent >= 50) {
        mockComment = 'Fair understanding of the subjects, but needs more practice in problem-solving areas.';
      } else {
        mockComment = 'Needs significant improvement. Attention and additional remedial support are highly recommended.';
      }
      setTimeout(() => {
        handleRemarksChange(studentId, mockComment);
        toast.success('AI remark generated (fallback simulated).');
      }, 500);
    } finally {
      setGeneratingFor(null);
    }
  };

  const handleSave = async () => {
    if (!selectedExam) {
      toast.error('Please select an exam first');
      return;
    }
    setLoading(true);
    try {
      const payload: any[] = [];
      Object.entries(marks).forEach(([subjectName, studentScores]) => {
        Object.entries(studentScores).forEach(([studentId, data]) => {
          if (data.score !== '') {
            payload.push({
              studentId,
              subject: subjectName,
              marksObtained: Number(data.score),
              maxMarks: maxMarks,
              remarks: data.remarks || ''
            });
          }
        });
      });

      if (payload.length === 0) {
        toast.error('No marks entered to submit.');
        setLoading(false);
        return;
      }

      await apiClient.post('/results/submit', { examId: selectedExam, results: payload });
      toast.success('Grade sheets submitted successfully!');
      setUnsavedChanges(false);
      setUploadSummary(null);
      fetchStudentsAndMarks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to submit grade sheet');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return <div className="text-slate-400 p-8 text-center">Loading Grade Upload Portal...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Grade Book Portal</h2>
          <p className="text-slate-400 mt-1">Upload and view examination grades, reports and remarks.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-6">
        <button
          onClick={() => setActiveTab('upload')}
          className={`pb-3 font-bold text-sm tracking-wide transition-all ${
            activeTab === 'upload'
              ? 'text-blue-400 border-b-2 border-blue-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Grade Sheet Upload
        </button>
        <button
          onClick={() => setActiveTab('sheet')}
          className={`pb-3 font-bold text-sm tracking-wide transition-all ${
            activeTab === 'sheet'
              ? 'text-blue-400 border-b-2 border-blue-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Complete Result Sheet
        </button>
      </div>

      {activeTab === 'upload' ? (
        <>
          {/* Selectors Bar */}
          {!hasAssignments && isTeacher ? (
            <div className="glass p-8 rounded-3xl border border-rose-500/10 bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3">
              <ShieldAlert className="w-12 h-12 text-rose-500" />
              <h3 className="text-lg font-bold text-white">No Assigned Sections</h3>
              <p className="text-slate-400 text-sm max-w-md leading-relaxed">
                You are not assigned to any sections as class teacher. You cannot upload results until a section is assigned to you.
              </p>
            </div>
          ) : (
        <>
          <div className="glass p-4 rounded-2xl flex flex-wrap items-center gap-4 border border-white/5">
            <div className="flex flex-col">
              <label className="text-xs text-slate-500 font-medium mb-1">Select Exam</label>
              <div className="relative">
                <select
                  value={selectedExam}
                  onChange={(e) => setSelectedExam(e.target.value)}
                  className="bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10"
                >
                  {exams.length > 0 ? (
                    exams.map(exam => (
                      <option key={exam.id} value={exam.id}>{exam.name}</option>
                    ))
                  ) : (
                    <option value="">No exams available</option>
                  )}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {isTeacher ? (
              <div className="flex flex-col">
                <label className="text-xs text-slate-500 font-medium mb-1">Assigned Class-Section</label>
                <div className="relative">
                  <select
                    value={`${selectedClass}-${selectedSection}`}
                    onChange={(e) => {
                      const [cName, sName] = e.target.value.split('-');
                      setSelectedClass(cName);
                      setSelectedSection(sName);
                    }}
                    className="bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10 min-w-[160px]"
                  >
                    {assignedSections.map(s => (
                      <option key={s.id} value={`${s.class.name}-${s.name}`}>
                        {s.class.name} - Section {s.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-500 font-medium mb-1">Class</label>
                  <div className="relative">
                    <select
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      className="bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10"
                    >
                      {CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs text-slate-500 font-medium mb-1">Section</label>
                  <div className="relative">
                    <select
                      value={selectedSection}
                      onChange={(e) => setSelectedSection(e.target.value)}
                      className="bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10"
                    >
                      {SECTIONS.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </>
            )}

            {isSeniorClass && (
              <div className="flex flex-col">
                <label className="text-xs text-slate-500 font-medium mb-1">Department</label>
                <div className="relative">
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10"
                  >
                    {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-medium mb-1">Subject</label>
          <div className="relative">
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10"
            >
              {availableSubjects.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-slate-500 font-medium mb-1">Max Marks</label>
          <input
            type="number"
            value={maxMarks}
            onChange={(e) => setMaxMarks(parseInt(e.target.value, 10) || 100)}
            className="w-20 bg-slate-900/50 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>

      {/* Grade Sheet Grid */}
      <div className="glass rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/40 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-6 py-4 font-medium">Student</th>
                <th className="px-6 py-4 font-medium">Roll No</th>
                <th className="px-6 py-4 font-medium w-32">Score</th>
                <th className="px-6 py-4 font-medium">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    Loading students...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No students found.
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr key={student.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-white">{student.firstName} {student.lastName}</div>
                        <div className="text-xs text-slate-500">{student.studentId}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{student.rollNumber || '?'}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="0"
                          value={marks[selectedSubject]?.[student.id]?.score || ''}
                          onChange={(e) => handleScoreChange(student.id, e.target.value)}
                          className="w-16 bg-slate-950/50 border border-slate-800 rounded-xl px-2 py-1.5 text-center text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <span className="text-slate-500">/ {maxMarks}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="e.g. Excellent progress"
                          value={marks[selectedSubject]?.[student.id]?.remarks || ''}
                          onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                          className="flex-1 bg-slate-950/50 border border-slate-800 rounded-xl px-3 py-1.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <button
                          onClick={() => handleGenerateComment(student.id, marks[selectedSubject]?.[student.id]?.score)}
                          disabled={generatingFor === student.id}
                          type="button"
                          title="Generate AI Comment"
                          className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/40 transition-colors flex items-center justify-center disabled:opacity-50 flex-shrink-0"
                        >
                          {generatingFor === student.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Action Footer */}
        {students.length > 0 && (
          <div className="p-4 bg-slate-900/20 border-t border-white/5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={downloadTemplate}
                className="flex items-center gap-2 border border-slate-700/50 hover:bg-white/5 text-slate-300 font-semibold py-2 px-4 rounded-xl transition-all text-sm"
              >
                Download Template (CSV)
              </button>
              
              <label className="flex items-center gap-2 border border-indigo-500/30 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 font-semibold py-2 px-4 rounded-xl transition-all text-sm cursor-pointer">
                <span>Upload Excel/CSV</span>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleCSVImport}
                  className="hidden"
                />
              </label>
            </div>

            {/* <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Submitting...' : 'Submit Grade Sheet'}
            </button> */}
          </div>
        )}
      </div>
        </>
      )}
        </>
      ) : (
        <>
          {/* COMPLETE RESULT SHEET TAB */}
          <div className="glass p-5 rounded-3xl flex flex-wrap items-center justify-between gap-6 border border-white/5 bg-slate-900/30">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex flex-col">
                <label className="text-xs text-slate-500 font-semibold mb-1.5">Select Exam</label>
                <div className="relative">
                  <select
                    value={selectedExam}
                    onChange={(e) => setSelectedExam(e.target.value)}
                    className="bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10 min-w-[160px]"
                  >
                    {exams.length > 0 ? (
                      exams.map(exam => (
                        <option key={exam.id} value={exam.id}>{exam.name}</option>
                      ))
                    ) : (
                      <option value="">No exams available</option>
                    )}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {isTeacher ? (
                <div className="flex flex-col">
                  <label className="text-xs text-slate-500 font-semibold mb-1.5">Assigned Class-Section</label>
                  <div className="relative">
                    <select
                      value={`${selectedClass}-${selectedSection}`}
                      onChange={(e) => {
                        const [cName, sName] = e.target.value.split('-');
                        setSelectedClass(cName);
                        setSelectedSection(sName);
                      }}
                      className="bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10 min-w-[160px]"
                    >
                      {assignedSections.map(s => (
                        <option key={s.id} value={`${s.class.name}-${s.name}`}>
                          {s.class.name} - Section {s.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-500 font-semibold mb-1.5">Class</label>
                    <div className="relative">
                      <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10 min-w-[140px]"
                      >
                        {CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs text-slate-500 font-semibold mb-1.5">Section</label>
                    <div className="relative">
                      <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10 min-w-[120px]"
                      >
                        {SECTIONS.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={downloadCSV}
              disabled={studentRows.length === 0}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-lg shadow-emerald-500/10 active:scale-[0.98] text-sm"
            >
              Download CSV Sheet
            </button>
          </div>

          {/* Info Card displaying Who Made the Result */}
          <div className="glass p-5 rounded-3xl border border-white/5 bg-slate-900/20 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-slate-500 text-xs font-bold block mb-1">Result Author (Class Teacher Assigned)</span>
              <span className="text-white font-semibold text-sm">
                {resultSheetClassTeacher !== 'Not Assigned' ? resultSheetClassTeacher : '⚠️ No Class Teacher Assigned'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 text-xs font-bold block mb-1">Total Tracked Subjects</span>
              <span className="text-blue-400 font-extrabold text-sm">{uniqueSubjects.length} Subjects</span>
            </div>
          </div>

          {/* Grid Table */}
          <div className="glass rounded-3xl overflow-hidden border border-white/5 bg-slate-900/20 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/40 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-medium pl-8">Student Info</th>
                    <th className="px-6 py-4 font-medium">Roll No</th>
                    {uniqueSubjects.map(sub => (
                      <th key={sub} className="px-6 py-4 font-medium text-center">{sub}</th>
                    ))}
                    <th className="px-6 py-4 font-medium text-center">Total Score</th>
                    <th className="px-6 py-4 font-medium text-center pr-8">Percentage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {completeResultsLoading ? (
                    <tr>
                      <td colSpan={uniqueSubjects.length + 4} className="px-6 py-12 text-center text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          Loading complete class results...
                        </div>
                      </td>
                    </tr>
                  ) : studentRows.length === 0 ? (
                    <tr>
                      <td colSpan={uniqueSubjects.length + 4} className="px-6 py-12 text-center text-slate-500 italic">
                        No examination results found for {selectedClass} Section {selectedSection}.
                      </td>
                    </tr>
                  ) : (
                    studentRows.map((row) => {
                      const pct = row.totalPossible > 0 ? Math.round((row.totalObtained / row.totalPossible) * 100) : null;
                      return (
                        <tr key={row.studentId} className="hover:bg-white/[0.01] transition-colors">
                          <td className="px-6 py-4 pl-8">
                            <div>
                              <div className="font-semibold text-white">{row.firstName} {row.lastName}</div>
                              <div className="text-xs text-slate-500 font-mono">{row.studentId}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-semibold">{row.rollNumber}</td>
                          {uniqueSubjects.map(sub => (
                            <td key={sub} className="px-6 py-4 text-center font-medium">
                              {row.scores[sub] !== undefined ? (
                                <span className="text-slate-200">
                                  {row.scores[sub]}<span className="text-slate-500 text-xs">/{row.maxMarks[sub]}</span>
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          ))}
                          <td className="px-6 py-4 text-center font-bold text-slate-200">
                            {row.totalObtained}<span className="text-slate-500 text-xs">/{row.totalPossible}</span>
                          </td>
                          <td className="px-6 py-4 text-center font-extrabold text-blue-400 pr-8">
                            {pct !== null ? `${pct}%` : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Floating Save Action Bar when there are unsaved changes */}
      {unsavedChanges && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="glass px-6 py-4 rounded-full shadow-2xl shadow-blue-500/30 border border-blue-500/40 bg-slate-900/90 backdrop-blur-xl flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-sm font-bold text-white tracking-wide">
                {uploadSummary 
                  ? `Parsed ${uploadSummary.marks} grades for ${uploadSummary.students} students.`
                  : 'You have unsaved changes.'}
              </span>
            </div>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2.5 px-6 rounded-full transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98]"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : 'Confirm & Save All'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarksEntry;
