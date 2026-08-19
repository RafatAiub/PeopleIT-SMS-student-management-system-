import React, { useEffect, useMemo, useState } from 'react';
import {
  CreditCard as IdCardIcon,
  Download,
  Ban,
  CheckSquare,
  Square,
  Users,
  ListChecks,
  X,
  ArrowRight,
  PlusCircle,
  CheckCircle2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useTableParams } from '../../hooks/useTableParams';
import { Pagination } from '../../components/Pagination';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { EmptyState } from '../../components/common/EmptyState';
import { Button } from '../../components/ui/Button';
import { IdCardPreview, IdCardTemplate, IdCardPreviewData } from './IdCardPreview';
import { SAMPLE_STUDENT_DATA, SAMPLE_STAFF_DATA } from './IdCardTemplateBuilder';

interface StudentRow {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  class?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
}

interface StaffRow {
  id: string;
  name: string;
  employeeId?: string | null;
  department: string | null;
  designation: string | null;
}

interface GeneratedCard {
  id: string;
  cardNumber: string;
  userType: 'STUDENT' | 'STAFF';
  student: { firstName: string; lastName: string } | null;
  staff: { user: { firstName: string; lastName: string } } | null;
}

interface IdCardListItem {
  id: string;
  cardNumber: string;
  userType: 'STUDENT' | 'STAFF';
  status: 'ACTIVE' | 'REVOKED';
  issuedAt: string;
  template: { id: string; title: string };
  student: { id: string; firstName: string; lastName: string; studentId: string; class: { name: string } | null; section: { name: string } | null } | null;
  staff: { id: string; employeeId: string | null; department: string | null; designation: string | null; user: { firstName: string; lastName: string } } | null;
}

