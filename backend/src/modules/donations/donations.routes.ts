import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { UserRole } from '@prisma/client';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireTenant } from '../../middleware/requireTenant.middleware';
import { requireModule } from '../../middleware/requireModule.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import * as c from './donations.controller';
import {
  CreateCampaignDto,
  CreateDisbursementDto,
  CreateDonorDto,
  CreateFundDto,
  CreateRecurringDto,
  DisbursementQueryDto,
  DonationPayCallbackParamDto,
  DonationQueryDto,
  DonorQueryDto,
  IdParamDto,
  PublicCreateDonationDto,
  PublicDemoPayDto,
  PublicDonationParamDto,
  PublicSiteParamDto,
  RecordDonationDto,
  RecurringQueryDto,
  RefundDonationDto,
  RemindDto,
  ReportQueryDto,
  UpdateCampaignDto,
  UpdateDonorDto,
  UpdateFundDto,
  UpdateRecurringDto,
} from './donations.dto';

// =============================================================================
// Donations, Zakat & Sadaqah (T1) — /api/v1/donations
// Every route: authenticate → setTenant → requireTenant →
// requireModule('islamic.donations') → auditLog. Staff routes are ADMIN /
// ACCOUNTANT (and a super admin in a support session); /mine is the
// guardian portal's "My donations" for any signed-in user.
// =============================================================================

export const donationsRouter = Router();
donationsRouter.use(authenticate, setTenant, requireTenant, requireModule('islamic.donations'), auditLog);

// Guardian / any signed-in user: own donations (donor profile linked to the user).
donationsRouter.get('/mine', c.myDonations);
donationsRouter.get('/mine/:id/receipt', validate({ params: IdParamDto }), c.myReceipt);

const STAFF = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT);
const id = validate({ params: IdParamDto });

// Dashboard widget + reports
donationsRouter.get('/summary', STAFF, c.summary);
donationsRouter.get('/reports/summary', STAFF, validate({ query: ReportQueryDto }), c.report);

// Funds
donationsRouter.get('/funds', STAFF, c.listFunds);
donationsRouter.post('/funds', STAFF, validate({ body: CreateFundDto }), c.createFund);
donationsRouter.put('/funds/:id', STAFF, id, validate({ body: UpdateFundDto }), c.updateFund);
donationsRouter.delete('/funds/:id', STAFF, id, c.deleteFund);

// Donors
donationsRouter.get('/donors', STAFF, validate({ query: DonorQueryDto }), c.listDonors);
donationsRouter.post('/donors', STAFF, validate({ body: CreateDonorDto }), c.createDonor);
donationsRouter.get('/donors/:id', STAFF, id, c.getDonor);
donationsRouter.put('/donors/:id', STAFF, id, validate({ body: UpdateDonorDto }), c.updateDonor);
donationsRouter.delete('/donors/:id', STAFF, id, c.deleteDonor);

// Campaigns
donationsRouter.get('/campaigns', STAFF, c.listCampaigns);
donationsRouter.post('/campaigns', STAFF, validate({ body: CreateCampaignDto }), c.createCampaign);
donationsRouter.put('/campaigns/:id', STAFF, id, validate({ body: UpdateCampaignDto }), c.updateCampaign);
donationsRouter.delete('/campaigns/:id', STAFF, id, c.deleteCampaign);

// Monthly pledges
donationsRouter.get('/recurring', STAFF, validate({ query: RecurringQueryDto }), c.listRecurring);
donationsRouter.post('/recurring', STAFF, validate({ body: CreateRecurringDto }), c.createRecurring);
donationsRouter.post('/recurring/remind', STAFF, validate({ body: RemindDto }), c.remindRecurring);
donationsRouter.put('/recurring/:id', STAFF, id, validate({ body: UpdateRecurringDto }), c.updateRecurring);
donationsRouter.delete('/recurring/:id', STAFF, id, c.deleteRecurring);

// Disbursements (money paid out of a fund)
donationsRouter.get('/disbursements', STAFF, validate({ query: DisbursementQueryDto }), c.listDisbursements);
donationsRouter.post('/disbursements', STAFF, validate({ body: CreateDisbursementDto }), c.createDisbursement);
donationsRouter.delete('/disbursements/:id', STAFF, id, c.deleteDisbursement);

// Donation records
donationsRouter.get('/records', STAFF, validate({ query: DonationQueryDto }), c.listDonations);
donationsRouter.get('/records/export.csv', STAFF, validate({ query: DonationQueryDto.partial() }), c.exportCsv);
donationsRouter.post('/records', STAFF, validate({ body: RecordDonationDto }), c.recordDonation);
donationsRouter.get('/records/:id', STAFF, id, c.getDonation);
donationsRouter.get('/records/:id/receipt', STAFF, id, c.getReceipt);
donationsRouter.post('/records/:id/refund', STAFF, id, validate({ body: RefundDonationDto }), c.refundDonation);
donationsRouter.post('/records/:id/email-receipt', STAFF, id, c.emailReceipt);

// =============================================================================
// Public website giving — mounted onto publicSitesRouter (sites.routes.ts),
// so the URLs are /api/v1/public/sites/:siteId/donations/... and inherit its
// read limiter and CORS exemption. 404 when the school has the module off.
// =============================================================================

const isDev = env.NODE_ENV === 'development';
const limiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max: isDev ? Math.max(max, 1000) : max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    skip: () => env.NODE_ENV === 'test',
  });
const createLimiter = limiter(15 * 60 * 1000, 20, 'Too many donation attempts from this IP, please try again later');
const demoLimiter = limiter(15 * 60 * 1000, 20, 'Too many demo payments from this IP, please try again later');

export const donationsPublicRouter = Router();

// Gateway callbacks: 4 segments, so they never collide with the shop's /pay/:gateway/:kind.
donationsPublicRouter.get('/pay/donation/:gateway/:kind', validate({ params: DonationPayCallbackParamDto }), c.payCallback);
donationsPublicRouter.post('/pay/donation/:gateway/:kind', validate({ params: DonationPayCallbackParamDto }), c.payCallback);

donationsPublicRouter.get('/:siteId/donations/options', validate({ params: PublicSiteParamDto }), c.publicOptions);
donationsPublicRouter.post('/:siteId/donations', createLimiter, validate({ params: PublicSiteParamDto, body: PublicCreateDonationDto }), c.publicCreate);
donationsPublicRouter.get('/:siteId/donations/:reference', validate({ params: PublicDonationParamDto }), c.publicGet);
donationsPublicRouter.post(
  '/:siteId/donations/:reference/demo-pay',
  demoLimiter,
  validate({ params: PublicDonationParamDto, body: PublicDemoPayDto }),
  c.publicDemoPay,
);

export default donationsRouter;
