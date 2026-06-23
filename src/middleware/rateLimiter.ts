import rateLimit from 'express-rate-limit';
import { Request } from 'express';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // single-user system, high limit to prevent false blocks
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000, // auth endpoints - single-user system
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

/**
 * Per-user limiter for routes that send real outbound communications (TBI gap G8).
 * The global apiLimiter (10k/15min) is far too loose to bound a retry-storm or a
 * runaway loop that would exhaust the Mandrill quota or spam recipients. A human
 * operator triggering sends never approaches 40 per 5 minutes; a bug or replay does.
 * Keyed by authenticated user id (falling back to IP) so one account cannot evade it.
 * Override the ceiling per-environment with SEND_RATE_LIMIT_MAX.
 */
export const sendLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: Number(process.env.SEND_RATE_LIMIT_MAX) || 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.userId || req.ip || 'unknown',
  message: {
    error: 'Send rate limit exceeded. Slow down or wait a few minutes before sending again.',
    code: 'SEND_RATE_LIMIT_EXCEEDED',
  },
});
