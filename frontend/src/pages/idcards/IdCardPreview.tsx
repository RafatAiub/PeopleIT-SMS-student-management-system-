import React from 'react';
import { QrCode } from 'lucide-react';

// =============================================================================
// Shared ID Card types — mirror the backend response shapes documented in
// idcard.dto.ts / idcard.service.ts. Both the admin template builder and the
// student/staff "My ID Card" view import these so the two never drift.
// =============================================================================

export interface IdCardShowFields {
  admissionNo?: boolean;
  name?: boolean;
  class?: boolean;
  fatherName?: boolean;
  motherName?: boolean;
  address?: boolean;
  dob?: boolean;
  bloodGroup?: boolean;
  [key: string]: boolean | undefined;
}

// Advanced (drag-and-drop canvas) mode — an element list stored in mm,
// top-left origin, same coordinate space as widthMm/heightMm. Both this
// preview's advanced branch and the backend's pdfkit renderer
// (idcard.pdf.ts renderAdvancedCard) are dumb interpreters of the same
// numbers — neither one owns "the real" layout, the data does.
export type TextDataKey =
  | 'name'
  | 'admissionNo'
  | 'class'
  | 'fatherName'
  | 'motherName'
  | 'address'
  | 'dob'
  | 'bloodGroup'
  | 'cardNumber'
  | 'designation'
  | 'department';

export const TEXT_DATA_KEYS: TextDataKey[] = [
  'name',
  'admissionNo',
  'class',
  'fatherName',
  'motherName',
  'address',
  'dob',
  'bloodGroup',
  'cardNumber',
  'designation',
  'department',
];

export const TEXT_DATA_KEY_LABELS: Record<TextDataKey, string> = {
  name: 'Full Name',
  admissionNo: 'Admission / Employee No',
  class: 'Class / Section',
  fatherName: "Father's Name",
  motherName: "Mother's Name",
  address: 'Address',
  dob: 'Date of Birth',
  bloodGroup: 'Blood Group',
  cardNumber: 'Card Number',
  designation: 'Designation',
  department: 'Department',
};

interface CanvasElementBase {
  id: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  zIndex: number;
}

export interface TextCanvasElement extends CanvasElementBase {
  type: 'TEXT';
  dataKey: TextDataKey;
  fontSizePt: number;
  fontWeight: 'normal' | 'bold';
  color: string;
  align: 'left' | 'center' | 'right';
}

export interface PhotoCanvasElement extends CanvasElementBase {
  type: 'PHOTO';
  shape: 'CIRCLE' | 'SQUARE' | 'ROUNDED';
}

export interface SimpleImageCanvasElement extends CanvasElementBase {
  type: 'LOGO' | 'SIGNATURE' | 'QR';
}

export type CanvasElement = TextCanvasElement | PhotoCanvasElement | SimpleImageCanvasElement;

