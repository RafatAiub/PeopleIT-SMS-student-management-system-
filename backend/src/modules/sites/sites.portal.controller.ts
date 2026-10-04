import { Request } from 'express';
import { successResponse } from '../../utils/response';
import * as portal from './sites.portal.service';
import * as publicPortal from './sites.portal.public.service';
import { cache, ctxOf, paged, previewOf, q, wrap } from './sites.controller';

// =============================================================================
// Sites portal controllers — thin: parse the request, call the service,
// respond. Admin routes reuse ctxOf/wrap/paged from sites.controller.ts;
// public routes reuse the same preview/cache conventions.
// =============================================================================

// ── Admin: profile ───────────────────────────────────────────────────────────

export const getProfile = wrap(async (req, res) => successResponse(res, await portal.getProfile(ctxOf(req))));
export const updateProfile = wrap(async (req, res) => successResponse(res, await portal.updateProfile(ctxOf(req), req.body), 'Profile saved'));
export const getCompliance = wrap(async (req, res) => successResponse(res, await portal.getCompliance(ctxOf(req))));

// ── Admin: staff visibility ──────────────────────────────────────────────────

export const listStaffVisibility = wrap(async (req, res) => paged(res, await portal.listStaffVisibility(ctxOf(req), q(req)), req));
export const setStaffVisibility = wrap(async (req, res) =>
  successResponse(res, await portal.setStaffVisibility(ctxOf(req), req.body), 'Visibility updated'),
);

// ── Admin: committee ─────────────────────────────────────────────────────────

export const listCommittee = wrap(async (req, res) => paged(res, await portal.listCommittee(ctxOf(req), q(req)), req));
export const createCommitteeMember = wrap(async (req, res) =>
  successResponse(res, await portal.createCommitteeMember(ctxOf(req), req.body), 'Committee member added', 201),
);
export const updateCommitteeMember = wrap(async (req, res) =>
  successResponse(res, await portal.updateCommitteeMember(ctxOf(req), req.params.id, req.body), 'Committee member saved'),
);
export const deleteCommitteeMember = wrap(async (req, res) =>
  successResponse(res, await portal.deleteCommitteeMember(ctxOf(req), req.params.id), 'Committee member removed'),
);

// ── Admin: albums ─────────────────────────────────────────────────────────────

export const listAlbums = wrap(async (req, res) => paged(res, await portal.listAlbums(ctxOf(req), q(req)), req));
export const getAlbum = wrap(async (req, res) => successResponse(res, await portal.getAlbum(ctxOf(req), req.params.id)));
export const createAlbum = wrap(async (req, res) => successResponse(res, await portal.createAlbum(ctxOf(req), req.body), 'Album created', 201));
export const updateAlbum = wrap(async (req, res) => successResponse(res, await portal.updateAlbum(ctxOf(req), req.params.id, req.body), 'Album saved'));
export const deleteAlbum = wrap(async (req, res) => successResponse(res, await portal.deleteAlbum(ctxOf(req), req.params.id), 'Album deleted'));
export const addAlbumPhoto = wrap(async (req, res) =>
  successResponse(res, await portal.addAlbumPhoto(ctxOf(req), req.params.id, req.body), 'Photo added', 201),
);
export const updateAlbumPhoto = wrap(async (req, res) =>
  successResponse(res, await portal.updateAlbumPhoto(ctxOf(req), req.params.id, req.params.photoId, req.body), 'Photo saved'),
);
export const deleteAlbumPhoto = wrap(async (req, res) =>
  successResponse(res, await portal.deleteAlbumPhoto(ctxOf(req), req.params.id, req.params.photoId), 'Photo removed'),
);
export const reorderAlbumPhotos = wrap(async (req, res) =>
  successResponse(res, await portal.reorderAlbumPhotos(ctxOf(req), req.params.id, req.body.ids), 'Order saved'),
);

// ── Admin: downloads ─────────────────────────────────────────────────────────

export const listDownloads = wrap(async (req, res) => paged(res, await portal.listDownloads(ctxOf(req), q(req)), req));
export const createDownload = wrap(async (req, res) => successResponse(res, await portal.createDownload(ctxOf(req), req.body), 'Download added', 201));
export const updateDownload = wrap(async (req, res) =>
  successResponse(res, await portal.updateDownload(ctxOf(req), req.params.id, req.body), 'Download saved'),
);
export const deleteDownload = wrap(async (req, res) => successResponse(res, await portal.deleteDownload(ctxOf(req), req.params.id), 'Download removed'));

