import { Request, Response, NextFunction } from 'express';
import * as billingService from './billing.service';
import { successResponse, paginatedResponse } from '../../utils/response';
import { logger } from '../../utils/logger';

// ── Tenant-admin ──────────────────────────────────────────────────────────

export async function getPlans(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const plans = await billingService.getPlans();
    successResponse(res, plans);
  } catch (error) {
    next(error);
  }
}

export async function getMySubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const subscription = await billingService.getMySubscription(req.tenantId!);
    successResponse(res, subscription);
  } catch (error) {
    next(error);
  }
}

export async function initiateCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await billingService.initiateCheckout(
      req.tenantId!,
      req.user!.sub,
      req.user!.email,
      req.body,
    );
    successResponse(res, result, 'Checkout session initiated');
  } catch (error) {
    next(error);
  }
}

export async function getMyPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payments = await billingService.getMyPayments(req.tenantId!);
    successResponse(res, payments);
  } catch (error) {
    next(error);
  }
}

export async function getPaymentReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await billingService.getPaymentReceipt(req.tenantId!, req.params.paymentId);
    successResponse(res, payment);
  } catch (error) {
    next(error);
  }
}

// ── Super-admin ───────────────────────────────────────────────────────────

export async function listAllPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const plans = await billingService.listAllPlans();
    successResponse(res, plans);
  } catch (error) {
    next(error);
  }
}

export async function createPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const plan = await billingService.createPlan(req.body);
    successResponse(res, plan, 'Plan created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const plan = await billingService.updatePlan(req.params.id, req.body);
    successResponse(res, plan, 'Plan updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function archivePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const plan = await billingService.archivePlan(req.params.id);
    successResponse(res, plan, 'Plan archived successfully');
  } catch (error) {
    next(error);
  }
}

export async function setPlanPrice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const price = await billingService.setPlanPrice(req.params.id, req.body);
    successResponse(res, price, 'Plan price updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function listSubscriptions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await billingService.listSubscriptions({
      page: req.query.page as any,
      pageSize: req.query.pageSize as any,
      status: req.query.status as any,
      planId: req.query.planId as any,
      q: req.query.q as any,
    });
    paginatedResponse(res, result.data, result.total, result.page, result.pageSize, 'Subscriptions retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getSubscriptionDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const detail = await billingService.getSubscriptionDetail(req.params.institutionId);
    successResponse(res, detail);
  } catch (error) {
    next(error);
  }
}

export async function manualOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await billingService.manualOverride(req.user!.sub, req.params.institutionId, req.body);
    successResponse(res, result, 'Subscription override applied successfully');
  } catch (error) {
    next(error);
  }
}

export async function generatePaymentLink(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await billingService.generatePaymentLinkForInstitution(
      req.user!.sub,
      req.params.institutionId,
      req.body,
    );
    successResponse(res, result, 'Payment link generated successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getPaymentReceiptAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await billingService.getPaymentReceiptAdmin(req.params.paymentId);
    successResponse(res, payment);
  } catch (error) {
    next(error);
  }
}

export async function initiateRefund(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await billingService.initiateRefund(req.user!.sub, req.params.paymentId, req.body);
    successResponse(res, result, 'Refund initiated successfully');
  } catch (error) {
    next(error);
  }
}

export async function queryRefundStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await billingService.queryRefundStatus(req.params.paymentId);
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
}

export async function getAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await billingService.getBillingAnalytics(req.query as any);
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
}

// ── Public gateway callbacks ──────────────────────────────────────────────

export async function handleIpn(req: Request, res: Response, _next: NextFunction): Promise<void> {
  try {
    await billingService.handleIpn(req.body);
  } catch (error) {
    // Never let an unhandled crediting error prevent a 2xx ack — SSLCommerz
    // will otherwise treat this as a failed delivery and keep retrying.
    logger.error('Unhandled error while processing billing IPN', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    res.status(200).json({ success: true });
  }
}

export async function handleSuccessRedirect(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const url = await billingService.handleRedirect('success', { ...req.query, ...req.body });
    res.redirect(url);
  } catch (error) {
    next(error);
  }
}

export async function handleFailRedirect(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const url = await billingService.handleRedirect('fail', { ...req.query, ...req.body });
    res.redirect(url);
  } catch (error) {
    next(error);
  }
}

export async function handleCancelRedirect(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const url = await billingService.handleRedirect('cancel', { ...req.query, ...req.body });
    res.redirect(url);
  } catch (error) {
    next(error);
  }
}
