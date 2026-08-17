import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { TokenParamDto } from './idcard.dto';
import * as idCardController from './idcard.controller';

// =============================================================================
// Public ID Card Verification Route — mounted at /api/v1/id-cards
// GET /verify/:token
//
// Deliberately PUBLIC (no authenticate/setTenant/auditLog) — anyone scanning
// the QR code on a physical card must be able to confirm identity + validity
// without logging in. getVerifyInfo() in idcard.service.ts only returns a
// minimal, non-PII payload (name, photo, class/designation, card status).
// =============================================================================

const router = Router();

router.get('/verify/:token', validate({ params: TokenParamDto }), idCardController.verifyCard);

export default router;
