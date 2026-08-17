import React, { useEffect, useState } from 'react';
import { CreditCard, Plus, Image as ImageIcon, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { IdCardPreview, IdCardTemplate, IdCardShowFields, CanvasElement } from './IdCardPreview';

// Sample data so the live preview always shows something meaningful while
// the admin is still building the template, before any real cards exist.
export const SAMPLE_STUDENT_DATA = {
  name: 'Jane Doe',
  subtitle: 'Class 8 - Section A',
  classText: 'Class 8 - Section A',
  cardNumber: 'SMS-2026-000123',
  admissionNo: 'STU-1042',
  fatherName: 'John Doe',
  motherName: 'Mary Doe',
  address: '123 Green Road, Dhaka, Bangladesh',
  dob: '2012-05-14',
  bloodGroup: 'O+',
};

export const SAMPLE_STAFF_DATA = {
  name: 'Alex Rahman',
  subtitle: 'Senior Teacher - Science',
  designation: 'Senior Teacher',
  department: 'Science',
  cardNumber: 'SMS-2026-STF-045',
  admissionNo: 'EMP-2210',
  fatherName: '',
  motherName: '',
  address: '45 College Road, Dhaka, Bangladesh',
  dob: '1988-03-02',
  bloodGroup: 'A+',
};

const SHOW_FIELD_OPTIONS: { key: keyof IdCardShowFields; label: string }[] = [
  { key: 'admissionNo', label: 'Admission / Employee No' },
  { key: 'name', label: 'Name' },
  { key: 'class', label: 'Class / Designation' },
  { key: 'fatherName', label: "Father's Name" },
  { key: 'motherName', label: "Mother's Name" },
  { key: 'address', label: 'Address' },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'bloodGroup', label: 'Blood Group' },
];

const DEFAULT_SHOW_FIELDS: IdCardShowFields = {
  admissionNo: true,
  name: true,
  class: true,
  fatherName: true,
  motherName: false,
  address: true,
  dob: false,
  bloodGroup: true,
};

interface FormState {
  title: string;
  applicableTo: 'STUDENT' | 'STAFF';
  layout: 'VERTICAL' | 'HORIZONTAL';
  widthMm: number;
  heightMm: number;
  backgroundImage: string | null;
  logoImage: string | null;
  signatureImage: string | null;
  photoStyle: 'CIRCLE' | 'SQUARE' | 'ROUNDED';
  photoWidthMm: number;
  photoHeightMm: number;
  primaryColor: string;
  secondaryColor: string;
  showFields: IdCardShowFields;
  layoutMode: 'SIMPLE' | 'ADVANCED';
  canvasElements: CanvasElement[] | null;
  isActive: boolean;
}

// A handful of ready-made theme pairs so admins don't have to hunt for a
// combination that works — click a swatch, or fine-tune with the pickers.
const COLOR_PRESETS: { label: string; primaryColor: string; secondaryColor: string }[] = [
  { label: 'Violet', primaryColor: '#7c3aed', secondaryColor: '#0f172a' },
  { label: 'Blue', primaryColor: '#2563eb', secondaryColor: '#1e293b' },
  { label: 'Emerald', primaryColor: '#059669', secondaryColor: '#0f172a' },
  { label: 'Crimson', primaryColor: '#dc2626', secondaryColor: '#1c1917' },
  { label: 'Amber', primaryColor: '#d97706', secondaryColor: '#292524' },
  { label: 'Teal', primaryColor: '#0d9488', secondaryColor: '#134e4a' },
];

const emptyForm: FormState = {
  title: '',
  applicableTo: 'STUDENT',
  layout: 'VERTICAL',
  widthMm: 57,
  heightMm: 89,
  backgroundImage: null,
  logoImage: null,
  signatureImage: null,
  photoStyle: 'CIRCLE',
  photoWidthMm: 21,
  photoHeightMm: 21,
  primaryColor: '#7c3aed',
  secondaryColor: '#0f172a',
  showFields: DEFAULT_SHOW_FIELDS,
  layoutMode: 'SIMPLE',
  canvasElements: null,
  isActive: true,
};

