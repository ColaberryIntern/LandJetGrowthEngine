import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from './errors';
import { SystemSetting } from '../models/SystemSetting';
import { logger } from '../config/logger';

/**
 * Middleware to check if the governance engine is enabled.
 * Returns 403 Forbidden if governance is disabled.
 * Used on routes that require governance approval (e.g., autonomous decisions).
 */
export function requireGovernance() {
  return async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      const setting = await SystemSetting.findByPk('governance.enabled');
      const enabled = setting ? (setting.value as any) !== false : true; // default enabled

      if (!enabled) {
        throw new ForbiddenError('Governance engine is disabled. Contact administrator to enable.');
      }

      next();
    } catch (error) {
      if (error instanceof ForbiddenError) {
        logger.warn('Governance check failed: engine disabled');
        return next(error);
      }
      logger.error('Governance check error', { error: (error as Error).message });
      next(error);
    }
  };
}
