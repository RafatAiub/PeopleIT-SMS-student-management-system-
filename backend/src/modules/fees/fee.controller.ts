import { Request, Response, NextFunction } from 'express';
import { FeeService } from './fee.service';
import { successResponse, paginatedResponse } from '../../utils/response';
import * as onlinePayments from './online/onlinePayment.service';
import { getPaymentReceipt } from './receipts/receipt.service';
import * as bulkService from './bulk/bulk.service';
import { markOverdueInvoices } from './overdue/overdue.service';
import { listReconciliation, type ReconciliationQuery } from './reconciliation/reconciliation.service';

export class FeeController {
  static async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await FeeService.createCategory(req.tenantId!, req.body);
      return successResponse(res, category, 'Fee category created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await FeeService.updateCategory(req.tenantId!, req.params.id, req.body);
      return successResponse(res, category, 'Fee category updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async listCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const { categories, summary } = await FeeService.listCategories(req.tenantId!, includeInactive);
      return res.status(200).json({
        success: true,
        message: 'Fee categories retrieved successfully',
        data: categories,
        summary,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteCategory(req: Request, res: Response, next: NextFunction) {
    try {
      await FeeService.deleteCategory(req.tenantId!, req.params.id);
      return successResponse(res, null, 'Fee category deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  static async createInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const invoice = await FeeService.createInvoice(req.tenantId!, req.body);
      return successResponse(res, invoice, 'Invoice created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async getInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const invoice = await FeeService.getInvoice(req.tenantId!, req.params.id, req.user!);
      return successResponse(res, invoice, 'Invoice retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async listInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 10;
      const search = req.query.search as string;
      const { total, invoices, summary } = await FeeService.listInvoices(req.tenantId!, {
        studentId: req.query.studentId as string,
        status: req.query.status as string,
        search,
        page,
        pageSize,
      }, req.user!);
      return paginatedResponse(res, invoices, total, page, pageSize, 'Invoices retrieved successfully', { summary });
    } catch (error) {
      next(error);
    }
  }

  static async recordOfflinePayment(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await FeeService.recordOfflinePayment(
        req.tenantId!,
        req.params.id,
        req.user!.sub,
        req.body
      );
      return successResponse(res, payment, 'Offline payment recorded successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async initiateOnlinePayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { method, callbackUrl, amount } = req.body;
      const paymentResult = await FeeService.initiateOnlinePayment(
        req.tenantId!,
        req.params.id,
        { method, callbackUrl, amount },
        req.user!
      );
      return successResponse(res, paymentResult, 'Online payment initiated successfully');
    } catch (error) {
      next(error);
    }
  }

  // -- Wave C -----------------------------------------------------------------

  static async listGateways(_req: Request, res: Response, next: NextFunction) {
    try {
      const gateways = onlinePayments.listGatewayModes();
      return successResponse(res, { gateways, demo: gateways.some((g) => g.demo) }, 'Payment gateways retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async getOnlineTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const txn = await onlinePayments.getTransaction(req.tenantId!, req.params.txnId, req.user!, FeeService.assertInvoiceAccess);
      return successResponse(res, txn, 'Payment transaction retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async confirmDemoTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await onlinePayments.confirmDemoTransaction(
        req.tenantId!,
        req.params.txnId,
        req.body.outcome,
        req.user!,
        FeeService.assertInvoiceAccess,
      );
      return successResponse(res, result, result.status === 'SUCCESS' ? 'Demo payment simulated successfully' : 'Demo payment marked as failed');
    } catch (error) {
      next(error);
    }
  }

  static async getReceipt(req: Request, res: Response, next: NextFunction) {
    try {
      const receipt = await getPaymentReceipt(req.tenantId!, req.params.paymentId, req.user!, FeeService.assertInvoiceAccess);
      return successResponse(res, receipt, 'Receipt retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async previewBulkInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      return successResponse(res, await bulkService.previewBulkInvoices(req.tenantId!, req.body), 'Bulk invoice preview');
    } catch (error) {
      next(error);
    }
  }

  static async generateBulkInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await bulkService.generateBulkInvoices(req.tenantId!, req.user!.sub, req.body);
      return successResponse(res, result, `${result.createdCount} invoice(s) generated`, 201);
    } catch (error) {
      next(error);
    }
  }

  static async listInvoiceBatches(req: Request, res: Response, next: NextFunction) {
    try {
      const q = req.query as unknown as { page: number; pageSize: number };
      return successResponse(res, await bulkService.listBatches(req.tenantId!, q), 'Invoice batches retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async markOverdue(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await markOverdueInvoices({ institutionId: req.tenantId! });
      return successResponse(res, result, `${result.updated} invoice(s) marked overdue`);
    } catch (error) {
      next(error);
    }
  }

  static async reconciliation(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await listReconciliation(req.tenantId!, req.query as unknown as ReconciliationQuery);
      return successResponse(res, result, 'Reconciliation retrieved');
    } catch (error) {
      next(error);
    }
  }
}
