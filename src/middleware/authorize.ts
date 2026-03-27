import { Request, Response, NextFunction } from 'express';
import { AuthenticationError, AuthorizationError } from './errors';
import { hasPermission } from '../config/roles';

export function authorize(...requiredPermissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    const userRole = req.user.role;

    for (const permission of requiredPermissions) {
      if (!hasPermission(userRole, permission)) {
        return next(
          new AuthorizationError(
            `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
          ),
        );
      }
    }

    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AuthorizationError(`Role ${req.user.role} is not authorized`));
    }

    next();
  };
}
