import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { LoginDto, RefreshDto, LogoutDto } from './auth.dto';
import {
  loginController,
  refreshController,
  logoutController,
} from './auth.controller';

// =============================================================================
// Auth Routes
// POST /api/v1/auth/login
// POST /api/v1/auth/refresh
// POST /api/v1/auth/logout
// =============================================================================

const router = Router();

// Login — validate body, no auth required
router.post('/login', validate({ body: LoginDto }), loginController);

// Refresh access token — no auth required (uses refresh token)
router.post('/refresh', validate({ body: RefreshDto }), refreshController);

// Logout — revoke refresh token
router.post('/logout', validate({ body: LogoutDto }), logoutController);

export default router;
