import { Request, Response, NextFunction } from 'express';
import { AppError } from './errors';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.headers['x-request-id'] as string | undefined;

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(requestId && { requestId }),
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    code: 'INTERNAL_ERROR',
    ...(requestId && { requestId }),
    ...(process.env.NODE_ENV !== 'production' && { message: err.message }),
  });
}