export interface IdCardTemplate {
  id: string;
  institutionId: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface IdCardPreviewData {
  name: string;
  /** Class/section for a student card, or designation/department for a staff card — used by SIMPLE mode's combined subtitle line. */
  subtitle?: string;
  cardNumber?: string;
  photoUrl?: string | null;
  admissionNo?: string;
  fatherName?: string | null;
  motherName?: string | null;
  address?: string | null;
  dob?: string | null;
  bloodGroup?: string | null;
  qrValue?: string;
  /** ADVANCED mode only — individual fields a TEXT element can bind to separately from the combined `subtitle`. */
  classText?: string | null;
  designation?: string | null;
  department?: string | null;
}

function resolveTextData(data: IdCardPreviewData, key: TextDataKey): string {
  switch (key) {
    case 'name':
      return data.name || '';
    case 'admissionNo':
      return data.admissionNo || '';
    case 'class':
      return data.classText || '';
    case 'fatherName':
      return data.fatherName || '';
    case 'motherName':
      return data.motherName || '';
    case 'address':
      return data.address || '';
    case 'dob':
      return data.dob || '';
    case 'bloodGroup':
      return data.bloodGroup || '';
    case 'cardNumber':
      return data.cardNumber || '';
    case 'designation':
      return data.designation || '';
    case 'department':
      return data.department || '';
    default:
      return '';
  }
}

// A card rendered at ~1mm : 3.4px keeps a typical 57x89mm vertical card at a
// comfortable on-screen size without needing the caller to do the math.
// Exported so the canvas designer uses the exact same scale — the designer
// canvas and every preview must agree pixel-for-pixel on what 1mm means.
export const MM_TO_PX = 3.4;

const photoRadiusClass: Record<IdCardTemplate['photoStyle'], string> = {
  CIRCLE: 'rounded-full',
  SQUARE: 'rounded-none',
  ROUNDED: 'rounded-xl',
};

/**
 * ADVANCED-mode render — absolutely-positions each canvas element as a
 * percentage of the card's own dimensions (not fixed px), so it scales
 * identically regardless of on-screen zoom while staying in exact
 * proportional agreement with the mm-based PDF renderer (idcard.pdf.ts
 * renderAdvancedCard uses the same xMm/yMm/widthMm/heightMm numbers).
 */
const AdvancedCardPreview: React.FC<{ template: IdCardTemplate; data: IdCardPreviewData }> = ({ template, data }) => {
  const elements = [...(template.canvasElements || [])].sort((a, b) => a.zIndex - b.zIndex);
  const pct = (mm: number, totalMm: number) => `${(mm / totalMm) * 100}%`;

  return (
    <>
      {elements.map((el) => {
        const style: React.CSSProperties = {
          position: 'absolute',
          left: pct(el.xMm, template.widthMm),
          top: pct(el.yMm, template.heightMm),
          width: pct(el.widthMm, template.widthMm),
          height: pct(el.heightMm, template.heightMm),
          transform: el.rotationDeg ? `rotate(${el.rotationDeg}deg)` : undefined,
          transformOrigin: 'center',
        };

        if (el.type === 'TEXT') {
          const value = resolveTextData(data, el.dataKey);
          if (!value) return null;
          return (
            <div
              key={el.id}
              style={{
                ...style,
                fontSize: `${el.fontSizePt * 1.1}px`,
                fontWeight: el.fontWeight === 'bold' ? 700 : 400,
                color: el.color,
                textAlign: el.align,
                overflow: 'hidden',
                lineHeight: 1.15,
              }}
            >
              {value}
            </div>
          );
        }

        if (el.type === 'PHOTO') {
          return (
            <div
              key={el.id}
              className={`overflow-hidden border-2 bg-slate-100 ${photoRadiusClass[el.shape]}`}
              style={{ ...style, borderColor: template.primaryColor }}
            >
              {data.photoUrl ? (
                <img src={data.photoUrl} alt={data.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-[8px]">Photo</div>
              )}
            </div>
          );
        }

        if (el.type === 'LOGO' && template.logoImage) {
          return (
            <img key={el.id} src={template.logoImage} alt="Logo" className="object-contain" style={style} />
          );
        }

        if (el.type === 'SIGNATURE' && template.signatureImage) {
          return (
            <img key={el.id} src={template.signatureImage} alt="Signature" className="object-contain" style={style} />
          );
        }

        if (el.type === 'QR') {
          return (
            <div
              key={el.id}
              className="border rounded flex items-center justify-center bg-white"
              style={{ ...style, borderColor: template.primaryColor }}
            >
              <QrCode className="w-3/4 h-3/4" style={{ color: template.primaryColor }} />
            </div>
          );
        }

        return null;
      })}
    </>
  );
};

/**
 * Presentational, read-only render of a single ID card. Used by both the
 * template builder's live preview (with sample data) and the student/staff
 * "My ID Card" page (with real data from GET /id-cards/me) so the two views
 * never visually diverge. Branches into SIMPLE (fixed regions) or ADVANCED
 * (free-form canvas) at the top based on template.layoutMode.
 */
export const IdCardPreview: React.FC<{ template: IdCardTemplate; data: IdCardPreviewData; className?: string }> = ({
  template,
  data,
  className,
}) => {
  const widthPx = Math.round(template.widthMm * MM_TO_PX);
  const heightPx = Math.round(template.heightMm * MM_TO_PX);
  const photoWidthPx = Math.round(template.photoWidthMm * MM_TO_PX);
  const photoHeightPx = Math.round(template.photoHeightMm * MM_TO_PX);
  const fields = template.showFields || {};
  const isHorizontal = template.layout === 'HORIZONTAL';

  if (template.layoutMode === 'ADVANCED') {
    return (
      <div
        className={`relative overflow-hidden rounded-xl border border-slate-300 dark:border-white/10 shadow-lg bg-white ${className ?? ''}`}
        style={{
          width: widthPx,
          height: heightPx,
          backgroundImage: template.backgroundImage ? `url(${template.backgroundImage})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <AdvancedCardPreview template={template} data={data} />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-300 dark:border-white/10 shadow-lg bg-white flex ${isHorizontal ? 'flex-row' : 'flex-col'} ${className ?? ''}`}
      style={{
        width: widthPx,
        height: heightPx,
        backgroundImage: template.backgroundImage ? `url(${template.backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Header bar — solid primaryColor, matches the PDF's header band */}
      <div
        className="px-2.5 py-2 flex items-center gap-2 flex-shrink-0"
        style={{ backgroundColor: template.primaryColor }}
      >
        {template.logoImage ? (
          <img src={template.logoImage} alt="Logo" className="w-6 h-6 rounded-full object-cover bg-white flex-shrink-0" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-white/20 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-white text-[9px] font-bold leading-tight truncate">{template.title || 'ID Card'}</p>
          <p className="text-white/80 text-[7px] leading-tight truncate">
            {template.applicableTo === 'STUDENT' ? 'Student Identity Card' : 'Staff Identity Card'}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center px-2.5 py-2.5 gap-1.5 min-h-0">
        <div
          className={`overflow-hidden border-2 bg-slate-100 flex-shrink-0 ${photoRadiusClass[template.photoStyle]}`}
          style={{ width: photoWidthPx, height: photoHeightPx, borderColor: template.primaryColor }}
        >
          {data.photoUrl ? (
            <img src={data.photoUrl} alt={data.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-[8px]">Photo</div>
          )}
        </div>

        <div className="text-center">
          {fields.name !== false && (
            <p className="text-[10px] font-bold text-slate-900 leading-tight">{data.name || 'Full Name'}</p>
          )}
          {fields.class !== false && data.subtitle && (
            <p className="text-[8px] text-slate-600 leading-tight mt-0.5">{data.subtitle}</p>
          )}
        </div>

        <div className="w-full text-[7px] text-slate-700 space-y-0.5 mt-0.5">
          {fields.admissionNo !== false && data.admissionNo && (
            <div className="flex justify-between gap-1">
              <span className="font-semibold text-slate-500">ID No:</span>
              <span className="truncate">{data.admissionNo}</span>
            </div>
          )}
          {fields.fatherName !== false && data.fatherName && (
            <div className="flex justify-between gap-1">
              <span className="font-semibold text-slate-500">Father:</span>
              <span className="truncate">{data.fatherName}</span>
            </div>
          )}
          {fields.motherName !== false && data.motherName && (
            <div className="flex justify-between gap-1">
              <span className="font-semibold text-slate-500">Mother:</span>
              <span className="truncate">{data.motherName}</span>
            </div>
          )}
          {fields.dob !== false && data.dob && (
            <div className="flex justify-between gap-1">
              <span className="font-semibold text-slate-500">DOB:</span>
              <span className="truncate">{data.dob}</span>
            </div>
          )}
          {fields.bloodGroup !== false && data.bloodGroup && (
            <div className="flex justify-between gap-1">
              <span className="font-semibold text-slate-500">Blood:</span>
              <span className="truncate">{data.bloodGroup}</span>
            </div>
          )}
        </div>

        {data.cardNumber && (
          <div className="mt-auto flex items-center gap-1.5 pt-1">
            <div
              className="w-6 h-6 border rounded flex items-center justify-center bg-white flex-shrink-0"
              style={{ borderColor: template.primaryColor }}
            >
              <QrCode className="w-4 h-4" style={{ color: template.primaryColor }} />
            </div>
            <span className="text-[6.5px] font-mono text-slate-500 truncate">{data.cardNumber}</span>
          </div>
        )}
      </div>

      {/* Footer / address bar — solid secondaryColor, matches the PDF's footer band */}
      {fields.address !== false && data.address && (
        <div className="px-2 py-1 flex-shrink-0" style={{ backgroundColor: template.secondaryColor }}>
          <p className="text-white text-[6.5px] text-center leading-tight truncate">{data.address}</p>
        </div>
      )}

      {template.signatureImage && (
        <div className="absolute bottom-1 right-1.5 opacity-90">
          <img src={template.signatureImage} alt="Signature" className="h-4 object-contain" />
        </div>
      )}
    </div>
  );
};

export default IdCardPreview;
