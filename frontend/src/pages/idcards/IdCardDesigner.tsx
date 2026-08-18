import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutTemplate, Type, User, ImageIcon, PenTool, QrCode, Trash2, Image as ImageIcon2, X, ChevronUp, ChevronDown, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { Button } from '../../components/ui/Button';
import {
  IdCardPreview,
  IdCardTemplate,
  IdCardPreviewData,
  CanvasElement,
  TextCanvasElement,
  PhotoCanvasElement,
  SimpleImageCanvasElement,
  TextDataKey,
  TEXT_DATA_KEYS,
  TEXT_DATA_KEY_LABELS,
  TEXT_DATA_KEY_DEFAULT_PRINT_LABELS,
  MM_TO_PX,
} from './IdCardPreview';
import { SAMPLE_STUDENT_DATA, SAMPLE_STAFF_DATA } from './IdCardTemplateBuilder';

// =============================================================================
// Canva-style free-form canvas designer for ADVANCED-mode ID card templates.
// All coordinates are stored in mm (top-left origin), the same coordinate
// space the backend PDF renderer (idcard.pdf.ts renderAdvancedCard) and the
// read-only IdCardPreview component's ADVANCED branch already interpret —
// this page is the only one that lets an admin *write* that shape.
// =============================================================================

interface DesignerFormState {
  title: string;
  applicableTo: 'STUDENT' | 'STAFF';
  widthMm: number;
  heightMm: number;
  backgroundImage: string | null;
  logoImage: string | null;
  signatureImage: string | null;
  primaryColor: string;
  secondaryColor: string;
  isActive: boolean;
}

const DEFAULT_FORM: DesignerFormState = {
  title: '',
  applicableTo: 'STUDENT',
  widthMm: 57,
  heightMm: 89,
  backgroundImage: null,
  logoImage: null,
  signatureImage: null,
  primaryColor: '#7c3aed',
  secondaryColor: '#0f172a',
  isActive: true,
};

const MIN_ELEMENT_MM = 4;

// Same canvas-compress-to-base64 pattern used in IdCardTemplateBuilder.tsx —
// duplicated locally since it isn't exported from that file.
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
        <div className="w-12 h-12 rounded-lg border border-dashed border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center overflow-hidden flex-shrink-0">
          {value ? (
            <img src={value} alt={label} className="w-full h-full object-cover" />
          ) : (
            <ImageIcon2 className="w-4 h-4 text-slate-400" />
          )}
        </div>
        <label className="btn-secondary text-xs px-3 py-1.5 cursor-pointer">
          {value ? 'Change' : 'Upload'}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-slate-400 hover:text-red-500 p-1" title="Remove image">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-8 rounded-md border border-slate-300 dark:border-white/10 cursor-pointer bg-transparent p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-field font-mono text-xs"
          maxLength={7}
        />
      </div>
    </div>
  );
}

type DragMode = { kind: 'move' | 'resize'; elementId: string; startX: number; startY: number; startEl: CanvasElement };