// Downloads a PDF blob via the same object-URL pattern used by
// TimetableGrid.tsx's downloadPdf.
async function downloadCardPdf(id: string, filename: string) {
  try {
    const response = await apiClient.get(`/id-cards/${id}/pdf`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    toast.error(err.response?.data?.message || 'Failed to download ID card PDF');
  }
}

export default function IdCardGenerate() {
  const [activeTab, setActiveTab] = useState<'generate' | 'issued'>('generate');

  const [templates, setTemplates] = useState<IdCardTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || null;

  // -------- Student picker (cross-page selection, since DataTable's
  // built-in `selectable` only tracks selection within the currently
  // rendered page's `data` prop) --------
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const studentParams = useTableParams(10);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentsTotal, setStudentsTotal] = useState(0);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Map<string, StudentRow>>(new Map());

  // -------- Staff picker --------
  const [departmentFilter, setDepartmentFilter] = useState('');
  const staffParams = useTableParams(10);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [staffTotal, setStaffTotal] = useState(0);
  const [staffLoading, setStaffLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Map<string, StaffRow>>(new Map());

  const [generating, setGenerating] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);

  // -------- Previously generated cards list --------
  const listParams = useTableParams(10);
  const [cardList, setCardList] = useState<IdCardListItem[]>([]);
  const [cardListTotal, setCardListTotal] = useState(0);
  const [cardListLoading, setCardListLoading] = useState(false);
  const [userTypeFilter, setUserTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cardToRevoke, setCardToRevoke] = useState<IdCardListItem | null>(null);
  const [revoking, setRevoking] = useState(false);

  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = await apiClient.get('/id-cards/templates');
      const active = (res.data.data || []).filter((t: IdCardTemplate) => t.isActive);
      setTemplates(active);
      setSelectedTemplateId((prev) => (active.some((t: IdCardTemplate) => t.id === prev) ? prev : active[0]?.id || ''));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load ID card templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    apiClient.get('/students/meta/classes').then((res) => setClasses(res.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!classFilter) {
      setSections([]);
      setSectionFilter('');
      return;
    }
    apiClient.get(`/students/meta/sections?classId=${classFilter}`).then((res) => setSections(res.data.data || [])).catch(() => {});
  }, [classFilter]);

  // Student list fetch
  useEffect(() => {
    if (selectedTemplate?.applicableTo !== 'STUDENT') return;
    const fetchStudents = async () => {
      setStudentsLoading(true);
      try {
        const qp = new URLSearchParams({
          page: studentParams.params.page.toString(),
          pageSize: studentParams.params.pageSize.toString(),
        });
        if (studentParams.debouncedSearch) qp.append('search', studentParams.debouncedSearch);
        if (classFilter) qp.append('classId', classFilter);
        if (sectionFilter) qp.append('sectionId', sectionFilter);
        const res = await apiClient.get(`/students?${qp.toString()}`);
        setStudents(res.data.data || []);
        setStudentsTotal(res.data.meta?.total || 0);
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'Failed to load students');
      } finally {
        setStudentsLoading(false);
      }
    };
    fetchStudents();
  }, [selectedTemplate?.applicableTo, studentParams.params.page, studentParams.params.pageSize, studentParams.debouncedSearch, classFilter, sectionFilter]);

  // Staff list fetch
  useEffect(() => {
    if (selectedTemplate?.applicableTo !== 'STAFF') return;
    const fetchStaff = async () => {
      setStaffLoading(true);
      try {
        const qp = new URLSearchParams({
          page: staffParams.params.page.toString(),
          pageSize: staffParams.params.pageSize.toString(),
        });
        if (staffParams.debouncedSearch) qp.append('search', staffParams.debouncedSearch);
        if (departmentFilter) qp.append('department', departmentFilter);
        const res = await apiClient.get(`/hr/staff?${qp.toString()}`);
        const list = res.data.data?.staff || res.data.data || [];
        setStaff(list);
        setStaffTotal(res.data.data?.total || res.data.meta?.total || list.length);
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'Failed to load staff');
      } finally {
        setStaffLoading(false);
      }
    };
    fetchStaff();
  }, [selectedTemplate?.applicableTo, staffParams.params.page, staffParams.params.pageSize, staffParams.debouncedSearch, departmentFilter]);

  const fetchCardList = async () => {
    setCardListLoading(true);
    try {
      const qp = new URLSearchParams({
        page: listParams.params.page.toString(),
        pageSize: listParams.params.pageSize.toString(),
      });
      if (listParams.debouncedSearch) qp.append('search', listParams.debouncedSearch);
      if (userTypeFilter) qp.append('userType', userTypeFilter);
      if (statusFilter) qp.append('status', statusFilter);
      const res = await apiClient.get(`/id-cards?${qp.toString()}`);
      setCardList(res.data.data || []);
      // Backend wraps pagination info under `meta` (see paginatedResponse in
      // backend/src/utils/response.ts) — reading a `pagination` key here
      // silently always returned 0 and broke both the "Showing X of Y" text
      // and the page-count math further down the list.
      setCardListTotal(res.data.meta?.total || 0);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load generated ID cards');
    } finally {
      setCardListLoading(false);
    }
  };

  useEffect(() => {
    fetchCardList();
  }, [listParams.params.page, listParams.params.pageSize, listParams.debouncedSearch, userTypeFilter, statusFilter]);

  const toggleStudent = (row: StudentRow) => {
    setSelectedStudents((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });
  };

  const toggleStaff = (row: StaffRow) => {
    setSelectedStaff((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });
  };

  const selectAllOnPage = () => {
    if (selectedTemplate?.applicableTo === 'STUDENT') {
      setSelectedStudents((prev) => {
        const next = new Map(prev);
        students.forEach((s) => next.set(s.id, s));
        return next;
      });
    } else {
      setSelectedStaff((prev) => {
        const next = new Map(prev);
        staff.forEach((s) => next.set(s.id, s));
        return next;
      });
    }
  };

  const clearSelection = () => {
    setSelectedStudents(new Map());
    setSelectedStaff(new Map());
  };

  const selectedCount = selectedTemplate?.applicableTo === 'STUDENT' ? selectedStudents.size : selectedStaff.size;
  const selectedNames =
    selectedTemplate?.applicableTo === 'STUDENT'
      ? Array.from(selectedStudents.values()).map((s) => `${s.firstName} ${s.lastName}`)
      : Array.from(selectedStaff.values()).map((s) => s.name);

  const handleGenerate = async () => {
    if (!selectedTemplate) {
      toast.error('Select a template first');
      return;
    }
    if (selectedCount === 0) {
      toast.error(`Select at least one ${selectedTemplate.applicableTo === 'STUDENT' ? 'student' : 'staff member'}`);
      return;
    }
    setGenerating(true);
    try {
      const payload =
        selectedTemplate.applicableTo === 'STUDENT'
          ? { templateId: selectedTemplate.id, studentIds: Array.from(selectedStudents.keys()) }
          : { templateId: selectedTemplate.id, staffIds: Array.from(selectedStaff.keys()) };
      const res = await apiClient.post('/id-cards/generate', payload);
      setGeneratedCards(res.data.data || []);
      toast.success(`Generated ${res.data.data?.length ?? 0} ID card(s)`);
      clearSelection();
      fetchCardList();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to generate ID cards');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async () => {
    if (!cardToRevoke) return;
    setRevoking(true);
    try {
      await apiClient.patch(`/id-cards/${cardToRevoke.id}/revoke`);
      toast.success('ID card revoked');
      setCardToRevoke(null);
      fetchCardList();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to revoke ID card');
    } finally {
      setRevoking(false);
    }
  };

  const previewData: IdCardPreviewData = selectedTemplate?.applicableTo === 'STAFF' ? SAMPLE_STAFF_DATA : SAMPLE_STUDENT_DATA;

  const cardListColumns: Column<IdCardListItem>[] = useMemo(
    () => [
      { key: 'cardNumber', header: 'Card Number', accessor: 'cardNumber' },
      {
        key: 'holder',
        header: 'Holder',
        render: (row) =>
          row.userType === 'STUDENT'
            ? `${row.student?.firstName ?? ''} ${row.student?.lastName ?? ''}`.trim() || '—'
            : `${row.staff?.user.firstName ?? ''} ${row.staff?.user.lastName ?? ''}`.trim() || '—',
      },
      {
        key: 'detail',
        header: 'Class / Designation',
        render: (row) =>
          row.userType === 'STUDENT'
            ? `${row.student?.class?.name ?? ''}${row.student?.section?.name ? ' - ' + row.student.section.name : ''}` || '—'
            : `${row.staff?.designation ?? ''}${row.staff?.department ? ' · ' + row.staff.department : ''}` || '—',
      },
      { key: 'template', header: 'Template', render: (row) => row.template?.title || '—' },
      { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
      {
        key: 'actions',
        header: '',
        sortable: false,
        render: (row) => (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => downloadCardPdf(row.id, `id-card-${row.cardNumber}.pdf`)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              title="Download PDF"
            >
              <Download className="w-4 h-4" />
            </button>
            {row.status === 'ACTIVE' && (
              <button
                type="button"
                onClick={() => setCardToRevoke(row)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                title="Revoke"
              >
                <Ban className="w-4 h-4" />
              </button>
            )}
          </div>
        ),
      },
    ],
    []
  );

  const noTemplates = !templatesLoading && templates.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <IdCardIcon className="w-6 h-6 text-primary-500" />
          ID Cards
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Generate ID cards from a saved template, then manage everything that's already been issued.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/10 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('generate')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'generate'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <PlusCircle className="w-4.5 h-4.5" />
            Generate Cards
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('issued')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'issued'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <ListChecks className="w-4.5 h-4.5" />
            Issued Cards
            {cardListTotal > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">
                {cardListTotal}
              </span>
            )}
          </div>
        </button>
      </div>

      {activeTab === 'generate' && (
        <>
          {noTemplates ? (
            <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/30">
              <EmptyState
                icon={<IdCardIcon className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
                title="No active templates yet"
                description="Design a card layout in the Template Builder first, then come back here to issue it to students or staff."
                action={
                  <Link to="/id-cards/builder">
                    <Button type="button" variant="gradient">
                      <PlusCircle className="w-4 h-4" />
                      Create a Template
                    </Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <>
              {/* Step 1 — template + live preview */}
              <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/30 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-500 text-white text-xs font-bold flex-shrink-0">1</span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Choose a Template</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Active Template</label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => {
                        setSelectedTemplateId(e.target.value);
                        clearSelection();
                      }}
                      disabled={templatesLoading}
                      className="input-field"
                    >
                      {templatesLoading && <option value="">Loading templates...</option>}
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} — {t.applicableTo === 'STUDENT' ? 'Student card' : 'Staff card'}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Only active templates are listed — activate one from the{' '}
                      <Link to="/id-cards/builder" className="text-primary-600 dark:text-primary-400 hover:underline">
                        Template Builder
                      </Link>{' '}
                      if the one you need isn't here.
                    </p>
                  </div>
                  <div className="flex justify-center lg:justify-end">
                    {selectedTemplate && (
                      <div className="text-center">
                        <IdCardPreview template={selectedTemplate} data={previewData} />
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">Preview with sample data</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {selectedTemplate && (
                <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/30 p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-500 text-white text-xs font-bold flex-shrink-0">2</span>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Select {selectedTemplate.applicableTo === 'STUDENT' ? 'Students' : 'Staff'}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={selectAllOnPage}>
                        <CheckSquare className="w-3.5 h-3.5" /> Select page
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={clearSelection} disabled={selectedCount === 0}>
                        <Square className="w-3.5 h-3.5" /> Clear
                      </Button>
                    </div>
                  </div>

                  {selectedCount > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 p-3 rounded-xl bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/20">
                      <Users className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />
                      <span className="text-xs font-semibold text-primary-700 dark:text-primary-300 mr-1">
                        {selectedCount} selected:
                      </span>
                      {selectedNames.slice(0, 6).map((name, i) => (
                        <span
                          key={i}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-primary-200 dark:border-primary-500/30 text-slate-700 dark:text-slate-300"
                        >
                          {name}
                        </span>
                      ))}
                      {selectedNames.length > 6 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-primary-200 dark:border-primary-500/30 text-slate-500 dark:text-slate-400">
                          +{selectedNames.length - 6} more
                        </span>
                      )}
                    </div>
                  )}

                  {selectedTemplate.applicableTo === 'STUDENT' ? (
                    <>
                      <div className="flex flex-wrap gap-3">
                        <input
                          type="text"
                          placeholder="Search students..."
                          value={studentParams.params.search}
                          onChange={(e) => studentParams.setSearch(e.target.value)}
                          className="input-field max-w-xs text-sm"
                        />
                        <select value={classFilter} onChange={(e) => { setClassFilter(e.target.value); setSectionFilter(''); }} className="input-field max-w-[180px] text-sm">
                          <option value="">All classes</option>
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} disabled={!classFilter} className="input-field max-w-[180px] text-sm">
                          <option value="">All sections</option>
                          {sections.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                              <th className="px-4 py-3 w-10"></th>
                              <th className="table-header">Student ID</th>
                              <th className="table-header">Name</th>
                              <th className="table-header">Class</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentsLoading ? (
                              <tr><td colSpan={4} className="text-center py-8 text-slate-400 text-sm">Loading...</td></tr>
                            ) : students.length === 0 ? (
                              <tr><td colSpan={4} className="text-center py-8 text-slate-400 text-sm">No students found</td></tr>
                            ) : (
                              students.map((s) => (
                                <tr
                                  key={s.id}
                                  onClick={() => toggleStudent(s)}
                                  className={`border-b border-slate-100 dark:border-white/5 cursor-pointer transition-colors ${
                                    selectedStudents.has(s.id) ? 'bg-primary-50 dark:bg-primary-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                                  }`}
                                >
                                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={selectedStudents.has(s.id)}
                                      onChange={() => toggleStudent(s)}
                                      className="w-4 h-4 rounded-sm accent-primary-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="table-cell">{s.studentId}</td>
                                  <td className="table-cell">{s.firstName} {s.lastName}</td>
                                  <td className="table-cell">{s.class?.name || '—'}{s.section?.name ? ` - ${s.section.name}` : ''}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <Pagination
                        page={studentParams.params.page}
                        pageSize={studentParams.params.pageSize}
                        total={studentsTotal}
                        onPageChange={studentParams.setPage}
                        onPageSizeChange={studentParams.setPageSize}
                      />
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-3">
                        <input
                          type="text"
                          placeholder="Search staff..."
                          value={staffParams.params.search}
                          onChange={(e) => staffParams.setSearch(e.target.value)}
                          className="input-field max-w-xs text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Filter by department..."
                          value={departmentFilter}
                          onChange={(e) => setDepartmentFilter(e.target.value)}
                          className="input-field max-w-xs text-sm"
                        />
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                              <th className="px-4 py-3 w-10"></th>
                              <th className="table-header">Employee ID</th>
                              <th className="table-header">Name</th>
                              <th className="table-header">Designation / Department</th>
                            </tr>
                          </thead>
                          <tbody>
                            {staffLoading ? (
                              <tr><td colSpan={4} className="text-center py-8 text-slate-400 text-sm">Loading...</td></tr>
                            ) : staff.length === 0 ? (
                              <tr><td colSpan={4} className="text-center py-8 text-slate-400 text-sm">No staff found</td></tr>
                            ) : (
                              staff.map((s) => (
                                <tr
                                  key={s.id}
                                  onClick={() => toggleStaff(s)}
                                  className={`border-b border-slate-100 dark:border-white/5 cursor-pointer transition-colors ${
                                    selectedStaff.has(s.id) ? 'bg-primary-50 dark:bg-primary-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                                  }`}
                                >
                                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={selectedStaff.has(s.id)}
                                      onChange={() => toggleStaff(s)}
                                      className="w-4 h-4 rounded-sm accent-primary-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="table-cell">{s.employeeId || '—'}</td>
                                  <td className="table-cell">{s.name}</td>
                                  <td className="table-cell">{s.designation || '—'}{s.department ? ` · ${s.department}` : ''}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <Pagination
                        page={staffParams.params.page}
                        pageSize={staffParams.params.pageSize}
                        total={staffTotal}
                        onPageChange={staffParams.setPage}
                        onPageSizeChange={staffParams.setPageSize}
                      />
                    </>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/5">
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-500 text-white text-[11px] font-bold flex-shrink-0">3</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {selectedCount === 0 ? 'Pick recipients above, then generate' : `Ready to issue ${selectedCount} card${selectedCount === 1 ? '' : 's'}`}
                      </span>
                    </span>
                    <Button type="button" variant="gradient" onClick={handleGenerate} disabled={generating || selectedCount === 0} isLoading={generating}>
                      <IdCardIcon className="w-4 h-4" />
                      Generate {selectedCount > 0 ? `${selectedCount} ` : ''}ID Card{selectedCount === 1 ? '' : 's'}
                    </Button>
                  </div>
                </div>
              )}

              {generatedCards.length > 0 && (
                <div className="glass-card rounded-2xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5 p-6 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4.5 h-4.5" />
                      {generatedCards.length} ID card{generatedCards.length === 1 ? '' : 's'} just generated
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('issued')}
                      className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      View in Issued Cards <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-emerald-200/60 dark:border-emerald-500/10 bg-white dark:bg-slate-900/40">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-emerald-100 dark:border-emerald-500/10 bg-emerald-50/60 dark:bg-emerald-500/5">
                          <th className="table-header">Card Number</th>
                          <th className="table-header">Holder</th>
                          <th className="table-header text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generatedCards.map((c) => (
                          <tr key={c.id} className="border-b border-slate-100 dark:border-white/5 last:border-0">
                            <td className="table-cell font-mono">{c.cardNumber}</td>
                            <td className="table-cell">
                              {c.userType === 'STUDENT'
                                ? `${c.student?.firstName ?? ''} ${c.student?.lastName ?? ''}`
                                : `${c.staff?.user.firstName ?? ''} ${c.staff?.user.lastName ?? ''}`}
                            </td>
                            <td className="table-cell text-right">
                              <button
                                type="button"
                                onClick={() => downloadCardPdf(c.id, `id-card-${c.cardNumber}.pdf`)}
                                className="text-primary-600 dark:text-primary-400 hover:underline text-xs font-semibold inline-flex items-center gap-1"
                              >
                                <Download className="w-3.5 h-3.5" /> Download PDF
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'issued' && (
        <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/30 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Issued ID Cards</h3>
            <div className="flex flex-wrap gap-2">
              <select value={userTypeFilter} onChange={(e) => { setUserTypeFilter(e.target.value); listParams.setPage(1); }} className="input-field text-sm py-1.5">
                <option value="">All types</option>
                <option value="STUDENT">Student</option>
                <option value="STAFF">Staff</option>
              </select>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); listParams.setPage(1); }} className="input-field text-sm py-1.5">
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="REVOKED">Revoked</option>
              </select>
              {(userTypeFilter || statusFilter || listParams.params.search) && (
                <button
                  type="button"
                  onClick={() => { setUserTypeFilter(''); setStatusFilter(''); listParams.setSearch(''); listParams.setPage(1); }}
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white px-2"
                >
                  <X className="w-3.5 h-3.5" /> Reset
                </button>
              )}
            </div>
          </div>
          <DataTable
            data={cardList}
            columns={cardListColumns}
            isLoading={cardListLoading}
            serverPagination
            serverSearch
            onSearch={listParams.setSearch}
            searchPlaceholder="Search by card number, name or ID..."
            totalCount={cardListTotal}
            page={listParams.params.page}
            pageSize={listParams.params.pageSize}
            onPageChange={listParams.setPage}
            onPageSizeChange={listParams.setPageSize}
            emptyTitle="No ID cards issued yet"
            emptyDescription="Switch to the Generate Cards tab to issue your first batch."
          />
        </div>
      )}

      <ConfirmModal
        isOpen={!!cardToRevoke}
        title="Revoke ID Card"
        message={`Are you sure you want to revoke card ${cardToRevoke?.cardNumber}? The holder will need a new card to be generated.`}
        confirmLabel="Revoke"
        isLoading={revoking}
        onConfirm={handleRevoke}
        onCancel={() => setCardToRevoke(null)}
      />
    </div>
  );
}
