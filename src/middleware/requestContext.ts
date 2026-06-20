import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';

/**
 * Request-scoped context (closes audit gaps G6/G5): a traceId + userId that
 * propagate through every service + LLM call + audit entry without threading
 * params. traceId is the per-request id from requestIdMiddleware; userId is
 * filled in by the auth middleware once it resolves (the store object is
 * mutated in place so later middleware can set it).
 */
export interface RequestCtx {
  traceId?: string;
  userId?: string | null;
}

const als = new AsyncLocalStorage<RequestCtx>();

export function getContext(): RequestCtx {
  return als.getStore() || {};
}

/** Set/replace fields on the current request's context (no-op outside a request). */
export function setContext(patch: Partial<RequestCtx>): void {
  const store = als.getStore();
  if (store) Object.assign(store, patch);
}

/** App-level middleware: open an ALS scope for the rest of the request. */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const traceId = (req.headers['x-request-id'] as string) || undefined;
  als.run({ traceId, userId: null }, () => next());
}
