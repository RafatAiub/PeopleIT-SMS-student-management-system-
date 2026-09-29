/**
 * Browser-only asset upload for the ZIP/HTML import (Track D). Reuses the
 * same Cloudinary unsigned-upload helper as `media/MediaUploadModal.tsx`
 * (`uploadMediaFile` in `../siteUtils`) so imported images/fonts/video/PDFs
 * land in the media library exactly like a manual upload would.
 *
 * Not covered by the Node test suite (it needs `crypto.subtle`, `Blob`,
 * `File`) — the pure decisions it depends on (which paths are assets, the
 * 1 MB inline threshold) are plain constants below; the ZIP/HTML parsing
 * itself is fully tested in `__tests__/zip-import.test.ts`.
 */
import { isMediaUploadConfigured, uploadMediaFile } from '../siteUtils';
import type { MediaKind } from '../sites.types';

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|ogv)$/i;
const UPLOADABLE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|ogv|pdf)$/i;

/** Images/fonts/video/PDFs only (WEBSITE_V3_PLAN.md §3 Track D point 5) — anything else (e.g. a stray `.json`) is left as a broken reference with a warning rather than uploaded. */
export function isUploadableAssetPath(path: string): boolean {
  return UPLOADABLE_EXT_RE.test(path);
}

function extToMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
    mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', pdf: 'application/pdf',
  };
  return map[ext] ?? 'application/octet-stream';
}

function pathKind(path: string): MediaKind {
  if (IMAGE_EXT_RE.test(path)) return 'IMAGE';
  if (VIDEO_EXT_RE.test(path)) return 'VIDEO';
  return 'FILE';
}

/** `fflate`/zip-derived `Uint8Array`s aren't always typed against a plain `ArrayBuffer` — normalise with a copy so `crypto.subtle`/`Blob` accept them. */
function toArrayBufferView(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(data);
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBufferView(data));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToDataUri(data: Uint8Array, mime: string): string {
  let binary = '';
  for (let i = 0; i < data.length; i += 1) binary += String.fromCharCode(data[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Below this size, an image is inlined as a data: URI when Cloudinary isn't configured. */
export const INLINE_MAX_BYTES = 150 * 1024;
const CONCURRENCY = 4;

export interface AssetUploadTask {
  path: string;
  data: Uint8Array;
}

export interface AssetUploadOutcome {
  path: string;
  url?: string;
  kind: MediaKind;
  inlined: boolean;
  skipped?: boolean;
  warning?: string;
}

export interface UploadAssetsOptions {
  onProgress?: (done: number, total: number) => void;
  /** Registers the uploaded file in the media library (skipped for inlined data: URIs). */
  registerMedia: (payload: { url: string; kind: MediaKind; name: string; alt: string; size?: number; width?: number; height?: number }) => Promise<unknown>;
}

/**
 * Uploads every asset with a concurrency of 4, deduplicating identical files
 * by SHA-256 content hash (a logo referenced from ten pages is uploaded
 * once). When Cloudinary isn't configured, small images (<150 KB) are
 * inlined as data: URIs and everything else is skipped with a warning.
 */
export async function uploadAssets(tasks: AssetUploadTask[], opts: UploadAssetsOptions): Promise<AssetUploadOutcome[]> {
  const configured = isMediaUploadConfigured();
  const byHash = new Map<string, AssetUploadOutcome>();
  const results: AssetUploadOutcome[] = new Array(tasks.length);
  let done = 0;
  let cursor = 0;

  async function runOne(task: AssetUploadTask): Promise<AssetUploadOutcome> {
    const hash = await sha256Hex(task.data);
    const cached = byHash.get(hash);
    if (cached) return { ...cached, path: task.path };

    const mime = extToMime(task.path);
    const filename = task.path.split('/').pop() || task.path;
    let outcome: AssetUploadOutcome;

    if (configured) {
      const file = new File([toArrayBufferView(task.data)], filename, { type: mime });
      const uploaded = await uploadMediaFile(file);
      await opts.registerMedia({ url: uploaded.url, kind: uploaded.kind, name: filename, alt: filename, size: uploaded.size, width: uploaded.width, height: uploaded.height });
      outcome = { path: task.path, url: uploaded.url, kind: uploaded.kind, inlined: false };
    } else if (IMAGE_EXT_RE.test(task.path) && task.data.byteLength < INLINE_MAX_BYTES) {
      outcome = { path: task.path, url: bytesToDataUri(task.data, mime), kind: 'IMAGE', inlined: true };
    } else {
      outcome = { path: task.path, kind: pathKind(task.path), inlined: false, skipped: true, warning: `Not uploaded — Cloudinary isn't configured and this file is too large to inline: ${task.path}` };
    }
    byHash.set(hash, outcome);
    return outcome;
  }

  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor;
      cursor += 1;
      try {
        results[idx] = await runOne(tasks[idx]);
      } catch {
        results[idx] = { path: tasks[idx].path, kind: pathKind(tasks[idx].path), inlined: false, skipped: true, warning: `Upload failed: ${tasks[idx].path}` };
      }
      done += 1;
      opts.onProgress?.(done, tasks.length);
    }
  }

  const workerCount = Math.max(1, Math.min(CONCURRENCY, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