// Same canvas-based compress-to-base64 pattern used for student/institution
// photo uploads (see StudentList.tsx) — there is no object storage in this
// app, images are persisted as base64 data URLs directly in DB columns.
const compressImage = (file: File, maxDim = 500, quality = 0.75): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(event.target?.result as string);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
};

function ImagePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    onChange(compressed || null);
    e.target.value = '';
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg border border-dashed border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center overflow-hidden flex-shrink-0">
          {value ? (
            <img src={value} alt={label} className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-5 h-5 text-slate-400" />
          )}
        </div>
        <label className="btn-secondary text-xs px-3 py-1.5 cursor-pointer">
          {value ? 'Change' : 'Upload'}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-slate-400 hover:text-red-500 p-1"
            title="Remove image"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function IdCardTemplateBuilder() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<IdCardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [templateToDelete, setTemplateToDelete] = useState<IdCardTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/id-cards/templates');
      setTemplates(res.data.data || []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load ID card templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleEdit = (template: IdCardTemplate) => {
    setEditingId(template.id);
    setForm({
      title: template.title,
      applicableTo: template.applicableTo,
      layout: template.layout,
      widthMm: template.widthMm,
      heightMm: template.heightMm,
      backgroundImage: template.backgroundImage,
      logoImage: template.logoImage,
      signatureImage: template.signatureImage,
      photoStyle: template.photoStyle,
      photoWidthMm: template.photoWidthMm,
      photoHeightMm: template.photoHeightMm,
      primaryColor: template.primaryColor || '#7c3aed',
      secondaryColor: template.secondaryColor || '#0f172a',
      showFields: { ...DEFAULT_SHOW_FIELDS, ...template.showFields },
      layoutMode: template.layoutMode || 'SIMPLE',
      canvasElements: template.canvasElements || null,
      isActive: template.isActive,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, title: form.title.trim() };
      if (editingId) {
        await apiClient.put(`/id-cards/templates/${editingId}`, payload);
        toast.success('Template updated');
      } else {
        await apiClient.post('/id-cards/templates', payload);
        toast.success('Template created');
      }
      resetForm();
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/id-cards/templates/${templateToDelete.id}`);
      toast.success('Template deleted');
      setTemplateToDelete(null);
      if (editingId === templateToDelete.id) resetForm();
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete template');
    } finally {
      setDeleting(false);
    }
  };

  const previewTemplate: IdCardTemplate = {
    id: editingId || 'preview',
    institutionId: '',
    title: form.title,
    applicableTo: form.applicableTo,
    layout: form.layout,
    widthMm: form.widthMm,
    heightMm: form.heightMm,
    backgroundImage: form.backgroundImage,
    logoImage: form.logoImage,
    signatureImage: form.signatureImage,
    photoStyle: form.photoStyle,
    photoWidthMm: form.photoWidthMm,
    photoHeightMm: form.photoHeightMm,
    primaryColor: form.primaryColor,
    secondaryColor: form.secondaryColor,
    showFields: form.showFields,
    layoutMode: form.layoutMode,
    canvasElements: form.canvasElements,
    isActive: form.isActive,
    createdAt: '',
    updatedAt: '',
  };

  const sampleData = form.applicableTo === 'STUDENT' ? SAMPLE_STUDENT_DATA : SAMPLE_STAFF_DATA;

  const columns: Column<IdCardTemplate>[] = [
    { key: 'title', header: 'Title', accessor: 'title' },
    {
      key: 'applicableTo',
      header: 'Applies To',
      render: (row) => <Badge variant="info">{row.applicableTo}</Badge>,
    },
    {
      key: 'layout',
      header: 'Layout',
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {row.layout}
          {row.layoutMode === 'ADVANCED' && <Badge variant="warning">Advanced</Badge>}
        </span>
      ),
    },
    { key: 'size', header: 'Size (mm)', render: (row) => `${row.widthMm} x ${row.heightMm}` },
    {
      key: 'isActive',
      header: 'Status',
      render: (row) => <Badge variant={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-primary-500" />
          ID Card Template Builder
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Design student and staff ID card layouts, then generate cards from them.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Form */}
        <form onSubmit={handleSubmit} className="xl:col-span-3 glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/30 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {editingId ? 'Edit Template' : 'New Template'}
            </h3>
            {editingId && (
              <button type="button" onClick={resetForm} className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white">
                Cancel edit
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Design Mode</label>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, layoutMode: 'SIMPLE' }))}
                className={`px-4 py-1.5 text-xs font-semibold transition-colors ${form.layoutMode === 'SIMPLE' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-slate-900/40 text-slate-600 dark:text-slate-300'}`}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, layoutMode: 'ADVANCED' }))}
                className={`px-4 py-1.5 text-xs font-semibold transition-colors ${form.layoutMode === 'ADVANCED' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-slate-900/40 text-slate-600 dark:text-slate-300'}`}
              >
                Advanced Design
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">ID Card Title</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Standard Student ID Card"
                className="input-field"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Applicable User</label>
              <select
                value={form.applicableTo}
                onChange={(e) => setForm((p) => ({ ...p, applicableTo: e.target.value as 'STUDENT' | 'STAFF' }))}
                className="input-field"
              >
                <option value="STUDENT">Student</option>
                <option value="STAFF">Staff</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Layout</label>
              <select
                value={form.layout}
                onChange={(e) => setForm((p) => ({ ...p, layout: e.target.value as 'VERTICAL' | 'HORIZONTAL' }))}
                className="input-field"
              >
                <option value="VERTICAL">Vertical</option>
                <option value="HORIZONTAL">Horizontal</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Width (mm)</label>
              <input
                type="number"
                min={1}
                max={200}
                required
                value={form.widthMm}
                onChange={(e) => setForm((p) => ({ ...p, widthMm: Number(e.target.value) }))}
                className="input-field"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Height (mm)</label>
              <input
                type="number"
                min={1}
                max={200}
                required
                value={form.heightMm}
                onChange={(e) => setForm((p) => ({ ...p, heightMm: Number(e.target.value) }))}
                className="input-field"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Photo Style</label>
              <select
                value={form.photoStyle}
                onChange={(e) => setForm((p) => ({ ...p, photoStyle: e.target.value as FormState['photoStyle'] }))}
                className="input-field"
              >
                <option value="CIRCLE">Circle</option>
                <option value="SQUARE">Square</option>
                <option value="ROUNDED">Rounded</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Photo Width (mm)</label>
              <input
                type="number"
                min={1}
                max={100}
                required
                value={form.photoWidthMm}
                onChange={(e) => setForm((p) => ({ ...p, photoWidthMm: Number(e.target.value) }))}
                className="input-field"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Photo Height (mm)</label>
              <input
                type="number"
                min={1}
                max={100}
                required
                value={form.photoHeightMm}
                onChange={(e) => setForm((p) => ({ ...p, photoHeightMm: Number(e.target.value) }))}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-white/5">
            <ImagePicker label="Background Image" value={form.backgroundImage} onChange={(v) => setForm((p) => ({ ...p, backgroundImage: v }))} />
            <ImagePicker label="Logo Image" value={form.logoImage} onChange={(v) => setForm((p) => ({ ...p, logoImage: v }))} />
            <ImagePicker label="Signature Image" value={form.signatureImage} onChange={(v) => setForm((p) => ({ ...p, signatureImage: v }))} />
          </div>

          {form.layoutMode === 'SIMPLE' ? (
            <>
              <div className="pt-2 border-t border-slate-100 dark:border-white/5 space-y-3">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Card Colors</p>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((preset) => {
                    const active = form.primaryColor === preset.primaryColor && form.secondaryColor === preset.secondaryColor;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        title={preset.label}
                        onClick={() => setForm((p) => ({ ...p, primaryColor: preset.primaryColor, secondaryColor: preset.secondaryColor }))}
                        className={`w-8 h-8 rounded-full overflow-hidden ring-2 ring-offset-2 dark:ring-offset-slate-900 transition ${active ? 'ring-primary-500' : 'ring-transparent hover:ring-slate-300 dark:hover:ring-white/20'}`}
                      >
                        <span className="block w-full h-1/2" style={{ backgroundColor: preset.primaryColor }} />
                        <span className="block w-full h-1/2" style={{ backgroundColor: preset.secondaryColor }} />
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Header / Accent Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.primaryColor}
                        onChange={(e) => setForm((p) => ({ ...p, primaryColor: e.target.value }))}
                        className="w-10 h-9 rounded-md border border-slate-300 dark:border-white/10 cursor-pointer bg-transparent p-0.5"
                      />
                      <input
                        type="text"
                        value={form.primaryColor}
                        onChange={(e) => setForm((p) => ({ ...p, primaryColor: e.target.value }))}
                        className="input-field font-mono text-xs"
                        maxLength={7}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Footer Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.secondaryColor}
                        onChange={(e) => setForm((p) => ({ ...p, secondaryColor: e.target.value }))}
                        className="w-10 h-9 rounded-md border border-slate-300 dark:border-white/10 cursor-pointer bg-transparent p-0.5"
                      />
                      <input
                        type="text"
                        value={form.secondaryColor}
                        onChange={(e) => setForm((p) => ({ ...p, secondaryColor: e.target.value }))}
                        className="input-field font-mono text-xs"
                        maxLength={7}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-white/5">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider mb-3">Fields to Show</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {SHOW_FIELD_OPTIONS.map((opt) => (
                    <label key={opt.key} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 cursor-pointer">
                      <span className="text-xs text-slate-700 dark:text-slate-300">{opt.label}</span>
                      <input
                        type="checkbox"
                        checked={!!form.showFields[opt.key]}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, showFields: { ...p.showFields, [opt.key]: e.target.checked } }))
                        }
                        className="w-4 h-4 rounded-sm border-slate-300 dark:border-white/20 accent-primary-500 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="pt-2 border-t border-slate-100 dark:border-white/5">
              <div className="rounded-xl border border-dashed border-primary-300 dark:border-primary-700/50 bg-primary-50/50 dark:bg-primary-900/10 p-5 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  This template uses a fully custom drag-and-drop design.
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Card colors and field toggles are configured per-element inside the designer.
                </p>
                <Button
                  type="button"
                  variant="gradient"
                  onClick={() => navigate(editingId ? `/id-cards/designer?templateId=${editingId}` : '/id-cards/designer')}
                >
                  Open Designer
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/5">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Active Template</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Activating this template automatically deactivates any other {form.applicableTo.toLowerCase()} template — only one active {form.applicableTo.toLowerCase()} template is used at a time.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.isActive}
              onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${form.isActive ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-white/5">
            {editingId && (
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            )}
            <Button type="submit" variant="gradient" disabled={saving} isLoading={saving}>
              <Plus className="w-4 h-4" />
              {editingId ? 'Update ID Card' : 'Save ID Card'}
            </Button>
          </div>
        </form>

        {/* Live Preview */}
        <div className="xl:col-span-2 glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 p-6 flex flex-col items-center justify-center gap-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider self-start">Live Preview</p>
          <IdCardPreview template={previewTemplate} data={sampleData} />
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
            Preview uses sample data — actual cards use the real student/staff record.
          </p>
        </div>
      </div>

      {/* Existing templates */}
      <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/30 p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Existing Templates</h3>
        <DataTable
          data={templates}
          columns={columns}
          isLoading={loading}
          emptyTitle="No templates yet"
          emptyDescription="Create your first ID card template above."
          actions={[
            { label: 'Edit', icon: 'edit', onClick: handleEdit },
            { label: 'Delete', icon: 'delete', variant: 'danger', onClick: (row) => setTemplateToDelete(row) },
          ]}
        />
      </div>

      <ConfirmModal
        isOpen={!!templateToDelete}
        title="Delete ID Card Template"
        message={`Are you sure you want to delete "${templateToDelete?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setTemplateToDelete(null)}
      />
    </div>
  );
}
