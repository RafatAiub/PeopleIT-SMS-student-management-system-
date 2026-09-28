import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { translate } from '@/i18n';
import type { MediaKind, PuckData, SitePageSummary } from './sites.types';

// ── Roles ────────────────────────────────────────────────────────────────────

/** Admins manage the whole site; teachers may only create and edit blog posts. */
export function useSiteRole() {
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const canPost = canManage || role === 'TEACHER';
  return { role, canManage, canPost };
}

// ── Slugs / hostnames ────────────────────────────────────────────────────────

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Mirrors the backend's hostname check closely enough for inline feedback. */
export function validateHostname(raw: string, platformDomain?: string | null): string | null {
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (!host) return translate('Enter a domain name.');
  if (host.length > 253) return translate('That domain name is too long.');
  const labels = host.split('.');
  if (labels.length < 2) return translate('Enter a full domain, for example www.myschool.edu.bd');
  const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  if (!labels.every((l) => label.test(l))) return translate('Use only letters, numbers, hyphens and dots.');
  if (/^\d+$/.test(labels[labels.length - 1])) return translate('An IP address cannot be used as a domain.');
  if (platformDomain && (host === platformDomain || host.endsWith(`.${platformDomain}`)))
    return translate('This is a platform address. Your free subdomain is already included.');
  return null;
}

export function normaliseHostname(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

// ── Colour contrast (WCAG 2.x) ───────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a: string, b: string): number | null {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return null;
  const la = luminance(ra);
  const lb = luminance(rb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const isHexColor = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

// ── Clipboard ────────────────────────────────────────────────────────────────

export async function copyText(value: string, what = translate('Copied')) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(what);
  } catch {
    toast.error(translate('Could not copy — select the text and copy it manually.'));
  }
}

// ── Media upload (browser → Cloudinary, unsigned preset) ─────────────────────

export function isMediaUploadConfigured(): boolean {
  return Boolean(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME && import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
}

export interface UploadedMedia {
  url: string;
  kind: MediaKind;
  size?: number;
  width?: number;
  height?: number;
}

/** Same unsigned-preset flow as utils/cloudinaryUpload.ts, but keeps the size/dimension metadata. */
export function uploadMediaFile(file: File, onProgress?: (percent: number) => void): Promise<UploadedMedia> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !preset) return Promise.reject(new Error(translate('Media uploads are not configured.')));

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', preset);
    form.append('folder', 'sites');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) {
          const rt = body.resource_type as string | undefined;
          resolve({
            url: body.secure_url,
            kind: rt === 'image' ? 'IMAGE' : rt === 'video' ? 'VIDEO' : 'FILE',
            size: typeof body.bytes === 'number' ? body.bytes : file.size,
            width: typeof body.width === 'number' ? body.width : undefined,
            height: typeof body.height === 'number' ? body.height : undefined,
          });
        } else reject(new Error(body.error?.message || translate('Upload failed')));
      } catch {
        reject(new Error(translate('Upload failed — unexpected response from storage provider')));
      }
    };
    xhr.onerror = () => reject(new Error(translate('Upload failed — network error')));
    xhr.send(form);
  });
}

export function guessKind(file: File): MediaKind {
  if (file.type.startsWith('image/')) return 'IMAGE';
  if (file.type.startsWith('video/')) return 'VIDEO';
  return 'FILE';
}

export function formatBytes(n?: number | null): string {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Pages ────────────────────────────────────────────────────────────────────

export const EMPTY_PAGE: PuckData = { root: { props: {} }, content: [] };

export function pagePath(slug: string): string {
  return slug ? `/${slug}` : '/';
}

/** A page has unpublished changes when it was edited after its last publish. */
export function pageState(p: SitePageSummary): 'draft' | 'changed' | 'live' {
  if (!p.publishedAt) return 'draft';
  return new Date(p.updatedAt).getTime() - new Date(p.publishedAt).getTime() > 2000 ? 'changed' : 'live';
}

/** Adds a path to a base URL that may carry a query (e.g. `/s/school?preview=…`). */
export function joinUrl(base: string, path: string): string {
  const [b, q] = base.split('?');
  const p = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `${b.replace(/\/$/, '')}${p}${q ? `?${q}` : ''}` || '/';
}
