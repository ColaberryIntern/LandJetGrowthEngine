import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

const SLOW_THRESHOLD_MS = 2000;
const MAX_ENTRIES = 1000;

interface RequestMetric {
  path: string;
  method: string;
  status: number;
  duration: number;
  timestamp: number;
}

const metrics: RequestMetric[] = [];

export function requestTimingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    // Store metric
    metrics.push({
      path: req.route?.path || req.path,
      method: req.method,
      status: res.statusCode,
      duration,
      timestamp: start,
    });

    // Keep ring buffer bounded
    if (metrics.length > MAX_ENTRIES) {
      metrics.splice(0, metrics.length - MAX_ENTRIES);
    }

    // Log slow requests
    if (duration > SLOW_THRESHOLD_MS) {
      logger.warn('Slow request', {
        path: req.path,
        method: req.method,
        duration,
        status: res.statusCode,
      });
    }
  });

  next();
}

export interface PerformanceSummary {
  total_requests: number;
  avg_duration_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  slow_requests: number;
  slowest_endpoints: { path: string; method: string; avg_ms: number; count: number }[];
  requests_per_minute: number;
}

export function getPerformanceSummary(): PerformanceSummary {
  if (metrics.length === 0) {
    return {
      total_requests: 0, avg_duration_ms: 0, p50_ms: 0, p95_ms: 0, p99_ms: 0,
      slow_requests: 0, slowest_endpoints: [], requests_per_minute: 0,
    };
  }

  const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
  const total = durations.length;

  const p = (pct: number) => durations[Math.min(Math.floor(total * pct), total - 1)];

  // Group by endpoint
  const groups = new Map<string, { total: number; count: number }>();
  for (const m of metrics) {
    const key = `${m.method} ${m.path}`;
    const g = groups.get(key) || { total: 0, count: 0 };
    g.total += m.duration;
    g.count++;
    groups.set(key, g);
  }

  const slowestEndpoints = Array.from(groups.entries())
    .map(([key, g]) => {
      const [method, ...pathParts] = key.split(' ');
      return { path: pathParts.join(' '), method, avg_ms: Math.round(g.total / g.count), count: g.count };
    })
    .sort((a, b) => b.avg_ms - a.avg_ms)
    .slice(0, 10);

  // Requests per minute (based on time range in buffer)
  const timeRange = metrics.length > 1
    ? (metrics[metrics.length - 1].timestamp - metrics[0].timestamp) / 60000
    : 1;
  const rpm = timeRange > 0 ? Math.round(total / timeRange) : total;

  return {
    total_requests: total,
    avg_duration_ms: Math.round(durations.reduce((a, b) => a + b, 0) / total),
    p50_ms: p(0.5),
    p95_ms: p(0.95),
    p99_ms: p(0.99),
    slow_requests: durations.filter(d => d > SLOW_THRESHOLD_MS).length,
    slowest_endpoints: slowestEndpoints,
    requests_per_minute: rpm,
  };
}
