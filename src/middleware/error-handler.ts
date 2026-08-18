import { Request, Response, NextFunction } from 'express';
import { logger } from '../infrastructure/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof AppError) {
    logger.warn(`⚠️ خطأ في التطبيق: ${err.message} (${err.statusCode})`);
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        status: err.statusCode
      }
    });
  }

  logger.error('❌ خطأ غير متوقع:', err);
  return res.status(500).json({
    error: {
      message: 'حدث خطأ غير متوقع',
      status: 500
    }
  });
}
