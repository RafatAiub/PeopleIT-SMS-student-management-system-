import { Response } from 'express';

// =============================================================================
// Standardized API Response Helpers
// =============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Send a successful response
 */
export function successResponse<T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200,
): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  } satisfies ApiResponse<T>);
}

/**
 * Send an error response
 */
export function errorResponse(
  res: Response,
  message: string,
  statusCode = 500,
  errors?: unknown,
): Response {
  const body: ApiResponse = {
    success: false,
    message,
  };
  if (errors !== undefined) {
    body.errors = errors;
  }
  return res.status(statusCode).json(body);
}

/**
 * Send a paginated list response
 */
export function paginatedResponse<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  pageSize: number,
  message = 'Success',
): Response {
  const totalPages = Math.ceil(total / pageSize);
  return res.status(200).json({
    success: true,
    message,
    data,
    meta: {
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  } satisfies ApiResponse<T[]>);
}
