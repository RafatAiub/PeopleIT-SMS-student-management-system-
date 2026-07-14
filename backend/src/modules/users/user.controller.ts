import { Request, Response, NextFunction } from 'express';
import { UserService } from './user.service';
import { successResponse, paginatedResponse } from '../../utils/response';
import { UserRole } from '@prisma/client';

export class UserController {
  static async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.createUser(req.tenantId!, req.body);
      return successResponse(res, user, 'User created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.getUser(req.tenantId!, req.params.id);
      return successResponse(res, user, 'User retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 10;
      const search = req.query.search as string;
      const { total, users } = await UserService.listUsers(req.tenantId!, {
        role: req.query.role as UserRole,
        search,
        page,
        pageSize,
      });
      return paginatedResponse(res, users, total, page, pageSize, 'Users retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.updateUser(req.tenantId!, req.params.id, req.body);
      return successResponse(res, user, 'User updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      await UserService.changePassword(req.tenantId!, req.user!.sub, req.body);
      return successResponse(res, null, 'Password changed successfully');
    } catch (error) {
      next(error);
    }
  }

  static async searchUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const q = req.query.q as string;
      if (!q || q.length < 2) {
        return successResponse(res, [], 'Search query must be at least 2 characters');
      }
      
      const { prisma } = require('../../config/prisma');
      const users = await prisma.user.findMany({
        where: {
          institutionId: req.tenantId!,
          isActive: true,
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          avatarUrl: true,
        },
        take: 20,
      });
      return successResponse(res, users, 'Users searched successfully');
    } catch (error) {
      next(error);
    }
  }

  static async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      await UserService.deleteUser(req.tenantId!, req.params.id);
      return successResponse(res, null, 'User deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}