// ── Admin: admission circulars ───────────────────────────────────────────────

export const listAdmissions = wrap(async (req, res) => paged(res, await portal.listAdmissions(ctxOf(req), q(req)), req));
export const getAdmission = wrap(async (req, res) => successResponse(res, await portal.getAdmission(ctxOf(req), req.params.id)));
export const createAdmission = wrap(async (req, res) =>
  successResponse(res, await portal.createAdmission(ctxOf(req), req.body), 'Admission circular created', 201),
);
export const updateAdmission = wrap(async (req, res) =>
  successResponse(res, await portal.updateAdmission(ctxOf(req), req.params.id, req.body), 'Admission circular saved'),
);
export const deleteAdmission = wrap(async (req, res) =>
  successResponse(res, await portal.deleteAdmission(ctxOf(req), req.params.id), 'Admission circular deleted'),
);

// ── Public: data sources ─────────────────────────────────────────────────────

const dataHandler = (fn: (req: Request) => Promise<unknown>, seconds = 120) =>
  wrap(async (req, res) => {
    const r = await fn(req);
    cache(res, Boolean(previewOf(req)), seconds);
    successResponse(res, r);
  });

export const dataProfile = dataHandler((req) => publicPortal.profile(req.params.siteId, previewOf(req)), 600);
export const dataStaff = dataHandler((req) => publicPortal.staff(req.params.siteId, q(req).category, previewOf(req)), 600);
export const dataClassStats = dataHandler((req) => publicPortal.classStats(req.params.siteId, previewOf(req)), 600);
export const dataSubjects = dataHandler((req) => publicPortal.subjects(req.params.siteId, q(req).class, previewOf(req)), 600);
export const dataExamRoutine = dataHandler((req) => publicPortal.examRoutine(req.params.siteId, q(req), previewOf(req)), 300);
export const dataResultSummary = dataHandler((req) => publicPortal.resultSummary(req.params.siteId, q(req).examId, previewOf(req)), 300);
export const dataResultsArchive = dataHandler((req) => publicPortal.resultsArchive(req.params.siteId, previewOf(req)), 300);
export const dataFeeChart = dataHandler((req) => publicPortal.feeChart(req.params.siteId, previewOf(req)), 600);
export const dataHolidays = dataHandler((req) => publicPortal.holidays(req.params.siteId, q(req).year, previewOf(req)), 3600);
export const dataLibrary = dataHandler((req) => publicPortal.library(req.params.siteId, q(req), previewOf(req)), 300);
export const dataTransport = dataHandler((req) => publicPortal.transport(req.params.siteId, previewOf(req)), 600);
export const dataBranches = dataHandler((req) => publicPortal.branches(req.params.siteId, previewOf(req)), 600);
export const dataCommittee = dataHandler((req) => publicPortal.committee(req.params.siteId, previewOf(req)), 600);
export const dataDownloads = dataHandler((req) => publicPortal.downloads(req.params.siteId, q(req).category, previewOf(req)), 300);
export const dataNoticeDetail = dataHandler((req) => publicPortal.noticeDetail(req.params.siteId, req.params.id, previewOf(req)), 120);

export const dataAlbums = wrap(async (req, res) => {
  const r = await publicPortal.albums(req.params.siteId, q(req), previewOf(req));
  cache(res, r.preview, 300);
  paged(res, r, req);
});
export const dataAlbumDetail = wrap(async (req, res) => {
  const r = await publicPortal.albumDetail(req.params.siteId, req.params.id, previewOf(req));
  cache(res, r.preview, 300);
  successResponse(res, r);
});
export const dataAdmissions = wrap(async (req, res) => {
  const r = await publicPortal.admissions(req.params.siteId, q(req), previewOf(req));
  cache(res, r.preview, 120);
  paged(res, r, req);
});
export const dataAdmissionDetail = wrap(async (req, res) => {
  const r = await publicPortal.admissionDetail(req.params.siteId, req.params.id, previewOf(req));
  cache(res, r.preview, 120);
  successResponse(res, r);
});