export default function IdCardDesigner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get('templateId');

  const [form, setForm] = useState<DesignerFormState>(DEFAULT_FORM);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!templateId);
  const [saving, setSaving] = useState(false);
  const [addDataKey, setAddDataKey] = useState<TextDataKey>('name');

  const dragRef = useRef<DragMode | null>(null);

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiClient.get('/id-cards/templates');
        const list: IdCardTemplate[] = res.data.data || [];
        const template = list.find((t) => t.id === templateId);
        if (!template) {
          toast.error('Template not found');
          return;
        }
        if (cancelled) return;
        setForm({
          title: template.title,
          applicableTo: template.applicableTo,
          widthMm: template.widthMm,
          heightMm: template.heightMm,
          backgroundImage: template.backgroundImage,
          logoImage: template.logoImage,
          signatureImage: template.signatureImage,
          primaryColor: template.primaryColor || '#7c3aed',
          secondaryColor: template.secondaryColor || '#0f172a',
          isActive: template.isActive,
        });
        setElements(template.canvasElements || []);
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'Failed to load template');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const selectedElement = useMemo(() => elements.find((el) => el.id === selectedId) || null, [elements, selectedId]);

  const nextZIndex = () => (elements.length ? Math.max(...elements.map((el) => el.zIndex)) + 1 : 1);

  const clampBox = (xMm: number, yMm: number, widthMm: number, heightMm: number) => {
    const w = Math.min(Math.max(widthMm, MIN_ELEMENT_MM), form.widthMm);
    const h = Math.min(Math.max(heightMm, MIN_ELEMENT_MM), form.heightMm);
    const x = Math.min(Math.max(xMm, 0), form.widthMm - w);
    const y = Math.min(Math.max(yMm, 0), form.heightMm - h);
    return { xMm: x, yMm: y, widthMm: w, heightMm: h };
  };

  // Every newly-added element is stacked just below whatever's already on
  // the card, instead of always landing at the same fixed spot — that's
  // what made every new text field pile up directly on top of the last one.
  // Nothing here is a "smart layout" — it's just "don't start on top of
  // something else" so a fresh element is always immediately visible and
  // selectable.
  const nextStackY = (heightMm: number) => {
    const maxBottom = elements.length ? Math.max(...elements.map((el) => el.yMm + el.heightMm)) : 0;
    const y = elements.length ? maxBottom + 2 : 6;
    return Math.min(y, Math.max(form.heightMm - heightMm, 0));
  };

  const addTextElement = () => {
    const heightMm = 6;
    const widthMm = Math.min(form.widthMm - 8, 48);
    const box = clampBox(4, nextStackY(heightMm), widthMm, heightMm);
    const el: TextCanvasElement = {
      id: crypto.randomUUID(),
      type: 'TEXT',
      ...box,
      rotationDeg: 0,
      zIndex: nextZIndex(),
      dataKey: addDataKey,
      label: TEXT_DATA_KEY_DEFAULT_PRINT_LABELS[addDataKey],
      fontSizePt: 8,
      fontWeight: 'normal',
      color: '#0f172a',
      align: 'left',
    };
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };

  const addSingletonElement = (type: 'PHOTO' | 'LOGO' | 'SIGNATURE' | 'QR') => {
    if (elements.some((el) => el.type === type)) return;
    const size = type === 'PHOTO' ? 21 : 15;
    const x = type === 'PHOTO' ? (form.widthMm - size) / 2 : 4;
    const box = clampBox(x, nextStackY(size), size, size);
    const base = { id: crypto.randomUUID(), ...box, rotationDeg: 0, zIndex: nextZIndex() };
    const el: CanvasElement =
      type === 'PHOTO'
        ? ({ ...base, type: 'PHOTO', shape: 'CIRCLE' } as PhotoCanvasElement)
        : ({ ...base, type } as SimpleImageCanvasElement);
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };

  const updateElement = (id: string, patch: Partial<CanvasElement>) => {
    setElements((prev) => prev.map((el) => (el.id === id ? ({ ...el, ...patch } as CanvasElement) : el)));
  };

  const deleteElement = (id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // Swaps zIndex with the neighbouring element in stacking order — 'up'
  // brings the element forward (higher on top), 'down' sends it backward.
  // This is what makes the Layers panel's reorder arrows meaningful, and is
  // the only reliable way to pick a specific element out of a pile that's
  // still fully overlapping on the canvas.
  const reorderElement = (id: string, direction: 'up' | 'down') => {
    setElements((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((el) => el.id === id);
      const swapIdx = direction === 'up' ? idx + 1 : idx - 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const a = sorted[idx];
      const b = sorted[swapIdx];
      return prev.map((el) => {
        if (el.id === a.id) return { ...el, zIndex: b.zIndex };
        if (el.id === b.id) return { ...el, zIndex: a.zIndex };
        return el;
      });
    });
  };

  // ---- drag / resize -------------------------------------------------------

  const handlePointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaXPx = e.clientX - drag.startX;
    const deltaYPx = e.clientY - drag.startY;
    const deltaXMm = deltaXPx / MM_TO_PX;
    const deltaYMm = deltaYPx / MM_TO_PX;

    if (drag.kind === 'move') {
      const box = clampBox(drag.startEl.xMm + deltaXMm, drag.startEl.yMm + deltaYMm, drag.startEl.widthMm, drag.startEl.heightMm);
      updateElement(drag.elementId, { xMm: box.xMm, yMm: box.yMm });
    } else {
      const box = clampBox(drag.startEl.xMm, drag.startEl.yMm, drag.startEl.widthMm + deltaXMm, drag.startEl.heightMm + deltaYMm);
      updateElement(drag.elementId, { widthMm: box.widthMm, heightMm: box.heightMm });
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };

  const startDrag = (kind: 'move' | 'resize', el: CanvasElement, e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedId(el.id);
    dragRef.current = { kind, elementId: el.id, startX: e.clientX, startY: e.clientY, startEl: el };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // ---- save ------------------------------------------------------------

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        applicableTo: form.applicableTo,
        layout: 'VERTICAL' as const,
        widthMm: form.widthMm,
        heightMm: form.heightMm,
        backgroundImage: form.backgroundImage,
        logoImage: form.logoImage,
        signatureImage: form.signatureImage,
        photoStyle: 'CIRCLE' as const,
        photoWidthMm: 21,
        photoHeightMm: 21,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        showFields: {},
        layoutMode: 'ADVANCED' as const,
        canvasElements: elements,
        isActive: form.isActive,
      };
      if (templateId) {
        await apiClient.put(`/id-cards/templates/${templateId}`, payload);
        toast.success('Template updated');
      } else {
        await apiClient.post('/id-cards/templates', payload);
        toast.success('Template created');
      }
      navigate('/id-cards/builder');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const previewTemplate: IdCardTemplate = {
    id: templateId || 'preview',
    institutionId: '',
    title: form.title,
    applicableTo: form.applicableTo,
    layout: 'VERTICAL',
    widthMm: form.widthMm,
    heightMm: form.heightMm,
    backgroundImage: form.backgroundImage,
    logoImage: form.logoImage,
    signatureImage: form.signatureImage,
    photoStyle: 'CIRCLE',
    photoWidthMm: 21,
    photoHeightMm: 21,
    primaryColor: form.primaryColor,
    secondaryColor: form.secondaryColor,
    showFields: {},
    layoutMode: 'ADVANCED',
    canvasElements: elements,
    isActive: form.isActive,
    createdAt: '',
    updatedAt: '',
  };

  const sampleData: IdCardPreviewData = form.applicableTo === 'STUDENT' ? SAMPLE_STUDENT_DATA : SAMPLE_STAFF_DATA;

  const widthPx = Math.round(form.widthMm * MM_TO_PX);
  const heightPx = Math.round(form.heightMm * MM_TO_PX);

  const hasPhoto = elements.some((el) => el.type === 'PHOTO');
  const hasLogo = elements.some((el) => el.type === 'LOGO');
  const hasSignature = elements.some((el) => el.type === 'SIGNATURE');
  const hasQr = elements.some((el) => el.type === 'QR');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500 dark:text-slate-400 text-sm">
        Loading template...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <LayoutTemplate className="w-6 h-6 text-primary-500" />
            Advanced ID Card Designer
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Drag, resize and bind data fields to build a fully custom card layout.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => navigate('/id-cards/builder')}>
            Cancel
          </Button>
          <Button type="button" variant="gradient" onClick={handleSave} disabled={saving} isLoading={saving}>
            Save Template
          </Button>
        </div>
      </div>

      {/* Template-level fields */}
      <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/30 p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Template Details</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="col-span-2 space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Custom Student ID Card"
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
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Active</p>
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

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Width (mm)</label>
            <input
              type="number"
              min={20}
              max={200}
              value={form.widthMm}
              onChange={(e) => setForm((p) => ({ ...p, widthMm: Number(e.target.value) }))}
              className="input-field"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Height (mm)</label>
            <input
              type="number"
              min={20}
              max={200}
              value={form.heightMm}
              onChange={(e) => setForm((p) => ({ ...p, heightMm: Number(e.target.value) }))}
              className="input-field"
            />
          </div>
          <ColorField label="Header / Accent Color" value={form.primaryColor} onChange={(v) => setForm((p) => ({ ...p, primaryColor: v }))} />
          <ColorField label="Footer Color" value={form.secondaryColor} onChange={(v) => setForm((p) => ({ ...p, secondaryColor: v }))} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-white/5">
          <ImagePicker label="Background Image" value={form.backgroundImage} onChange={(v) => setForm((p) => ({ ...p, backgroundImage: v }))} />
          <ImagePicker label="Logo Image" value={form.logoImage} onChange={(v) => setForm((p) => ({ ...p, logoImage: v }))} />
          <ImagePicker label="Signature Image" value={form.signatureImage} onChange={(v) => setForm((p) => ({ ...p, signatureImage: v }))} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Canvas + toolbar */}
        <div className="xl:col-span-3 glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/30 p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={addDataKey}
              onChange={(e) => setAddDataKey(e.target.value as TextDataKey)}
              className="input-field text-xs py-1.5 w-auto"
            >
              {TEXT_DATA_KEYS.map((key) => (
                <option key={key} value={key}>
                  {TEXT_DATA_KEY_LABELS[key]}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" variant="secondary" onClick={addTextElement}>
              <Type className="w-3.5 h-3.5" />
              Add Text Field
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={hasPhoto} onClick={() => addSingletonElement('PHOTO')}>
              <User className="w-3.5 h-3.5" />
              Add Photo
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={hasLogo} onClick={() => addSingletonElement('LOGO')}>
              <ImageIcon className="w-3.5 h-3.5" />
              Add Logo
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={hasSignature} onClick={() => addSingletonElement('SIGNATURE')}>
              <PenTool className="w-3.5 h-3.5" />
              Add Signature
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={hasQr} onClick={() => addSingletonElement('QR')}>
              <QrCode className="w-3.5 h-3.5" />
              Add QR Code
            </Button>
          </div>

          <div className="flex justify-center py-4 bg-slate-100 dark:bg-slate-950/50 rounded-xl overflow-auto">
            <div
              onPointerDown={() => setSelectedId(null)}
              className="relative border border-slate-300 dark:border-white/10 shadow-lg bg-white flex-shrink-0"
              style={{
                width: widthPx,
                height: heightPx,
                backgroundImage: form.backgroundImage ? `url(${form.backgroundImage})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {[...elements]
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((el) => {
                  const isSelected = el.id === selectedId;
                  const style: React.CSSProperties = {
                    position: 'absolute',
                    left: Math.round(el.xMm * MM_TO_PX),
                    top: Math.round(el.yMm * MM_TO_PX),
                    width: Math.round(el.widthMm * MM_TO_PX),
                    height: Math.round(el.heightMm * MM_TO_PX),
                    zIndex: el.zIndex,
                    transform: el.rotationDeg ? `rotate(${el.rotationDeg}deg)` : undefined,
                    outline: isSelected ? '2px solid #7c3aed' : '1px dashed rgba(100,116,139,0.5)',
                    cursor: 'move',
                    boxSizing: 'border-box',
                  };
                  return (
                    <div key={el.id} style={style} onPointerDown={(e) => startDrag('move', el, e)}>
                      <ElementLabel el={el} />
                      {isSelected && (
                        <div
                          onPointerDown={(e) => startDrag('resize', el, e)}
                          style={{
                            position: 'absolute',
                            right: -4,
                            bottom: -4,
                            width: 10,
                            height: 10,
                            background: '#7c3aed',
                            borderRadius: 2,
                            cursor: 'nwse-resize',
                          }}
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
            Drag an element to reposition it, drag its bottom-right handle to resize. Click empty space to deselect.
          </p>
        </div>

        {/* Inspector */}
        <div className="xl:col-span-2 glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/30 p-6 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-primary-500" />
              Layers
            </h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Click a row to select it — the easiest way to pick an element that's covered by another one.
            </p>
          </div>
          <LayersPanel
            elements={elements}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={reorderElement}
          />

          <div className="pt-4 border-t border-slate-100 dark:border-white/5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Element Inspector</h3>
            {!selectedElement ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click an element (on the canvas or in Layers above) to edit it, or drag it to reposition.
              </p>
            ) : (
              <ElementInspector
                element={selectedElement}
                cardWidthMm={form.widthMm}
                cardHeightMm={form.heightMm}
                onChange={(patch) => updateElement(selectedElement.id, patch)}
                onDelete={() => deleteElement(selectedElement.id)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 p-6 flex flex-col items-center gap-4">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider self-start">
          True Preview (print-accurate)
        </p>
        <IdCardPreview template={previewTemplate} data={sampleData} />
      </div>
    </div>
  );
}

// Shared by the on-canvas overlay and the Layers panel so an element reads
// the same everywhere — prefers a TEXT element's own printed label (what the
// admin actually typed, e.g. "D.O.B") over the generic data-field name, so
// two text fields bound to the same key are still distinguishable at a
// glance once they've been given different labels.
function elementDisplayName(el: CanvasElement): string {
  if (el.type === 'TEXT') return el.label?.trim() || TEXT_DATA_KEY_LABELS[el.dataKey];
  if (el.type === 'PHOTO') return 'Photo';
  if (el.type === 'LOGO') return 'Logo';
  if (el.type === 'SIGNATURE') return 'Signature';
  return 'QR Code';
}

function ElementLabel({ el }: { el: CanvasElement }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-primary-50/60 dark:bg-primary-500/10 overflow-hidden">
      <span className="text-[9px] text-primary-700 dark:text-primary-300 font-medium px-1 truncate select-none pointer-events-none">
        {elementDisplayName(el)}
      </span>
    </div>
  );
}

function LayersPanel({
  elements,
  selectedId,
  onSelect,
  onReorder,
}: {
  elements: CanvasElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
}) {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex); // top-most first

  if (sorted.length === 0) {
    return <p className="text-xs text-slate-400 dark:text-slate-500 italic">No elements yet — add one from the toolbar above the canvas.</p>;
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
      {sorted.map((el, i) => {
        const isSelected = el.id === selectedId;
        return (
          <div
            key={el.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(el.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(el.id)}
            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition ${
              isSelected
                ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 ring-1 ring-primary-500/40'
                : 'bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900/70'
            }`}
          >
            <span className="truncate flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 flex-shrink-0">{el.type}</span>
              {elementDisplayName(el)}
            </span>
            <span className="flex items-center gap-0.5 flex-shrink-0">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReorder(el.id, 'up'); }}
                disabled={i === 0}
                title="Bring forward"
                className="p-0.5 rounded hover:text-primary-500 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReorder(el.id, 'down'); }}
                disabled={i === sorted.length - 1}
                title="Send backward"
                className="p-0.5 rounded hover:text-primary-500 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ElementInspector({
  element,
  cardWidthMm,
  cardHeightMm,
  onChange,
  onDelete,
}: {
  element: CanvasElement;
  cardWidthMm: number;
  cardHeightMm: number;
  onChange: (patch: Partial<CanvasElement>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="X (mm)" value={element.xMm} min={0} max={cardWidthMm} onChange={(v) => onChange({ xMm: v })} />
        <NumberField label="Y (mm)" value={element.yMm} min={0} max={cardHeightMm} onChange={(v) => onChange({ yMm: v })} />
        <NumberField label="Width (mm)" value={element.widthMm} min={MIN_ELEMENT_MM} max={cardWidthMm} onChange={(v) => onChange({ widthMm: v })} />
        <NumberField label="Height (mm)" value={element.heightMm} min={MIN_ELEMENT_MM} max={cardHeightMm} onChange={(v) => onChange({ heightMm: v })} />
        <NumberField label="Rotation (deg)" value={element.rotationDeg} min={-180} max={180} onChange={(v) => onChange({ rotationDeg: v })} />
        <NumberField label="Z-Index" value={element.zIndex} min={0} max={999} onChange={(v) => onChange({ zIndex: v })} />
      </div>

      {element.type === 'TEXT' && (
        <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-white/5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Data Field</label>
            <select
              value={element.dataKey}
              onChange={(e) => {
                const newKey = e.target.value as TextDataKey;
                // Only auto-sync the printed label if it still matches the
                // old field's default — once an admin has customized it,
                // switching the bound data shouldn't silently overwrite it.
                const hasCustomLabel = element.label && element.label !== TEXT_DATA_KEY_DEFAULT_PRINT_LABELS[element.dataKey];
                onChange({
                  dataKey: newKey,
                  ...(hasCustomLabel ? {} : { label: TEXT_DATA_KEY_DEFAULT_PRINT_LABELS[newKey] }),
                });
              }}
              className="input-field"
            >
              {TEXT_DATA_KEYS.map((key) => (
                <option key={key} value={key}>
                  {TEXT_DATA_KEY_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
              Printed Label <span className="normal-case text-slate-400 font-normal">(optional — e.g. "D.O.B")</span>
            </label>
            <input
              type="text"
              value={element.label || ''}
              onChange={(e) => onChange({ label: e.target.value || null })}
              placeholder="Leave blank to print just the value"
              className="input-field"
              maxLength={40}
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {element.label ? `Prints as "${element.label} : value"` : 'Prints as just the value, no label.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Font Size (pt)" value={element.fontSizePt} min={4} max={72} onChange={(v) => onChange({ fontSizePt: v })} />
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Align</label>
              <select
                value={element.align}
                onChange={(e) => onChange({ align: e.target.value as 'left' | 'center' | 'right' })}
                className="input-field"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={element.fontWeight === 'bold'}
              onChange={(e) => onChange({ fontWeight: e.target.checked ? 'bold' : 'normal' })}
              className="w-4 h-4 rounded-sm border-slate-300 dark:border-white/20 accent-primary-500 cursor-pointer"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300">Bold</span>
          </label>
          <ColorField label="Text Color" value={element.color} onChange={(v) => onChange({ color: v })} />
        </div>
      )}

      {element.type === 'PHOTO' && (
        <div className="space-y-1.5 pt-3 border-t border-slate-100 dark:border-white/5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Shape</label>
          <select
            value={element.shape}
            onChange={(e) => onChange({ shape: e.target.value as 'CIRCLE' | 'SQUARE' | 'ROUNDED' })}
            className="input-field"
          >
            <option value="CIRCLE">Circle</option>
            <option value="SQUARE">Square</option>
            <option value="ROUNDED">Rounded</option>
          </select>
        </div>
      )}

      <div className="pt-3 border-t border-slate-100 dark:border-white/5">
        <Button type="button" variant="danger" size="sm" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
          Delete Element
        </Button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">{label}</label>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input-field"
      />
    </div>
  );
}
