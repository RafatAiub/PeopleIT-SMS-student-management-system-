import { Request, Response, NextFunction } from 'express';
import { FeeService } from './fee.service';
import { successResponse, paginatedResponse } from '../../utils/response';

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
      const categories = await FeeService.listCategories(req.tenantId!);
      return successResponse(res, categories, 'Fee categories retrieved successfully');
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
      const { total, invoices } = await FeeService.listInvoices(req.tenantId!, {
        studentId: req.query.studentId as string,
        status: req.query.status as string,
        search,
        page,
        pageSize,
      }, req.user!);
      return paginatedResponse(res, invoices, total, page, pageSize, 'Invoices retrieved successfully');
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
      const { method, callbackUrl } = req.body;
      const paymentResult = await FeeService.initiateOnlinePayment(
        req.tenantId!,
        req.params.id,
        method,
        callbackUrl,
        req.user!
      );
      return successResponse(res, paymentResult, 'Online payment initiated successfully');
    } catch (error) {
      next(error);
    }
  }
}
