import { Request, Response, NextFunction } from 'express';
import * as leaveService from './leave.service';
import { successResponse, paginatedResponse } from '../../utils/response';

// --- Leave Types ---

export async function createLeaveType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const leaveType = await leaveService.createLeaveType(req.tenantId!, req.body);
    successResponse(res, leaveType, 'Leave type created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function listLeaveTypes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const leaveTypes = await leaveService.listLeaveTypes(req.tenantId!, req.query as any);
    successResponse(res, leaveTypes);
  } catch (error) {
    next(error);
  }
}

export async function updateLeaveType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const leaveType = await leaveService.updateLeaveType(req.tenantId!, req.params.id, req.body);
    successResponse(res, leaveType, 'Leave type updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteLeaveType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await leaveService.deleteLeaveType(req.tenantId!, req.params.id);
    successResponse(res, null, 'Leave type deleted successfully');
  } catch (error) {
    next(error);
  }
}

// --- Leave Requests ---

export async function createLeaveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const leaveRequest = await leaveService.createLeaveRequest(req.tenantId!, req.user!.sub, req.user!.role, req.body);
    successResponse(res, leaveRequest, 'Leave request submitted successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function listAllLeaveRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as any;
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const { requests, total } = await leaveService.listAllLeaveRequests(req.tenantId!, query);
    paginatedResponse(res, requests, total, page, pageSize);
  } catch (error) {
    next(error);
  }
}

export async function listMyLeaveRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as any;
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const { requests, total } = await leaveService.listMyLeaveRequests(req.tenantId!, req.user!.sub, query);
    paginatedResponse(res, requests, total, page, pageSize);
  } catch (error) {
    next(error);
  }
}

export async function getLeaveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const leaveRequest = await leaveService.getLeaveRequest(
      req.tenantId!,
      req.user!.sub,
      req.user!.role,
      req.params.id,
    );
    successResponse(res, leaveRequest);
  } catch (error) {
    next(error);
  }
}

export async function getLeaveReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { applicantUserId, year } = req.query as any;
    const report = await leaveService.getLeaveReport(req.tenantId!, applicantUserId, year);
    successResponse(res, report);
  } catch (error) {
    next(error);
  }
}

export async function deleteLeaveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await leaveService.deleteLeaveRequest(req.tenantId!, req.params.id);
    successResponse(res, null, 'Leave request deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function cancelLeaveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const leaveRequest = await leaveService.cancelLeaveRequest(req.tenantId!, req.user!.sub, req.params.id);
    successResponse(res, leaveRequest, 'Leave request cancelled successfully');
  } catch (error) {
    next(error);
  }
}

export async function approveLeaveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const leaveRequest = await leaveService.approveLeaveRequest(
      req.tenantId!,
      req.user!.sub,
      req.params.id,
      req.body.reviewerComment,
    );
    successResponse(res, leaveRequest, 'Leave request approved successfully');
  } catch (error) {
    next(error);
  }
}

export async function rejectLeaveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const leaveRequest = await leaveService.rejectLeaveRequest(
      req.tenantId!,
      req.user!.sub,
      req.params.id,
      req.body.reviewerComment,
    );
    successResponse(res, leaveRequest, 'Leave request rejected successfully');
  } catch (error) {
    next(error);
  }
}
